"""Planning one journey across several cities.

Given where you start, when you are free, and how far you will go, this picks the best shows
that actually fit — and "fit" is the whole problem.

THE MOCKUP'S ALGORITHM IS WRONG IN ONE IMPORTANT WAY, and it is worth writing down because the
output looks fine until you read it. It measures travel from the ORIGIN to every show
independently, then sorts by date and calls the result an itinerary. Run against the real
catalogue from London it produced:

    Sep 2  Bruno Mars     Philadelphia   ~9h
    Sep 4  Muse tribute   London         ~0h
    Sep 5  Bruno Mars     Foxborough     ~9h

— London, America, home again for a tribute act, back to America. It also charged 9h three
times for a crossing you would make once, so the "60h of travel" was fiction.

Here the cost of a show is the leg FROM WHEREVER YOU ALREADY ARE, in date order, and a leg is
refused if there is not enough time between two shows to make it. That is what turns a list of
good gigs into a trip.

Travel time is an ESTIMATE — two hours of getting to and from airports plus distance at 800km/h
— and every figure it produces is shown with a "~". Real flights exist on the event page, one
leg at a time, where a live search is worth waiting for. Doing it here would mean an airport
lookup and a 10-45 second search PER LEG against a service that is regularly down.
"""
import math
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.city import City
from app.models.event import Event
from app.models.venue import Venue

# How far each mode will let you travel, in hours, over the whole trip.
MODES = {
    "local":    0,      # only your own city — no travel budget at all
    "regional": 16,     # your country
    "fly":      60,     # anywhere
}
# Airport time, security, getting into town. Applied once per leg that is not a local hop.
OVERHEAD_HOURS = 2.0
CRUISE_KMH = 800.0
# The minimum gap between two shows for a leg to be possible at all. A journey does not start
# the moment the last encore ends.
MIN_GAP_HOURS = 8.0
MAX_STOPS = 12
# How many times one act may appear. Ranking purely by score followed a single tour around
# America — twelve stops, ten of them Bruno Mars — because the same artist scores the same
# everywhere. Following one tour IS a real kind of trip, but it is not "one perfect trip", and
# somebody who wanted it would search that artist instead. Two lets you catch a favourite twice
# without the trip becoming a tour bus.
MAX_PER_ARTIST = 2


def travel_hours(a: tuple, b: tuple) -> float | None:
    """Great-circle distance turned into a rough door-to-door time. None if either end is
    unlocated — an unknown distance must not silently become zero."""
    if a is None or b is None or a[0] is None or a[1] is None or b[0] is None or b[1] is None:
        return None
    if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6:
        return 0.0
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    km = 2 * R * math.asin(math.sqrt(h))
    if km < 60:                       # same conurbation; a train ride, not a journey
        return 0.0
    return round(OVERHEAD_HOURS + km / CRUISE_KMH, 1)


def _candidates(db: Session, origin: City, start: date, end: date, mode: str, limit: int):
    """Every show that could possibly be in this trip, best-rated first."""
    lo = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
    hi = datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc)
    q = (db.query(Event, City)
           .join(Venue, Venue.id == Event.venue_id)
           .join(City, City.id == Venue.city_id)
           .filter(Event.merged_into.is_(None), Event.retired_at.is_(None),
                   Event.starts_at.between(lo, hi),
                   City.lat.isnot(None), City.lng.isnot(None),
                   # UNSCORED SHOWS ARE EXCLUDED rather than defaulted to a middling score.
                   # A quarter of the catalogue has no rating, and inventing one would rank
                   # them above shows we have actually assessed.
                   Event.mxs.isnot(None)))
    if mode == "local":
        q = q.filter(City.id == origin.id)
    elif mode == "regional":
        q = q.filter(City.country == origin.country)
    return q.order_by(Event.mxs.desc()).limit(limit).all()


def plan(db: Session, origin: City, start: date, end: date, mode: str = "fly",
         max_stops: int = MAX_STOPS) -> dict:
    """Build the itinerary. Returns the chosen stops in date order with per-leg travel."""
    budget = MODES.get(mode, MODES["fly"])
    rows = _candidates(db, origin, start, end, mode, limit=600)

    here = (origin.lat, origin.lng)
    chosen: list = []
    used = 0.0
    taken_days: set = set()
    per_artist: dict = {}

    # Best-rated first, but each one costed against the route it would join — which means
    # inserting it in date order and checking both neighbours, not measuring from home.
    for ev, city in rows:
        if len(chosen) >= max_stops:
            break
        day = ev.starts_at.date()
        if day in taken_days:
            continue          # one show a day; two in a night is not a plan, it is a wish
        # Keyed on the headliner where we know it, falling back to the title so a run of
        # identically-named shows cannot slip through as different artists.
        who = ev.headliner_artist_id or (ev.title or "")
        if per_artist.get(who, 0) >= MAX_PER_ARTIST:
            continue

        pos = sum(1 for c in chosen if c["event"].starts_at < ev.starts_at)
        before = chosen[pos - 1] if pos > 0 else None
        after = chosen[pos] if pos < len(chosen) else None

        from_pt = (before["city"].lat, before["city"].lng) if before else here
        leg = travel_hours(from_pt, (city.lat, city.lng))
        if leg is None:
            continue

        # What this stop really costs: its own leg, plus how much longer it makes the next one.
        onward_before = 0.0 if after is None else (after["travel_hours"] or 0.0)
        onward_after = 0.0
        if after is not None:
            onward_after = travel_hours((city.lat, city.lng),
                                        (after["city"].lat, after["city"].lng)) or 0.0
        delta = leg + onward_after - onward_before
        if used + delta > budget + 1e-9:
            continue

        # Is there time to make the journey between the two shows either side of it?
        if before is not None:
            gap = (ev.starts_at - before["event"].starts_at).total_seconds() / 3600
            if gap < max(MIN_GAP_HOURS, leg + 3):
                continue
        if after is not None:
            gap = (after["event"].starts_at - ev.starts_at).total_seconds() / 3600
            if gap < max(MIN_GAP_HOURS, onward_after + 3):
                continue

        stop = {"event": ev, "city": city, "travel_hours": leg}
        chosen.insert(pos, stop)
        per_artist[who] = per_artist.get(who, 0) + 1
        if after is not None:
            after["travel_hours"] = onward_after
        used += delta
        taken_days.add(day)

    return {
        "origin": origin,
        "mode": mode,
        "budget_hours": budget,
        "used_hours": round(used, 1),
        "stops": chosen,
        "cities": len({c["city"].id for c in chosen}),
    }
