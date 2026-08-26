import re
import uuid
from datetime import date
from datetime import date as date_cls
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, nulls_last, or_
from sqlalchemy.orm import Session, aliased

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.artist import Artist
from app.models.city import City
from app.models.festival import Festival
from app.models.festival_lineup import FestivalLineup
from app.models.follow import Follow
from app.schemas.festival import FestivalArtist, FestivalDetail, FestivalOut
from app.services.deezer import _norm
from app.services.ingestion import festival_search_and_ingest
from app.services.trust import confidence_for
from app.services import text_search as ts

router = APIRouter(prefix="/festivals", tags=["festivals"])


def _to_out(f: Festival, c: City | None, match_count=None, matched=None) -> FestivalOut:
    return FestivalOut(
        id=f.id,
        name=f.name,
        city=c.name if c else None,
        country=c.country if c else None,
        image_url=f.image_url,
        starts_on=f.starts_on,
        ends_on=f.ends_on,
        days=f.days,
        artists_count=f.artists_count,
        price_from_amount=float(f.price_from_amount) if f.price_from_amount is not None else None,
        price_from_currency=f.price_from_currency,
        mxs=float(f.mxs) if f.mxs is not None else None,
        confidence=confidence_for(
            last_verified=f.last_verified,
            has_when=f.starts_on is not None,
            has_where=f.city_id is not None,
        ),
        match_count=match_count,
        matched_artists=matched,
    )


def _cities_for(db: Session, fests: list[Festival]) -> dict:
    ids = {f.city_id for f in fests if f.city_id}
    return {c.id: c for c in db.query(City).filter(City.id.in_(ids)).all()} if ids else {}


def _upcoming(today: date):
    return or_(Festival.ends_on >= today, Festival.starts_on >= today, Festival.starts_on.is_(None))


@router.get("", response_model=list[FestivalOut])
def list_festivals(limit: int = Query(100, le=300), db: Session = Depends(get_db)):
    """All upcoming/ongoing festivals, soonest first — the open browse list (everyone
    sees the same, regardless of who they follow)."""
    today = date.today()
    fests = (
        db.query(Festival)
        .filter(Festival.merged_into.is_(None), _upcoming(today))
        .order_by(nulls_last(Festival.starts_on.asc()))
        .limit(limit)
        .all()
    )
    cities = _cities_for(db, fests)
    return [_to_out(f, cities.get(f.city_id) if f.city_id else None) for f in fests]


@router.get("/for-you", response_model=list[FestivalOut])
def festivals_for_you(
    user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    """Festivals whose line-up includes artists the user follows, ranked by how many
    ('feat. N artists you follow'). Empty if the user follows no one on any bill —
    the caller then falls back to the open browse list, so nothing is ever hidden."""
    uid = uuid.UUID(user_id)
    followed_norms = {
        _norm(n)
        for (n,) in (
            db.query(Artist.name)
            .join(Follow, Follow.followable_id == Artist.id)
            .filter(Follow.user_id == uid, Follow.followable_type == "artist")
            .all()
        )
    }
    if not followed_norms:
        return []

    today = date.today()
    rows = (
        db.query(Festival, Artist.name)
        .join(FestivalLineup, FestivalLineup.festival_id == Festival.id)
        .join(Artist, FestivalLineup.artist_id == Artist.id)
        .filter(Festival.merged_into.is_(None), _upcoming(today))
        .all()
    )
    matches: dict = {}  # festival_id -> (Festival, {matched display names})
    for fest, aname in rows:
        if _norm(aname) in followed_norms:
            matches.setdefault(fest.id, (fest, set()))[1].add(aname)
    if not matches:
        return []

    fests = [f for f, _ in matches.values()]
    cities = _cities_for(db, fests)
    far = date.max
    ordered = sorted(matches.values(), key=lambda p: (-len(p[1]), p[0].starts_on or far))
    return [
        _to_out(f, cities.get(f.city_id) if f.city_id else None,
                match_count=len(names), matched=sorted(names))
        for f, names in ordered
    ]


@router.get("/search", response_model=list[FestivalOut])
def search_festivals_local(
    q: str = Query(..., min_length=1),
    limit: int = Query(60, le=200),
    db: Session = Depends(get_db),
):
    """Search festivals we hold, ranked by how well the term matches.

    Server-side because the screen was filtering the first 100 festivals it had fetched —
    of 505 — so four out of five were unreachable and a search for something we DO hold
    could return nothing but noise.

    Ranked, and the whole-word tier is the point. Searching "ADE" against a plain substring
    matched "BULL BRIGADE | QUARTOLATO FESTIVAL" and "Shred Fest Adelaide", because
    "brigADE" and "ADElaide" both contain it. An acronym is a word, so a whole-word hit
    outranks a prefix, which outranks a substring, which outranks a city match. Nothing is
    hidden — the weak matches still come, just underneath.
    """
    raw = q.strip()
    safe = ts.escape_like(raw)

    # Also matched on the BILL, the way the concert search matches its line-up. Without it,
    # typing an artist's name found their concerts but not the festival they headline —
    # searching "Tyler, The Creator" missed Lowlands, where he is on the bill.
    BillArtist = aliased(Artist)

    def joined(query):
        return (
            query
            .outerjoin(City, Festival.city_id == City.id)
            .outerjoin(FestivalLineup, FestivalLineup.festival_id == Festival.id)
            .outerjoin(BillArtist, FestivalLineup.artist_id == BillArtist.id)
            .filter(Festival.merged_into.is_(None), _upcoming(date.today()))
        )

    # Accents fold on both sides of every comparison, so the whole-word tier keeps working
    # for a term typed without them. Folding only widens a match, so the tiers below rank
    # exactly as they did for anyone typing ASCII.
    rank = case(
        (ts.whole_word(Festival.name, raw), 0),
        (ts.starts_with(Festival.name, safe), 1),
        (ts.contains(Festival.name, safe), 2),
        # An artist on the bill is a weaker reading of the query than the festival's own
        # name, and a stronger one than the city it happens to be in.
        (ts.contains(BillArtist.name, safe), 3),
        else_=4,
    ).label("match_rank")

    # GROUP BY, not DISTINCT. A festival joins every artist on its bill, so it comes back
    # once per bill row — and those rows do not all carry the same rank, which is exactly
    # what DISTINCT preserves. min(rank) collapses them to one row at its STRONGEST reason
    # for matching, which is also the rank it should be ranked by.
    best = func.min(rank).label("match_rank")
    rows = (
        joined(db.query(Festival, best))
        .filter(or_(ts.contains(Festival.name, safe),
                    ts.contains(City.name, safe),
                    ts.contains(BillArtist.name, safe)))
        .group_by(Festival.id)
        .order_by(best, nulls_last(Festival.starts_on.asc()))
        .limit(limit)
        .all()
    )

    # Misspelling fallback, same rule as the concert search: only on an otherwise empty
    # screen, so a search that works today is byte-for-byte unchanged. Festival names are
    # long and easy to get wrong — "Creamfeilds" scores 0.38 against Creamfields 2026 —
    # and the festival's own name outranks a close artist on its bill.
    if not rows and len(raw) >= 4:
        close = or_(ts.is_close(Festival.name, raw), ts.is_close(BillArtist.name, raw))
        score = func.greatest(
            func.coalesce(ts.similarity(Festival.name, raw), 0),
            func.coalesce(ts.similarity(BillArtist.name, raw), 0),
        ).label("sim")
        fuzzy_rank = case((ts.is_close(Festival.name, raw), 0), else_=1)
        best_rank, best_sim = func.min(fuzzy_rank).label("fr"), func.max(score).label("sim")
        rows = (
            joined(db.query(Festival, best_rank, best_sim))
            .filter(close)
            .group_by(Festival.id)
            .order_by(best_rank, best_sim.desc(), nulls_last(Festival.starts_on.asc()))
            .limit(limit)
            .all()
        )

    fests = [r[0] for r in rows]
    cities = _cities_for(db, fests)
    return [_to_out(f, cities.get(f.city_id) if f.city_id else None) for f in fests]


@router.get("/search-live", response_model=list[FestivalOut])
def search_festivals_live(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
):
    """Ask Ticketmaster for festivals matching this keyword, store them, return them.

    The mirror of /events/search, which the concert side has always had. Without it a
    festival the periodic sweep missed was unfindable however precisely someone typed its
    name — and the sweep can only ever reach what a festival-shaped keyword returns.

    Results are collapsed by base name and city before returning. Ticketmaster sells one
    festival as many ticket types, and the real merge runs from the nightly refresh; doing
    it properly here would mean a full-catalogue pass on every search, so this is a
    presentation-level collapse that writes nothing.
    """
    ids = festival_search_and_ingest(q)
    if not ids:
        return []
    fests = (db.query(Festival)
               .filter(Festival.id.in_(ids), Festival.merged_into.is_(None))
               .all())

    # One entry per festival, keeping the fullest bill — the same survivor rule the merge
    # uses, so a search result and the page it opens agree about which row is the festival.
    best: dict = {}
    for f in fests:
        key = (re.sub(r"\s*[-–|:].*$", "", (f.name or "").lower()).strip(), f.city_id)
        acts = db.query(FestivalLineup).filter_by(festival_id=f.id).count()
        if key not in best or acts > best[key][1]:
            best[key] = (f, acts)
    chosen = [f for f, _ in best.values()]
    chosen.sort(key=lambda f: (f.starts_on is None, f.starts_on))
    cities = _cities_for(db, chosen)
    return [_to_out(f, cities.get(f.city_id) if f.city_id else None) for f in chosen]


@router.get("/{festival_id}", response_model=FestivalDetail)
def get_festival(festival_id: UUID, db: Session = Depends(get_db)):
    """One festival, with its published line-up.

    Registered AFTER /for-you on purpose: FastAPI matches routes in order, and a path
    parameter this loose would otherwise swallow "/for-you" and try to parse it as a UUID.
    """
    f = db.get(Festival, festival_id)
    if not f or f.merged_into is not None:
        raise HTTPException(status_code=404, detail="Festival not found")

    city = db.get(City, f.city_id) if f.city_id else None
    out = FestivalDetail(**_to_out(f, city).model_dump())
    out.about = f.about
    out.lineup_complete = bool(f.lineup_complete)
    out.last_verified = f.last_verified

    # Headliners first, then the seller's own order — the same shape the concert line-up
    # uses, so the two pages read alike.
    rows = (
        db.query(FestivalLineup, Artist)
        .join(Artist, FestivalLineup.artist_id == Artist.id)
        .filter(FestivalLineup.festival_id == f.id)
        .order_by(FestivalLineup.day_label.asc().nullslast(),
                  FestivalLineup.is_headliner.desc(),
                  FestivalLineup.sort_order.asc())
        .all()
    )
    out.lineup = []
    seen_days: list = []
    for fl, a in rows:
        day = None
        if fl.day_label:
            # Written by services/festival_merge as an ISO date. Anything else predates
            # that and is ignored rather than guessed at.
            try:
                day = date_cls.fromisoformat(fl.day_label)
            except ValueError:
                day = None
        if day and day not in seen_days:
            seen_days.append(day)
        out.lineup.append(FestivalArtist(name=a.name, image_url=a.image_url, day=day))
    out.lineup_days = sorted(seen_days)
    return out
