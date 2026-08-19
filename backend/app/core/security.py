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


def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """Verify the caller's Supabase access token; return their user id (JWT 'sub').

    Any route that depends on this becomes 'login required' — a missing, expired,
    or invalid token yields 401.
    """
    token = creds.credentials
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
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

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")
    return user_id