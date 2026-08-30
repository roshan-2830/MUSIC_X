"""The Concert Passport — the record of shows somebody actually went to.

WHY IT IS NOT JUST "saved shows in the past". A passport that anyone can type into is worth
nothing, and the mockup says so in as many words: no manual entry. So an entry exists only when
there is a reason to believe the person was there, and `source` records WHICH reason:

    music_x       they tracked the show here and ticked Attended after it happened
    import_ticket a ticket they uploaded — REQUIRES evidence_url
    setlist_fm    a setlist.fm attendance link

A show sitting in someone's calendar with a date in the past is not evidence of anything: plans
fall through. That is why the plan card asks "Were you there?" rather than assuming.
"""
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models.artist import Artist
from app.models.city import City
from app.models.event import Event
from app.models.passport_entry import PassportEntry
from app.models.venue import Venue

# The milestone ladder, copied from the mockup rather than invented: 1, 5, 10, 25, 50. An
# earlier guess here made a single show "Regular", which would have cheapened the thing it is
# supposed to celebrate.
MILESTONES = [(1, "First show"), (5, "Regular"), (10, "Devoted"),
              (25, "Superfan"), (50, "Legend")]

# What one show is worth in "time in the crowd". Nobody records set lengths, so this is an
# ASSUMPTION and is labelled as an estimate wherever it is shown — a passport that invents
# precision it does not have is the same lie as one you can type into.
MINUTES_PER_SHOW = 150


def tier_for(count: int) -> str:
    """The highest title earned. Nothing until the first show — a passport with no shows in it
    has not earned a rank, and saying otherwise is flattery."""
    earned = None
    for need, label in MILESTONES:
        if count >= need:
            earned = label
    return earned or ""


def next_tier(count: int):
    """(label, shows_needed) for the next rung, or None at the top."""
    for need, label in MILESTONES:
        if count < need:
            return label, need - count
    return None


def milestones_for(count: int) -> list:
    """Every rung with whether it is reached, plus how far along the current gap is — the
    mockup shows the whole ladder, not just the current title, so progress is visible."""
    prev = 0
    nxt = next_tier(count)
    for need, _ in MILESTONES:
        if count >= need:
            prev = need
    target = next((n for n, _ in MILESTONES if count < n), None)
    span = (target - prev) if target else 0
    return {
        "rungs": [{"at": n, "label": l, "reached": count >= n} for n, l in MILESTONES],
        "progress": round(min(1.0, max(0.0, (count - prev) / span)), 3) if span else 1.0,
        "next_label": nxt[0] if nxt else None,
        "next_at": target,
    }


def record_attendance(db: Session, user_id, ev: Event, source: str = "music_x",
                      evidence_url: str | None = None) -> PassportEntry | None:
    """Write the entry for a show somebody has confirmed attending. Idempotent.

    Called when a plan reaches `attended`. Returns None if it is already recorded, so a second
    tick — or a tick, untick, re-tick — cannot produce two stamps for one night.
    """
    if source != "music_x" and not evidence_url:
        # The trust rule, enforced where it cannot be forgotten rather than in the caller.
        raise ValueError("An imported passport entry needs evidence")

    existing = (db.query(PassportEntry)
                  .filter(PassportEntry.user_id == user_id,
                          PassportEntry.event_id == ev.id).first())
    if existing:
        return None

    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    city = db.get(City, venue.city_id) if venue and venue.city_id else None
    artist = db.get(Artist, ev.headliner_artist_id) if ev.headliner_artist_id else None

    entry = PassportEntry(
        user_id=user_id,
        event_id=ev.id,
        artist_id=ev.headliner_artist_id,
        # Denormalised on purpose: an imported show may name an artist we have never heard of,
        # and a passport must still be readable if the catalogue row is later merged away.
        artist_name=artist.name if artist else (ev.title or None),
        venue_name=venue.name if venue else None,
        city=city.name if city else None,
        country=city.country if city else None,
        seen_on=ev.starts_at.date() if ev.starts_at else date.today(),
        source=source,
        evidence_url=evidence_url,
    )
    db.add(entry)
    db.flush()
    return entry


def forget_attendance(db: Session, user_id, event_id) -> int:
    """Undo. Someone who un-ticks Attended must not be left with a stamp they cannot remove —
    the passport is theirs, and a record you cannot correct is not trustworthy either."""
    n = (db.query(PassportEntry)
           .filter(PassportEntry.user_id == user_id,
                   PassportEntry.event_id == event_id).delete(synchronize_session=False))
    return n


def summarise(entries: list) -> dict:
    """The numbers on the passport. Computed from the entries themselves, never stored, so they
    cannot drift from the rows they claim to describe."""
    shows = len(entries)
    countries = sorted({e.country for e in entries if e.country})
    cities = sorted({e.city for e in entries if e.city})

    by_artist: dict = {}
    for e in entries:
        if e.artist_name:
            by_artist[e.artist_name] = by_artist.get(e.artist_name, 0) + 1
    top = max(by_artist.items(), key=lambda kv: (kv[1], kv[0])) if by_artist else None

    dates = sorted(e.seen_on for e in entries if e.seen_on)
    nxt = next_tier(shows)
    return {
        "shows": shows,
        "countries": countries,
        "country_count": len(countries),
        "city_count": len(cities),
        # Labelled an estimate wherever it is shown. See MINUTES_PER_SHOW.
        "hours_in_the_crowd": round(shows * MINUTES_PER_SHOW / 60),
        "top_artist": top[0] if top else None,
        "top_artist_count": top[1] if top else 0,
        "first_show_on": dates[0] if dates else None,
        "latest_show_on": dates[-1] if dates else None,
        "tier": tier_for(shows),
        "next_tier": nxt[0] if nxt else None,
        "shows_to_next_tier": nxt[1] if nxt else None,
        "milestones": milestones_for(shows),
        # The mockup's "Member since" is the year of the FIRST show, not the sign-up date —
        # a passport dates from when you started going, not when you installed an app.
        "member_since": dates[0].year if dates else None,
    }


def import_from_setlistfm(db: Session, user_id, username: str) -> dict:
    """Bring somebody's setlist.fm history into their passport.

    ALL OR NOTHING. If setlist.fm cannot give us the complete history — rate limit reached, a
    page failed — nothing is written at all. Half a history is the worst outcome available
    here: the person sees a fraction of their gigs, believes that is the record, and their
    stamp wall omits countries they have actually been to. Being told "try again tomorrow" is
    strictly better than being quietly given the wrong answer.

    Idempotent by setlist URL, so re-importing after going to more concerts adds only the new
    ones and can never duplicate a night.
    """
    from app.services import setlistfm

    rows, complete = setlistfm.attended(username)
    if not complete:
        # Could not read the whole history. See the docstring: nothing is written.
        return {"ok": False, "reason": "incomplete", "added": 0, "skipped": 0,
                "total": len(rows)}

    existing = {e.evidence_url for e in
                db.query(PassportEntry)
                  .filter(PassportEntry.user_id == user_id,
                          PassportEntry.source == "setlist_fm").all()
                if e.evidence_url}

    added = skipped = 0
    for r in rows:
        url = r.get("url")
        if not url:
            # Without the setlist URL there is no evidence, and an entry with no evidence is
            # exactly what this feature refuses to create.
            skipped += 1
            continue
        if url in existing:
            skipped += 1
            continue
        db.add(PassportEntry(
            user_id=user_id,
            event_id=None,          # a gig from 2009 is not in our catalogue and never will be
            artist_id=None,
            artist_name=r.get("artist_name"),
            venue_name=r.get("venue_name"),
            city=r.get("city"),
            country=r.get("country"),
            seen_on=r.get("seen_on"),
            source="setlist_fm",
            evidence_url=url,
        ))
        existing.add(url)
        added += 1
    db.flush()
    return {"ok": True, "added": added, "skipped": skipped, "total": len(rows)}


def stamp_finished_shows(limit: int = 500) -> dict:
    """Put every finished, ticketed show into its owner's Passport.

    THE PASSPORT MUST NOT DEPEND ON SOMEBODY OPENING A SCREEN. The plan card already treats a
    booked show as attended once its date has passed — the PRD's "booking capture lifts state
    automatically" — but the stamp was only ever written by the manual tick, so the card and the
    passport disagreed about the same night. This closes that by doing the writing on a
    schedule, where no screen visit is needed and nothing can be forgotten.

    Only ENDED shows, not merely started: a concert beginning at 20:45 is not over at 20:46.
    Only ticketed ones, because a ticket is the evidence — a show somebody merely saved is a
    plan, and plans fall through.

    Anyone who says "I didn't go" is skipped for ever after, which is what makes an automatic
    stamp safe: it is a good assumption that can be corrected, rather than a claim nobody can
    take back.
    """
    from datetime import timedelta

    from app.db.session import SessionLocal
    from app.models.calendar_entry import CalendarEntry
    from app.models.event import Event
    from app.services import plan as planner

    db: Session = SessionLocal()
    now = datetime.now(timezone.utc)
    out = {"considered": 0, "stamped": 0, "already": 0}
    try:
        rows = (db.query(CalendarEntry, Event)
                  .join(Event, Event.id == CalendarEntry.event_id)
                  .filter(CalendarEntry.is_suggestion.is_(False),
                          CalendarEntry.booked.is_(True),
                          CalendarEntry.state != planner.MISSED,
                          Event.merged_into.is_(None),
                          Event.retired_at.is_(None),
                          Event.starts_at.isnot(None),
                          Event.starts_at < now - timedelta(hours=planner.SHOW_HOURS))
                  .limit(limit).all())
        out["considered"] = len(rows)
        for entry, ev in rows:
            made = record_attendance(db, entry.user_id, ev, source="music_x")
            if made is None:
                out["already"] += 1
                continue
            # Keep the card's cache honest at the same moment, so the two never disagree again.
            entry.state = "attended"
            out["stamped"] += 1
        db.commit()
    finally:
        db.close()
    if out["stamped"]:
        print(f"[passport] {out}")
    return out
