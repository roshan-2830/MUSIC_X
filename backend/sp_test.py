import base64
import httpx

from app.core.config import settings

auth = base64.b64encode(f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()).decode()
tok = httpx.post("https://accounts.spotify.com/api/token",
    headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
    data={"grant_type": "client_credentials"}, timeout=30)
tok.raise_for_status()
token = tok.json()["access_token"]

r = httpx.get("https://api.spotify.com/v1/search",
    headers={"Authorization": f"Bearer {token}"},
    params={"q": "Coldplay", "type": "artist", "limit": 1}, timeout=30)
r.raise_for_status()
a = r.json()["artists"]["items"][0]
print(f"Spotify OK — {a['name']}: popularity={a['popularity']}/100 | genres={a['genres']}")
