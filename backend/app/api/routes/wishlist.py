"""The wishlist: acts you have not seen yet and intend to.

How this differs from the two things next to it, because three lists that feel the same
would be worse than one
--------------------------------------------------------------------------------------
    Save (calendar_entries)  an EVENT on a DATE — "this show, this night"
    Follow (follows)         an artist, a subscription — "tell me when they play"
    Wishlist (bucket_list)   an artist, no date — "I have not seen them, and I mean to"

The wishlist is the only one of the three that can be FINISHED. That is its whole point,
and it is why it is joined to the Passport here: a line is crossed off when we hold real
evidence you were there. Without that join it would be a notes app.

Deliberately NOT coupled to Follow. Adding a line does not follow the artist — decided
2026-09-09 — so the value has to be delivered on the screen rather than by notification,
which is what `next_event_*` on every line is for: a want becomes a save in one tap.

The table is still called `bucket_list`, which is what the phase-2 mockup and the original
schema call it. Only the user-facing word changed.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.me import _get_or_create_artist
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.bucket_list import BucketListItem
from app.schemas.wishlist import Wishlist, WishlistAddIn, WishlistLine

router = APIRouter(prefix="/me/wishlist", tags=["wishlist"])


@router.get("", response_model=Wishlist)
def get_wishlist(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Everything on the list, split by whether it is done.

    One query. The three things each line needs — the artist, whether the Passport has them,
    and their soonest upcoming show — are three joins, not three round trips; a round trip
    to Singapore is ~27ms from Render and ~150ms from a dev machine, and a list of thirty
    acts asking individually is most of a second either way.

    The upcoming show is picked with a LATERAL, which is the one shape that gets "the
    soonest row per artist" without pulling every date they play and throwing most away.
    """
    uid = uuid.UUID(user_id)
    rows = db.execute(text("""
        SELECT b.artist_id, a.name, a.image_url, a.deezer_fans, a.lastfm_listeners,
               b.created_at AS added_on, b.seen_at,
               p.seen_on   AS passport_seen_on,
               p.id        AS passport_id,
               nx.id       AS next_event_id,
               nx.title    AS next_event_title,
               nx.starts_at AS next_event_starts_at,
               nx.city     AS next_event_city,
               nx.country  AS next_event_country
          FROM bucket_list b
          JOIN artists a ON a.id = b.artist_id
          -- The earliest evidenced sighting, if the Passport holds one. Earliest rather
          -- than latest: "when did you first see them" is the interesting fact.
          LEFT JOIN LATERAL (
              SELECT pe.id, pe.seen_on
                FROM passport_entries pe
               WHERE pe.user_id = b.user_id AND pe.artist_id = b.artist_id
               ORDER BY pe.seen_on ASC NULLS LAST
               LIMIT 1
          ) p ON TRUE
          -- The soonest show we hold, headlining or on the bill.
          LEFT JOIN LATERAL (
              SELECT e.id, e.title, e.starts_at, c.name AS city, c.country
                FROM events e
                LEFT JOIN venues v ON v.id = e.venue_id
                LEFT JOIN cities c ON c.id = v.city_id
               WHERE e.merged_into IS NULL AND e.retired_at IS NULL
                 AND e.starts_at >= :now
                 AND (e.headliner_artist_id = b.artist_id
                      OR EXISTS (SELECT 1 FROM event_artists ea
                                  WHERE ea.event_id = e.id AND ea.artist_id = b.artist_id))
               ORDER BY e.starts_at ASC
               LIMIT 1
          ) nx ON TRUE
         WHERE b.user_id = :uid
         ORDER BY a.name
    """), {"uid": uid, "now": datetime.now(timezone.utc)}).mappings().all()

    still, seen = [], []
    for r in rows:
        # Two ways to be done, and the app is told which. A passport entry outranks a manual
        # tick: if we can prove it, we say so rather than crediting the person's memory.
        via = "passport" if r["passport_id"] else ("manual" if r["seen_at"] else None)
        line = WishlistLine(
            artist_id=r["artist_id"], name=r["name"], image_url=r["image_url"],
            deezer_fans=r["deezer_fans"], lastfm_listeners=r["lastfm_listeners"],
            added_on=r["added_on"],
            seen=via is not None, seen_via=via, seen_on=r["passport_seen_on"],
            next_event_id=r["next_event_id"], next_event_title=r["next_event_title"],
            next_event_starts_at=r["next_event_starts_at"],
            next_event_city=r["next_event_city"], next_event_country=r["next_event_country"],
        )
        (seen if line.seen else still).append(line)

    # Still-to-see leads with whoever is actually playing soonest — the acts you could do
    # something about — and everyone with no announced date follows, alphabetically.
    still.sort(key=lambda l: (l.next_event_starts_at is None,
                              l.next_event_starts_at or datetime.max.replace(tzinfo=timezone.utc),
                              l.name))
    return Wishlist(
        still_to_see=still,
        seen=seen,
        total=len(rows),
        seen_count=len(seen),
        playing_count=sum(1 for l in still if l.next_event_id),
    )


@router.post("", response_model=WishlistLine, status_code=status.HTTP_201_CREATED)
def add_to_wishlist(body: WishlistAddIn,
                    user_id: str = Depends(get_current_user_id),
                    db: Session = Depends(get_db)):
    """Add an act. Idempotent — adding twice is a no-op, not an error.

    Accepts an artist we hold no shows for, which is the point: a wishlist is for acts you
    have NOT seen, and plenty of those tour rarely or not at all. The name reconciles to a
    single local row through the shared find-or-create, so adding 'AR Rahman' from Deezer
    lands on the existing 'A.R. Rahman' rather than beside it.

    It does NOT follow the artist. Two separate promises, set separately.
    """
    uid = uuid.UUID(user_id)
    artist = _get_or_create_artist(db, body.name, body.image_url)
    if artist is None:
        raise HTTPException(status_code=422, detail="An act needs a name")

    exists = db.query(BucketListItem).filter_by(user_id=uid, artist_id=artist.id).first()
    if not exists:
        db.add(BucketListItem(user_id=uid, artist_id=artist.id))
    db.commit()
    db.refresh(artist)
    return WishlistLine(
        artist_id=artist.id, name=artist.name, image_url=artist.image_url,
        deezer_fans=artist.deezer_fans, lastfm_listeners=artist.lastfm_listeners,
        added_on=(exists.created_at if exists else datetime.now(timezone.utc)),
    )


@router.delete("/{artist_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_wishlist(artist_id: uuid.UUID,
                         user_id: str = Depends(get_current_user_id),
                         db: Session = Depends(get_db)):
    """Take an act off the list. Silent when it was never on it — a delete that reports
    404 for something already absent makes the client handle a state it cannot control."""
    db.query(BucketListItem).filter_by(user_id=uuid.UUID(user_id), artist_id=artist_id).delete()
    db.commit()


@router.post("/{artist_id}/seen", response_model=WishlistLine)
def mark_seen(artist_id: uuid.UUID,
              user_id: str = Depends(get_current_user_id),
              db: Session = Depends(get_db)):
    """"I've seen them" — for the gigs that happened before this app existed.

    Recorded on the wishlist line, never as a Passport entry. The Passport holds only what
    can be shown: a ticket, a setlist.fm match, a stamp from a finished booking. A bare
    recollection has none of that, and putting it there would quietly weaken the one table
    built to be trustworthy. So the line reads as seen and says the claim came from you.
    """
    uid = uuid.UUID(user_id)
    line = db.query(BucketListItem).filter_by(user_id=uid, artist_id=artist_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Not on your wishlist")
    line.seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(line)
    a = line.artist
    return WishlistLine(
        artist_id=artist_id, name=a.name, image_url=a.image_url,
        deezer_fans=a.deezer_fans, lastfm_listeners=a.lastfm_listeners,
        added_on=line.created_at, seen=True, seen_via="manual",
    )


@router.delete("/{artist_id}/seen", response_model=WishlistLine)
def unmark_seen(artist_id: uuid.UUID,
                user_id: str = Depends(get_current_user_id),
                db: Session = Depends(get_db)):
    """Undo a manual tick.

    It cannot undo a Passport one, and does not pretend to: that entry is evidence, and
    the way to remove it is to remove the evidence in the Passport itself. A line ticked
    by a real ticket will read as seen again on the next load, which is correct.
    """
    uid = uuid.UUID(user_id)
    line = db.query(BucketListItem).filter_by(user_id=uid, artist_id=artist_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Not on your wishlist")
    line.seen_at = None
    db.commit()
    db.refresh(line)
    a = line.artist
    return WishlistLine(
        artist_id=artist_id, name=a.name, image_url=a.image_url,
        deezer_fans=a.deezer_fans, lastfm_listeners=a.lastfm_listeners,
        added_on=line.created_at, seen=False, seen_via=None,
    )
