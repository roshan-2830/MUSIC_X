import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

# Supabase issues tokens from "<project-url>/auth/v1" and signs them with the
# project's asymmetric (ES256) key. We verify them against the public keys it
# publishes at the JWKS URL below — no shared secret needed.
_ISSUER = f"{settings.supabase_url.rstrip('/')}/auth/v1"
_JWKS_URL = f"{_ISSUER}/.well-known/jwks.json"
_AUDIENCE = "authenticated"

# Fetches + caches Supabase's public signing keys (looked up by the token's key id).
_jwks_client = jwt.PyJWKClient(_JWKS_URL)

_bearer = HTTPBearer(auto_error=True)


def _verify(token: str) -> dict:
    """Verify a Supabase access token and return its claims, or raise 401."""
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience=_AUDIENCE,
            issuer=_ISSUER,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """Verify the caller's Supabase access token; return their user id (JWT 'sub').

    Any route that depends on this becomes 'login required' — a missing, expired,
    or invalid token yields 401.
    """
    payload = _verify(creds.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")
    return user_id


def get_current_user_claims(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """The whole verified claim set, for the one thing that needs more than the id.

    Sign-up writes the person's name into Supabase `user_metadata`, and Supabase puts that
    into the access token. Reading it here means a new profile can be created with a real
    name already on it, rather than the client having to remember to send one in a second
    call that might never arrive.
    """
    return _verify(creds.credentials)


def display_name_from_claims(claims: dict) -> str | None:
    """The name the person typed at sign-up, if it is there.

    Only user_metadata is consulted, never the email. Deriving a name from an address is
    what produced profiles called "roshanjadhav2830" — which then showed up in the Me tab
    and in invite search as if it were a name.
    """
    meta = claims.get("user_metadata") or {}
    for key in ("display_name", "full_name", "name"):
        v = (meta.get(key) or "").strip() if isinstance(meta.get(key), str) else None
        if v:
            return v[:60]
    return None

def require_admin(user_id: str = Depends(get_current_user_id)) -> str:
    """Admin-only. Verifies the caller is a logged-in user AND on the admin allowlist.

    /admin/* is not the same kind of endpoint as the rest of the API: one call to
    /admin/refresh re-verifies the whole catalogue against Ticketmaster, and /admin/enrich
    walks thousands of artists. "Any account with a valid token" was a fine gate while the
    only account was ours; once anyone can sign up it means any visitor can spend the day's
    quota on our behalf.

    Empty allowlist DENIES everyone, deliberately. If ADMIN_USER_IDS fails to load in
    production, the safe failure is that we lose access to our own admin routes — not that
    the internet gains them.
    """
    allowed = {u.strip() for u in settings.admin_user_ids.split(",") if u.strip()}
    if user_id not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user_id
