"""What the search filters MEAN — one definition, used by every list that offers them.

Why this is a module and not three sets of WHERE clauses
-------------------------------------------------------
The same nine filters have to work identically on /search, on the events list and on the
festivals list. Written three times they would drift, and this codebase has paid for that
already: venue_lookup.key exists because two ingest paths disagreed about what counted as
the same venue, and the fix was one definition both had to import.

So the filters are built here as SQL fragments plus their bind parameters. Fragments,
rather than ORM expressions, because the hot path (the event match in events.search_local)
is raw SQL and the browse lists are ORM — a list of AND-able strings is the one shape both
can take, via .filter(text(...)) on the ORM side.

The two rules that shape the date filtering
-------------------------------------------
1. A SHOW happens on one day, in the venue's timezone. "Today" therefore compares the
   user's today against `(starts_at AT TIME ZONE the venue's zone)::date`, not against a
   UTC timestamp. Getting this wrong is what once made an event page disagree with every
   list card by a day.
2. The user's "today" is THEIR today. The client sends its IANA zone; without one we fall
   back to UTC rather than guessing from an IP or a locale.

A zoned comparison cannot use an index on starts_at, so every window also carries a coarse
UTC pre-filter a day wider on each side, which can. Same shape the calendar fetch uses:
ask wide on something indexed, then narrow exactly.
"""
from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

WHENS = ("today", "tomorrow", "weekend", "d7", "month", "m3", "custom")
ONSALE = ("now", "coming")
SORTS = ("soonest", "rating")

# Festivals carry no status and no on-sale date. A filter they cannot answer must not be
# answered FOR them: asked for "on sale now", we drop festivals from the results rather
# than assert something no source has told us.
FESTIVALS_CANNOT_ANSWER = ("onsale",)


@dataclass(frozen=True)
class Filters:
    when: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    country: str | None = None
    city_id: UUID | None = None
    onsale: str | None = None
    rating: float | None = None
    following: bool = False
    hide_off: bool = False
    sort: str = "soonest"
    tz: str = "UTC"
    user_id: UUID | None = field(default=None, compare=False)

    @property
    def active(self) -> int:
        """How many filters the user actually set — the number on the funnel badge."""
        return sum(bool(x) for x in (self.when, self.country, self.city_id, self.onsale,
                                     self.rating, self.following, self.hide_off))

    @property
    def excludes_festivals(self) -> bool:
        return any(getattr(self, name) for name in FESTIVALS_CANNOT_ANSWER)


def today_for(tz: str) -> date:
    """The caller's own today. An unknown zone falls back to UTC, never to a guess."""
    try:
        return datetime.now(ZoneInfo(tz or "UTC")).date()
    except Exception:
        return datetime.now(timezone.utc).date()


def window(f: Filters) -> tuple[date | None, date | None]:
    """The date range this filter means, as two of the caller's own calendar days."""
    if f.when == "custom" or (f.date_from or f.date_to):
        return f.date_from, f.date_to
    if not f.when:
        return None, None
    t = today_for(f.tz)
    if f.when == "today":
        return t, t
    if f.when == "tomorrow":
        n = t + timedelta(days=1)
        return n, n
    if f.when == "weekend":
        # Friday to Sunday. Mid-week that means the weekend coming; on Friday, Saturday or
        # Sunday it means the one you are in — nobody asking on a Saturday means next week.
        ahead = (4 - t.weekday()) % 7          # Monday=0 ... Friday=4
        fri = t + timedelta(days=ahead)
        return (t, fri + timedelta(days=2)) if t.weekday() >= 4 else (fri, fri + timedelta(days=2))
    if f.when == "d7":
        return t, t + timedelta(days=6)
    if f.when == "month":
        return t, date(t.year, t.month, monthrange(t.year, t.month)[1])
    if f.when == "m3":
        return t, t + timedelta(days=90)
    return None, None


def _day_expr(a: str) -> str:
    """The calendar day an event happens on, where it happens."""
    return f"(({a}.starts_at AT TIME ZONE COALESCE({a}.timezone, 'UTC'))::date)"


def event_clauses(f: Filters, a: str = "e") -> tuple[list[str], dict]:
    """AND-able SQL for the events table, and the params it needs."""
    out: list[str] = []
    p: dict = {}

    lo, hi = window(f)
    if lo or hi:
        # Undated shows cannot satisfy a date question, so a date filter excludes them.
        if lo:
            out.append(f"{a}.starts_at >= :f_utc_lo")
            p["f_utc_lo"] = datetime.combine(lo - timedelta(days=1), datetime.min.time(),
                                             tzinfo=timezone.utc)
        if hi:
            out.append(f"{a}.starts_at < :f_utc_hi")
            p["f_utc_hi"] = datetime.combine(hi + timedelta(days=2), datetime.min.time(),
                                             tzinfo=timezone.utc)
        if lo and hi:
            out.append(f"{_day_expr(a)} BETWEEN :f_from AND :f_to")
            p["f_from"], p["f_to"] = lo, hi
        elif lo:
            out.append(f"{_day_expr(a)} >= :f_from")
            p["f_from"] = lo
        else:
            out.append(f"{_day_expr(a)} <= :f_to")
            p["f_to"] = hi

    if f.country:
        # EXISTS rather than a join, so callers do not have to change their FROM clause and
        # a filter can never multiply their rows.
        out.append(f"EXISTS (SELECT 1 FROM venues v JOIN cities c ON c.id = v.city_id "
                   f"WHERE v.id = {a}.venue_id AND c.country = :f_country)")
        p["f_country"] = f.country.upper()[:2]

    if f.city_id:
        out.append(f"EXISTS (SELECT 1 FROM venues v WHERE v.id = {a}.venue_id "
                   f"AND v.city_id = :f_city)")
        p["f_city"] = f.city_id

    if f.onsale == "now":
        out.append(f"{a}.onsale_at IS NOT NULL AND {a}.onsale_at <= now() "
                   f"AND ({a}.sales_end_at IS NULL OR {a}.sales_end_at > now())")
    elif f.onsale == "coming":
        out.append(f"{a}.onsale_at > now()")

    if f.rating:
        # No mxs is NOT below the bar, it is unknown — and an unknown cannot claim to clear
        # a threshold, so it is excluded rather than treated as zero.
        out.append(f"{a}.mxs >= :f_rating")
        p["f_rating"] = f.rating

    if f.hide_off:
        out.append(f"{a}.status = 'scheduled'")

    if f.following and f.user_id:
        out.append(
            "EXISTS (SELECT 1 FROM follows fo WHERE fo.user_id = :f_uid "
            "AND fo.followable_type = 'artist' AND ("
            f"fo.followable_id = {a}.headliner_artist_id OR fo.followable_id IN "
            f"(SELECT ea.artist_id FROM event_artists ea WHERE ea.event_id = {a}.id)))")
        p["f_uid"] = f.user_id

    return out, p


def festival_clauses(f: Filters, a: str = "f") -> tuple[list[str], dict]:
    """The same filters against festivals, minus the two they cannot answer.

    Festival dates are DATE columns already, so there is no timezone question: a festival
    runs on the days its organiser named. The window is an OVERLAP, not containment — a
    five-day festival you could walk into today matches "today" even though it began last
    week.
    """
    out: list[str] = []
    p: dict = {}

    lo, hi = window(f)
    if hi:
        out.append(f"{a}.starts_on <= :ff_to")
        p["ff_to"] = hi
    if lo:
        out.append(f"COALESCE({a}.ends_on, {a}.starts_on) >= :ff_from")
        p["ff_from"] = lo

    if f.country:
        out.append(f"EXISTS (SELECT 1 FROM cities c WHERE c.id = {a}.city_id "
                   f"AND c.country = :ff_country)")
        p["ff_country"] = f.country.upper()[:2]

    if f.city_id:
        out.append(f"{a}.city_id = :ff_city")
        p["ff_city"] = f.city_id

    if f.rating:
        out.append(f"{a}.mxs >= :ff_rating")
        p["ff_rating"] = f.rating

    if f.following and f.user_id:
        out.append(
            "EXISTS (SELECT 1 FROM follows fo JOIN festival_lineup fl "
            "ON fl.artist_id = fo.followable_id "
            f"WHERE fo.user_id = :ff_uid AND fo.followable_type = 'artist' "
            f"AND fl.festival_id = {a}.id)")
        p["ff_uid"] = f.user_id

    # onsale and hide_off are deliberately absent: no festival source tells us either.
    return out, p


def sql_and(clauses: list[str]) -> str:
    """Fragment for a raw-SQL caller: ' AND (...) AND (...)', or '' when nothing is set."""
    return "".join(f" AND ({c})" for c in clauses)


def allowed_event_ids(db, f: Filters) -> set | None:
    """The ids of every event these filters allow, or None when nothing is set.

    For a caller that has already built its list in Python and cannot push the filters into
    its own query — the taste feed does exactly that. It costs one round trip and, crucially,
    reuses the clauses above rather than reimplementing them in Python, which is how the
    filters would come to mean two different things on two screens.
    """
    if not f.active:
        return None
    from sqlalchemy import text as _text
    clauses, params = event_clauses(f, "e")
    rows = db.execute(_text(
        "SELECT e.id FROM events e WHERE e.merged_into IS NULL AND e.retired_at IS NULL"
        + sql_and(clauses)), params).all()
    return {r[0] for r in rows}
