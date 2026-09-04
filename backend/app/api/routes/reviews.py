"""Reviews — written only by people who were there, read by people deciding whether to go.

THE UNIT IS THE ARTIST, NOT THE DATE.

A review is stored against the night it is about (reviews.event_id) and displayed against
the artist. That is not a shortcut, it is the whole point: a review of one date is only
readable after that date, when nobody needs it any more. Aggregated across an artist's past
shows it answers the question somebody actually has while holding a ticket page open — is
this artist good live?

Each review therefore carries the show it came from, so the reader can see it was a
different night in a different room and weigh it accordingly.

WHO MAY WRITE ONE

A passport entry for that event, and the event must have ended. The passport is the
evidence-anchored record — its own model says "no manual typing; imports REQUIRE
evidence_url" — whereas calendar state can be ticked by hand. Gating on calendar state
would let somebody save a show, mark themselves attended, and review a night they never
went to, which is precisely what this app exists not to do.

WHY THERE IS NO IMPORTED SEED DATA

There is nowhere to import from. setlist.fm holds no reviews; Ticketmaster's API exposes
none (their website has them, the API does not); Songkick's API is closed; Google reviews
the building rather than the night, and forbids reuse. Every concert happens once and
nobody keeps a library of opinions about them. So the screen opens with setlist facts —
what the artist actually played last time — and real reviews accumulate on top.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import get_current_user_id
from app.models.artist import Artist
from app.models.event import Event
from app.models.review import Review
from app.models.review_like import ReviewLike
from app.services import setlistfm

router = APIRouter(tags=["reviews"])

# A show is over well after it starts. Same six hours the plan card uses, so the two
# screens cannot disagree about whether last night has finished.
SHOW_HOURS = 6
MAX_BODY = 1500
# Re-ask setlist.fm about an artist at most this often. Their tour changes across months,
# not hours, and the daily budget is 1,440 requests for the whole app.
FACTS_STALE_DAYS = 30


# ─────────────────────────────────────────────────────────── shapes

class ReviewOut(BaseModel):
    id: uuid.UUID
    rating: int
    body: str | None
    likes_count: int
    liked_by_me: bool
    created_at: datetime
    author_name: str | None
    author_avatar: str | None
    # Which night this is about — the reader needs it to judge a review written about a
    # different room on a different tour.
    show_label: str | None
    is_this_event: bool


class Summary(BaseModel):
    average: float | None
    count: int
    # 1..5 -> how many gave that many stars, for the mockup's histogram
    histogram: dict[int, int]


class LiveFacts(BaseModel):
    songs: int
    # "mbid" or "name" — the screen credits setlist.fm either way, but a name match is a
    # guess and this is what would let anyone tell the difference later.
    matched_by: str | None = None
    encores: int
    opener: str | None
    closer: str | None
    venue_name: str | None
    city: str | None
    seen_on: str | None
    tour: str | None
    url: str | None


class ReviewsPage(BaseModel):
    artist_name: str | None
    # How many people here have been to one of this artist's shows. Ours alone — no
    # outside source knows it — and it is the only thing that makes this screen feel
    # inhabited before the first review is written.
    seen_by: int
    summary: Summary
    reviews: list[ReviewOut]
    live_facts: LiveFacts | None
    can_review: bool
    # Why not, in words the screen can show. Hiding the control entirely would leave
    # somebody wondering where reviews come from.
    cannot_review_reason: str | None
    my_review_id: uuid.UUID | None


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    body: str | None = Field(default=None, max_length=MAX_BODY)


# ─────────────────────────────────────────────────────────── helpers

def _ended(ev: Event) -> bool:
    if not ev.starts_at:
        return False
    return datetime.now(timezone.utc) >= ev.starts_at + timedelta(hours=SHOW_HOURS)


def _attended(db: Session, uid: uuid.UUID, event_id: uuid.UUID) -> bool:
    """Evidence that this person was at this show."""
    return bool(db.execute(text("""
        SELECT 1 FROM passport_entries
         WHERE user_id = :uid AND event_id = :eid LIMIT 1
    """), {"uid": uid, "eid": event_id}).first())


def _facts_for(db: Session, artist: Artist | None) -> dict | None:
    """Cached setlist facts, refreshed at most monthly.

    Written even when setlist.fm returns nothing, so an artist with no setlist is not
    re-requested on every view of every one of their shows.
    """
    if artist is None:
        return None
    today = datetime.now(timezone.utc).date()
    fresh = (artist.live_facts_checked_on
             and (today - artist.live_facts_checked_on).days < FACTS_STALE_DAYS)
    if fresh:
        return artist.live_facts

    facts = setlistfm.live_facts(artist.name, mbid=artist.mbid)
    artist.live_facts = facts
    artist.live_facts_checked_on = today
    db.commit()
    return facts


# ─────────────────────────────────────────────────────────── read

@router.get("/events/{event_id}/reviews", response_model=ReviewsPage)
def reviews_for_event(
    event_id: uuid.UUID,
    limit: int = 30,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(user_id)
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    artist = db.get(Artist, ev.headliner_artist_id) if ev.headliner_artist_id else None

    # Every review of this artist, whichever of their shows it was written about. This
    # event's own reviews come first — they are about this exact room.
    rows = db.execute(text("""
        SELECT r.id, r.rating, r.body, r.likes_count, r.created_at, r.event_id,
               p.display_name, p.avatar_url,
               v.name AS venue_name, e.starts_at,
               EXISTS (SELECT 1 FROM review_likes rl
                        WHERE rl.review_id = r.id AND rl.user_id = :uid) AS liked
        FROM reviews r
        JOIN events e ON e.id = r.event_id
        LEFT JOIN profiles p ON p.id = r.user_id
        LEFT JOIN venues v ON v.id = e.venue_id
        WHERE (:aid IS NOT NULL AND e.headliner_artist_id = :aid)
           OR r.event_id = :eid
        ORDER BY (r.event_id = :eid) DESC, r.likes_count DESC, r.created_at DESC
        LIMIT :lim
    """), {"uid": uid, "aid": ev.headliner_artist_id, "eid": event_id,
           "lim": min(limit, 100)}).all()

    out: list[ReviewOut] = []
    mine: uuid.UUID | None = None
    for (rid, rating, body, likes, created, r_event, name, avatar,
         venue_name, starts_at, liked) in rows:
        label = None
        if venue_name and starts_at:
            label = f"{venue_name} · {starts_at.strftime('%b %Y')}"
        elif starts_at:
            label = starts_at.strftime("%b %Y")
        out.append(ReviewOut(
            id=rid, rating=rating, body=body, likes_count=likes, liked_by_me=bool(liked),
            created_at=created, author_name=name, author_avatar=avatar,
            show_label=label, is_this_event=(r_event == event_id),
        ))

    # The summary counts every review shown, so the average and the list agree.
    hist = {n: 0 for n in range(1, 6)}
    for r in out:
        hist[r.rating] = hist.get(r.rating, 0) + 1
    total = len(out)
    average = round(sum(r.rating for r in out) / total, 1) if total else None

    my_row = db.execute(text("""
        SELECT id FROM reviews WHERE user_id = :uid AND event_id = :eid
    """), {"uid": uid, "eid": event_id}).first()
    if my_row:
        mine = my_row[0]

    # The gate, and the reason, in the order somebody would hit them.
    can, why = False, None
    if mine:
        can, why = False, "You have already reviewed this show."
    elif not _ended(ev):
        can, why = False, "You can review this show once it has happened."
    elif not _attended(db, uid, event_id):
        can, why = False, "Only people who went to this show can review it."
    else:
        can = True

    seen_by = 0
    if ev.headliner_artist_id:
        seen_by = db.execute(text("""
            SELECT count(DISTINCT pe.user_id)
            FROM passport_entries pe
            JOIN events e2 ON e2.id = pe.event_id
            WHERE e2.headliner_artist_id = :aid
        """), {"aid": ev.headliner_artist_id}).scalar() or 0

    return ReviewsPage(
        artist_name=artist.name if artist else None,
        seen_by=seen_by,
        summary=Summary(average=average, count=total, histogram=hist),
        reviews=out,
        live_facts=_facts_for(db, artist),
        can_review=can,
        cannot_review_reason=why,
        my_review_id=mine,
    )


# ─────────────────────────────────────────────────────────── write

@router.post("/events/{event_id}/reviews", response_model=ReviewOut,
             status_code=status.HTTP_201_CREATED)
def write_review(
    event_id: uuid.UUID,
    body: ReviewIn,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """The gate is enforced here, not only in the UI — a hidden button is not a rule."""
    uid = uuid.UUID(user_id)
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not _ended(ev):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This show has not happened yet")
    if not _attended(db, uid, event_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only people who went to this show can review it")

    existing = db.execute(text("""
        SELECT id FROM reviews WHERE user_id = :uid AND event_id = :eid
    """), {"uid": uid, "eid": event_id}).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="You have already reviewed this show")

    review = Review(event_id=event_id, user_id=uid, rating=body.rating,
                    body=(body.body or "").strip() or None)
    db.add(review)
    db.commit()
    db.refresh(review)

    prof = db.execute(text("SELECT display_name, avatar_url FROM profiles WHERE id = :uid"),
                      {"uid": uid}).first()
    venue = db.execute(text("""
        SELECT v.name, e.starts_at FROM events e
        LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = :eid
    """), {"eid": event_id}).first()
    label = None
    if venue and venue[0] and venue[1]:
        label = f"{venue[0]} · {venue[1].strftime('%b %Y')}"

    return ReviewOut(
        id=review.id, rating=review.rating, body=review.body, likes_count=0,
        liked_by_me=False, created_at=review.created_at,
        author_name=prof[0] if prof else None, author_avatar=prof[1] if prof else None,
        show_label=label, is_this_event=True,
    )


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Your own review, and only your own. Apple requires that people can remove what they
    have written, and it is the right behaviour regardless."""
    uid = uuid.UUID(user_id)
    review = db.get(Review, review_id)
    if not review:
        return
    if review.user_id != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your review")
    db.delete(review)
    db.commit()


# ─────────────────────────────────────────────────────────── helpful

@router.post("/reviews/{review_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def like_review(
    review_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(user_id)
    review = db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if review.user_id == uid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="You cannot mark your own review helpful")
    # likes_count is kept on the row so the list does not need a count per review; the
    # unique constraint on (review_id, user_id) is what stops it drifting.
    if not db.execute(text("""
        SELECT 1 FROM review_likes WHERE review_id = :rid AND user_id = :uid
    """), {"rid": review_id, "uid": uid}).first():
        db.add(ReviewLike(review_id=review_id, user_id=uid))
        review.likes_count = (review.likes_count or 0) + 1
        db.commit()


@router.delete("/reviews/{review_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_review(
    review_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(user_id)
    review = db.get(Review, review_id)
    if not review:
        return
    deleted = db.execute(text("""
        DELETE FROM review_likes WHERE review_id = :rid AND user_id = :uid
    """), {"rid": review_id, "uid": uid}).rowcount
    if deleted:
        review.likes_count = max(0, (review.likes_count or 0) - 1)
        db.commit()
