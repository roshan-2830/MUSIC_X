"""Last.fm — similarity from what people actually listen to.

Our own similar-artist signal is who shares a stage (services/similar.py). It is real
but narrow: it only knows artists inside our Ticketmaster catalogue, and it cannot rank
22 acts off one festival bill. Last.fm fills both gaps, because its similarity comes
from two decades of scrobbles — collaborative filtering on listening behaviour, the
same class of signal Spotify uses and closed to new apps in November 2024.

The difference it makes, measured 2026-08-18: Karan Aujla gets ZERO similar artists
from our data (no festival bill, no co-billed acts, no genre tags) and ten from
Last.fm — Diljit Dosanjh, AP Dhillon, Sidhu Moose Wala — correctly, because Last.fm's
data is not limited to Ticketmaster's US/UK/Europe footprint.

`match` is Last.fm's own 0–1 similarity, which we keep rather than re-derive: it is
their claim, and we attribute it as theirs.

Inert while `settings.lastfm_api_key` is blank — every function returns empty and the
caller falls back to the stage signal alone.
"""
import httpx

from app.core.config import settings

BASE = "https://ws.audioscrobbler.com/2.0/"
_HEADERS = {"User-Agent": "MusicX/0.1 (music discovery app; dev)"}

# Below this, Last.fm's own confidence is so low the pairing is not worth showing.
MIN_MATCH = 0.05


def enabled() -> bool:
    return bool(settings.lastfm_api_key)


def similar_artists(name: str, limit: int = 20) -> list[dict]:
    """[{"name", "match"}] ordered by Last.fm's match, strongest first. [] on any failure.

    A network error and "this artist is unknown to Last.fm" both return [] here. The
    caller must NOT cache an empty result as "no similar artists exist" without knowing
    which happened — see `fetch_ok` below.
    """
    rows, _ok = similar_artists_checked(name, limit)
    return rows


def similar_artists_checked(name: str, limit: int = 20) -> tuple[list[dict], bool]:
    """(results, lookup_completed).

    Same ok/failure split as the Wikidata website lookup, and for the same reason: a
    timeout must not be recorded as "we asked and there was nothing", or one bad request
    permanently blanks an artist's section.
    """
    if not enabled() or not name or name.strip().upper() in ("TBA", "VARIOUS"):
        return [], True
    try:
        r = httpx.get(BASE, params={
            "method": "artist.getsimilar", "artist": name,
            "api_key": settings.lastfm_api_key, "format": "json",
            "limit": limit, "autocorrect": 1,
        }, headers=_HEADERS, timeout=25)
        if r.status_code != 200:
            print(f"[lastfm] {name}: HTTP {r.status_code}")
            return [], False
        data = r.json()
    except Exception as e:
        print(f"[lastfm] {name}: {type(e).__name__} {e}")
        return [], False

    if "error" in data:
        # 6 = "artist not found", which IS an answer. Anything else is a failure.
        return ([], True) if data.get("error") == 6 else ([], False)

    out = []
    for a in ((data.get("similarartists") or {}).get("artist") or []):
        nm = (a.get("name") or "").strip()
        try:
            match = float(a.get("match") or 0)
        except (TypeError, ValueError):
            continue
        if nm and match >= MIN_MATCH:
            out.append({"name": nm, "match": round(match, 3)})
    return out, True


# ---------------------------------------------------------------------------
# Tags — the genre source Spotify took away
#
# Spotify's artist object stopped returning `genres` in dev mode, which left Tier B
# (genre-based) recommendations built but unusable. Last.fm's crowd tags replace it, and
# are richer for non-Western music: Ticketmaster's whole taxonomy is 23 genres and has
# nothing like "Bhangra", which is Karan Aujla's top tag at a weight of 100.
#
# Crowd tags need filtering. Measured on real artists, the noise falls into three groups:
#   • nationality — "Canadian" (weight 25), "american", "New Zealand" (17)
#   • descriptors that are not genres — "female vocalists" (34), "guitar" (12)
#   • typos and one-off jokes — "Hip-Hip", "Born in ghurala" (weight 1)
#
# The weight does most of the work: everything at 1-2 is essentially noise. The rest
# needs the explicit lists below.
# ---------------------------------------------------------------------------

# Last.fm weights tags 0-100. Below this it is one or two people, often a typo.
MIN_TAG_WEIGHT = 10

# Not genres, however many people tag them.
_NOT_GENRES = {
    "female vocalists", "female vocalist", "male vocalists", "male vocalist",
    "seen live", "favorites", "favourites", "favorite", "favourite", "beautiful",
    "awesome", "guitar", "piano", "vocal", "vocals", "singer", "instrumental",
    "cover", "covers", "live", "my music", "albums i own", "spotify", "love",
    # meta and personal tags, all seen in real data
    "greatest ever", "my top songs", "testing", "test", "artisttagola", "all", "best",
    "beentheredonethat", "bands i have seen live", "bands i've seen live", "tribute",
    "mtv", "chill", "sailing", "beach", "lgbt", "trumpet", "drums", "bass", "violin",
    "check out", "to check out", "want to see", "wishlist", "playlist", "radio",
    "60s", "70s", "80s", "90s", "00s", "10s", "20s", "2000s", "1990s", "1980s", "1970s",
}

# Nationality tells you nothing about how the music SOUNDS. Note the deliberate
# omissions: punjabi, desi, latin, afrobeat, k-pop and the like describe a musical
# tradition people genuinely browse by, so they stay.
_NATIONALITY = {
    "american", "usa", "us", "british", "uk", "english", "scottish", "welsh", "irish",
    "canadian", "australian", "new zealand", "german", "deutsch", "french", "swedish",
    "norwegian", "finnish", "danish", "dutch", "belgian", "italian", "spanish",
    "portuguese", "brazilian", "mexican", "argentine", "japanese", "korean", "chinese",
    "indian", "india", "russian", "polish", "turkish", "greek", "israeli", "icelandic",
    "united kingdom", "united states", "colombia", "jamaica", "iceland", "germany",
    "france", "spain", "italy", "brazil", "mexico", "japan", "korea", "china",
    "scotland", "ireland", "wales", "england", "australia", "canada", "sweden",
    "norway", "netherlands", "belgium", "denmark", "finland", "poland", "greece",
}

# Where a crowd tag means the same thing as a genre we already hold, reuse ours rather
# than creating a near-duplicate that filtering would then have to reconcile.
_ALIASES = {
    "hip hop": "Hip-Hop/Rap", "hip-hop": "Hip-Hop/Rap", "rap": "Hip-Hop/Rap",
    "rnb": "R&B", "r&b": "R&B", "r and b": "R&B",
    "electronic": "Dance/Electronic", "electronica": "Dance/Electronic",
    "edm": "Dance/Electronic", "dance": "Dance/Electronic",
    "alternative": "Alternative", "rock": "Rock", "pop": "Pop", "metal": "Metal",
    "blues": "Blues", "jazz": "Jazz", "folk": "Folk", "country": "Country",
    "classical": "Classical", "reggae": "Reggae", "latin": "Latin", "world": "World",
}


def _canonical(tag: str):
    """A crowd tag as a genre name, or None if it is not one."""
    raw = " ".join((tag or "").split()).lower()
    flat = raw.replace("-", " ").strip()
    # "D", "R", "M", "1", "123" all arrived as genres before this. A one- or two-character
    # tag is never a genre, and a numeric one never is either.
    if not flat or len(flat) < 3 or len(flat) > 30:
        return None
    if flat.replace(" ", "").isdigit():
        return None
    if flat in _NOT_GENRES or flat in _NATIONALITY:
        return None
    if flat.startswith("born in") or flat.startswith("under "):
        return None
    if raw in _ALIASES:
        return _ALIASES[raw]
    if flat in _ALIASES:
        return _ALIASES[flat]
    return flat.title()


def artist_tags(name: str, limit: int = 10):
    """(genre names, lookup_completed) for one artist, strongest tag first."""
    if not enabled() or not name or name.strip().upper() in ("TBA", "VARIOUS"):
        return [], True
    try:
        r = httpx.get(BASE, params={
            "method": "artist.gettoptags", "artist": name,
            "api_key": settings.lastfm_api_key, "format": "json", "autocorrect": 1,
        }, headers=_HEADERS, timeout=25)
        if r.status_code != 200:
            return [], False
        data = r.json()
    except Exception:
        return [], False

    if "error" in data:
        return ([], True) if data.get("error") == 6 else ([], False)

    out = []
    for t in ((data.get("toptags") or {}).get("tag") or []):
        try:
            weight = int(t.get("count") or 0)
        except (TypeError, ValueError):
            continue
        if weight < MIN_TAG_WEIGHT:
            continue
        g = _canonical(t.get("name") or "")
        if g and g not in out:
            out.append(g)
        if len(out) >= limit:
            break
    return out, True


def artist_listeners(name: str):
    """(listeners, playcount, lookup_completed) for one artist.

    `listeners` is the number of distinct people who have ever scrobbled them. It is a
    different population from Deezer's follower count and on a different scale, so the
    two are never added together — MXS ranks each source against its own distribution
    (see services/scoring.py).

    Why it matters: Deezer knows almost nothing about small acts, which is why 87% of
    our catalogue has no rating. Measured 2026-08-18, Fight From Within has 264 Deezer
    fans and 10,127 Last.fm listeners — 38x the coverage on exactly the artists where
    scoring currently fails.
    """
    if not enabled() or not name or name.strip().upper() in ("TBA", "VARIOUS"):
        return None, None, True
    try:
        r = httpx.get(BASE, params={
            "method": "artist.getinfo", "artist": name,
            "api_key": settings.lastfm_api_key, "format": "json", "autocorrect": 1,
        }, headers=_HEADERS, timeout=25)
        if r.status_code != 200:
            return None, None, False
        data = r.json()
    except Exception:
        return None, None, False

    if "error" in data:
        return (None, None, True) if data.get("error") == 6 else (None, None, False)

    stats = ((data.get("artist") or {}).get("stats") or {})
    def _int(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return None
    return _int(stats.get("listeners")), _int(stats.get("playcount")), True


# ---------------------------------------------------------------------------
# A user's own listening — the taste source Spotify never let us have
#
# Spotify's taste endpoints needed OAuth, a Premium account, and capped us at five
# testers before returning 403 anyway. Last.fm needs a USERNAME and nothing else:
# profiles are public by default, so `user.getTopArtists` answers with an API key alone.
#
# That also means a username is NOT proof of identity — anyone could type anyone's. It is
# fine for importing public taste and must never be treated as a login.
# ---------------------------------------------------------------------------

# A year is the sweet spot: long enough to describe someone, recent enough to still be
# true. "overall" reaches back a decade and buries what they listen to now.
TOP_PERIOD = "12month"


def _get(method: str, **params):
    """(payload, ok). ok=False means we could not complete the call at all."""
    if not enabled():
        return None, False
    try:
        r = httpx.get(BASE, params={
            "method": method, "api_key": settings.lastfm_api_key,
            "format": "json", **params,
        }, headers=_HEADERS, timeout=25)
        # Last.fm answers "no such user" with HTTP 404 AND a JSON body {"error": 6}, so
        # the body has to be parsed before the status is judged — otherwise a typo'd
        # username looks identical to the network being down, and we would tell someone
        # to try again later when they simply misspelled their name.
        data = r.json()
    except Exception:
        return None, False
    if "error" in data:
        # 6 = no such user, which IS an answer. Anything else is a failure on our side.
        return (None, True) if data.get("error") == 6 else (None, False)
    if r.status_code != 200:
        return None, False
    return data, True


def user_exists(username: str):
    """(profile_or_None, ok). None with ok=True means Last.fm has no such user."""
    if not username or not username.strip():
        return None, True
    data, ok = _get("user.getinfo", user=username.strip())
    if not ok or not data:
        return None, ok
    u = data.get("user") or {}
    if not u.get("name"):
        return None, True
    def _int(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return None
    return {
        "username": u.get("name"),
        "realname": (u.get("realname") or "").strip() or None,
        "playcount": _int(u.get("playcount")),
        "country": (u.get("country") or "").strip() or None,
        "image_url": next((i.get("#text") for i in reversed(u.get("image") or [])
                           if i.get("#text")), None),
    }, True


def user_top_artists(username: str, limit: int = 100, period: str = TOP_PERIOD):
    """[{"name", "playcount"}] strongest first. Falls back to all-time for a dormant
    account, so someone who stopped scrobbling last year still gets a real profile."""
    for p in (period, "overall"):
        data, ok = _get("user.gettopartists", user=username.strip(), limit=limit, period=p)
        if not ok:
            return [], False
        rows = ((data or {}).get("topartists") or {}).get("artist") or []
        out = []
        for a in rows:
            nm = (a.get("name") or "").strip()
            if not nm:
                continue
            try:
                plays = int(a.get("playcount") or 0)
            except (TypeError, ValueError):
                plays = 0
            out.append({"name": nm, "playcount": plays})
        if out:
            return out, True
    return [], True


def user_top_tags(username: str, limit: int = 30):
    """The genres this listener actually reaches for, as they tagged them themselves."""
    data, ok = _get("user.gettoptags", user=username.strip(), limit=limit)
    if not ok:
        return [], False
    rows = ((data or {}).get("toptags") or {}).get("tag") or []
    return [g for g in ((_canonical(t.get("name") or "")) for t in rows) if g], True
