"""Building a taste profile from a connected Last.fm account.

`taste_profiles` was designed for Spotify and then stranded when Spotify's taste
endpoints went 403 for dev-mode apps. The table, the genre bucketing in services/taste.py
and Tier B of /me/recommended have all been sitting there with no source feeding them.
This is the source.

What gets imported, and what deliberately does not:

  • **Top artists** become the taste profile — the artists this person actually plays.
    They do NOT become follows. Following means "alert me when they announce", which is a
    decision the user makes; silently signing them up for alerts from 100 artists because
    they once had a phase would be putting words in their mouth. The profile RANKS
    recommendations; follows generate alerts. Two different promises.

  • **Top tags** become genre weights, through the same bucketing Spotify was going to
    use, so Tier B finally has something to match on.

Nothing is written anywhere else, nothing is posted to Last.fm, and disconnecting removes
both the account row and the profile it built.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.artist import Artist
from app.models.lastfm_account import LastfmAccount
from app.models.taste_profile import TasteProfile
from app.services import deezer, lastfm
from app.services.deezer import _norm
from app.services.taste import genre_weights

# The artists that define someone's taste, versus the long tail they have merely played.
# Recommendations lead with the core and use the rest to widen, never the other way round.
CORE_COUNT = 25
IMPORT_LIMIT = 100

# The confirmation screen shows this many, so these are the ones that need a photo. A
# list of blank initials is a poor first impression of an import that just worked.
CONFIRM_COUNT = 30


def _artist_rows(db: Session, names: list) -> list:
    """Local artist rows for these names, creating any we do not hold.

    Creating them is the point: an artist we have never ingested is exactly the one whose
    first announced date should reach this user. The row costs nothing until they tour.
    """
    if not names:
        return []
    wanted = {_norm(n): n for n in names if n and n.strip()}
    found = {}
    for a in db.query(Artist).filter(func.lower(Artist.name).in_([n.lower() for n in wanted.values()])).all():
        found[_norm(a.name)] = a
    ordered = []
    for key, display in wanted.items():
        a = found.get(key)
        if a is None:
            a = Artist(name=display)
            db.add(a)
            found[key] = a
        ordered.append(a)
    db.flush()
    return ordered


def import_lastfm(db: Session, user_id, username: str) -> dict:
    """Connect the account and build the profile. Commits nothing — caller decides."""
    profile, ok = lastfm.user_exists(username)
    if not ok:
        return {"ok": False, "error": "unreachable",
                "message": "We couldn’t reach Last.fm just now. Try again in a moment."}
    if profile is None:
        return {"ok": False, "error": "no_such_user",
                "message": f"Last.fm has no user called “{username.strip()}”. Check the spelling."}

    artists, a_ok = lastfm.user_top_artists(profile["username"], limit=IMPORT_LIMIT)
    tags, t_ok = lastfm.user_top_tags(profile["username"])
    if not a_ok:
        return {"ok": False, "error": "unreachable",
                "message": "We found the account but couldn’t read its listening. Try again."}

    names = [a["name"] for a in artists]
    plays = {_norm(a["name"]): a["playcount"] for a in artists}
    core_rows = _artist_rows(db, names[:CORE_COUNT])
    adjacent_rows = _artist_rows(db, names[CORE_COUNT:])
    core = [a.id for a in core_rows]
    adjacent = [a.id for a in adjacent_rows]

    # Photos for the ones we are about to show. Fetched in parallel because thirty
    # sequential Deezer lookups is fifteen seconds, and this sits in the middle of
    # onboarding. Cached on the row, so it is paid once per artist ever.
    need = [a for a in (core_rows + adjacent_rows)[:CONFIRM_COUNT] if not a.image_url]
    if need:
        def _img(artist):
            try:
                return artist, deezer.artist_image(artist.name)
            except Exception:
                return artist, None
        with ThreadPoolExecutor(max_workers=8) as pool:
            for artist, url in pool.map(_img, need):
                if url:
                    artist.image_url = url
    weights = genre_weights(tags) if tags else {}

    now = datetime.now(timezone.utc)
    acct = db.get(LastfmAccount, user_id)
    if acct is None:
        acct = LastfmAccount(user_id=user_id)
        db.add(acct)
    acct.username = profile["username"]
    acct.realname = profile["realname"]
    acct.image_url = profile["image_url"]
    acct.playcount = profile["playcount"]
    acct.last_synced_at = now

    tp = db.query(TasteProfile).filter_by(user_id=user_id).first()
    if tp is None:
        tp = TasteProfile(user_id=user_id)
        db.add(tp)
    tp.core_artist_ids = core
    tp.adjacent_artist_ids = adjacent
    tp.genre_weights = weights or None
    tp.source = "lastfm"
    tp.refreshed_at = now

    return {
        "ok": True,
        "username": profile["username"],
        "realname": profile["realname"],
        "playcount": profile["playcount"],
        "artists_imported": len(names),
        "core_artists": len(core),
        "genres": sorted(weights, key=weights.get, reverse=True)[:8],
        "tags_seen": len(tags),
        "tags_ok": t_ok,
        # The artists themselves, strongest first, for the confirmation screen. Images
        # come from rows we already hold — no extra lookups just to draw a list.
        "artists": [
            {"name": a.name, "image_url": a.image_url,
             "playcount": plays.get(_norm(a.name), 0)}
            for a in core_rows + adjacent_rows
        ],
    }


def disconnect_lastfm(db: Session, user_id) -> bool:
    """Remove the connection AND the profile it built. Nothing is kept behind."""
    acct = db.get(LastfmAccount, user_id)
    tp = db.query(TasteProfile).filter_by(user_id=user_id, source="lastfm").first()
    if tp:
        db.delete(tp)
    if acct:
        db.delete(acct)
        return True
    return False
