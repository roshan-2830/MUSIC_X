"""MXS (Music Experience Score) — PRD F2.

MXS = 0.35·Artist + 0.25·Rarity + 0.15·Venue + 0.15·Production + 0.10·Context,
blended over the components we can compute *with real data*, then rank-calibrated
across the upcoming cohort (hard ceiling: only the top ~2% reach 9.0+).

Rarity comes from the tour graph — every upcoming date of every tour, already in our
own database — so it no longer waits for a promoter to type "farewell" in a title.
See build_tour_graph for the coverage asymmetry that decides its confidence.

Trust rule ("absence over guess"): a component with no real data is left OUT (not
faked); its weight is re-normalised away. Production is parked (no honest source).
Every score stores reason chips + per-component confidence in mxs_breakdown.
"""
import bisect
import math
from datetime import datetime, timezone

from sqlalchemy import bindparam as sa_bindparam, text, update as sa_update
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.models.event import Event
from app.models.event_artist import EventArtist
from app.models.venue import Venue
from app.services.deezer import artist_fans

WEIGHTS = {"artist": 0.35, "rarity": 0.25, "venue": 0.15, "production": 0.15, "context": 0.10}

# Rarity: rare-occasion phrases in the title/description (real evidence).
RARE_WORDS = (
    "farewell", "final tour", "reunion", "reunited", "one night only", "one-off",
    "last ever", "anniversary tour", "comeback", "reunion tour", "farewell tour",
    "final show", "only uk", "only us show",
    # "exclusive" was here and is gone: it matches marketing copy on hospitality
    # packages and support-act billing, not a statement that a show is scarce.
)
# Context: special-occasion signals.
SPECIAL_WORDS = ("anniversary", "tour finale", "album launch", "world premiere", "residency")

# Rarity from the tour graph. Adjustments are in log10(dates) units, so they read as
# "treat this as if the artist had N times more dates" — an interpretable scale rather
# than an invented 0-10 curve. The cohort ranking turns the result into a percentile.
RESIDENCY_MIN_DATES = 5      # below this, a venue concentration is not a residency
RESIDENCY_SHARE = 0.8        # 80%+ of an artist's dates at one address
RESIDENCY_PENALTY = 1.0      # ...scores as if they had 10x the dates
COUNTRY_ONLY_BONUS = 0.5     # sole date in this country, on a tour that visits others
RARE_WORD_BONUS = 0.75       # the source itself says farewell / final / one-off

# Below this audience we do not rank an act's stature at all — see stature_from_bill.
# 5,000 is not a new number: it is already the line this file uses to decide whether it
# trusts a popularity figure enough to call the component high-confidence.
STATURE_FLOOR = 5_000

# Production. No honest source existed for this until it turned out we were already
# collecting one: Ticketmaster hands us the promoter and whether the room has a seatmap,
# and both are facts about the scale of the night rather than opinions about it. A Live
# Nation arena date and a pub gig billed "promoted by the venue" are a real difference.
#
# setlist.fm remains the better long-term signal — how many songs the tour is actually
# playing. It is unreachable from the machine this was written on, but NOT because of
# anything at setlist.fm: a FortiGate firewall on that network intercepts the connection
# and re-signs it with its own CA, which no trust store accepts. Deezer and Wikidata come
# through untouched. It should work from Render.
MAJOR_PROMOTERS = (
    "LIVE NATION", "AEG", "S.J.M", "SJM CONCERTS", "MCD PRODUCTIONS", "DF CONCERTS",
    "KILIMANJARO", "CUFFE & TAYLOR", "ACADEMY EVENTS", "FKP SCORPIO", "SEMMEL",
    "MOJO", "GOLDENVOICE", "C3 PRESENTS", "MESSINA", "FRONTIER TOURING",
)
# Ticketmaster's own label for "the venue is putting this on itself", which is what a
# small local night looks like in this data.
VENUE_PROMOTED = "PROMOTED BY VENUE"


def _fans_to_score(fans: int) -> float:
    if not fans or fans < 1:
        return 0.0
    return round(max(0.0, min(10.0, (math.log10(fans) - 2.5) / 4.0 * 10)), 2)


def _fmt(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{round(n / 1_000)}K"
    return str(n)


def _pct(sorted_vals: list, v: float) -> float:
    n = len(sorted_vals)
    return (bisect.bisect_right(sorted_vals, v) - 1) / (n - 1) if n > 1 else 1.0


def _calibrate(pct: float) -> float:
    if pct >= 0.98:
        return 9.0 + (pct - 0.98) / 0.02      # top 2% -> 9..10
    return pct / 0.98 * 9.0                    # everyone else -> 0..9


# ---------- components (return None when we have no real signal) ----------

def _artist_stature(db, ev, cache, bills=None, artists=None):
    """Artist stature. ONE source decides the ranking; the other only fills gaps.

    Deezer and Last.fm disagree about popularity by 16 percentage points on average, and
    by more than 20 points on 190 of the 724 artists where we hold both (measured
    2026-08-18). The disagreement is not noise, it is a population difference: Last.fm's
    users have always been rock and metal listeners, so Korn ranks at the 98th percentile
    there and the 13th on Deezer. Rush, Mogwai and Europe show the same 85-90 point gap.

    Percentile-ranking fixes the SCALE difference between followers and listeners. It does
    not fix that. So two rules:

      1. **Deezer decides whenever it knows the artist.** Every artist ranked against the
         same crowd, so ratings stay comparable to each other.
      2. **Last.fm is a fallback, not a tiebreak.** It scores artists Deezer has never
         heard of — 108 of them here, previously unrateable — and those carry lower
         confidence, because we are ranking them against a different population and we
         know it.

    An earlier version took the BEST of the two rankings. That inflated dual-source
    artists by 8 points on average (60.8% vs 52.8% averaged) for no reason other than
    having had two draws. Taking the max of two samples is not a measurement.
    """
    if bills is not None:
        rows = bills.get(ev.id) or []
        if not rows and ev.headliner_artist_id:
            a = (artists or {}).get(ev.headliner_artist_id)
            rows = [a] if a else []
    else:
        # Live-search path: a handful of ids, so a query each is cheaper than a preload.
        rows = (
            db.query(Artist)
            .join(EventArtist, EventArtist.artist_id == Artist.id)
            .filter(EventArtist.event_id == ev.id)
            .order_by(EventArtist.sort_order, Artist.name).all()
        )
        if not rows and ev.headliner_artist_id:
            a = db.get(Artist, ev.headliner_artist_id)
            if a:
                rows = [a]
    return stature_from_bill(db, rows, cache)


def stature_from_bill(db, rows, cache, live: bool = True):
    """The artist component, given a bill — shared with the festival scorer.

    Split out of _artist_stature so a festival's line-up is judged by the SAME rule as a
    concert's. Two scorers with their own copy of "Deezer decides, Last.fm only fills gaps"
    would drift, and the rule above took measurement over 724 artists to arrive at.

    `live=False` forbids the Deezer fallback and scores only from what is stored. Needed
    because a festival bill is long and mostly un-enriched: the first festival run faced
    2,460 artists with no cached fan count and started fetching them one at a time while
    holding a database connection open — the exact failure backfill_popularity's docstring
    was written about, where Supabase's pooler drops an idle connection after ten minutes.
    Enrichment fetches; scoring reads. That was always the design.
    """
    rows = [a for a in (rows or []) if a.name and a.name.strip().upper() not in ("TBA", "VARIOUS")]
    if not rows:
        return None

    dz, lf = [], []
    for a in rows[:6]:
        # Only acts enrichment has never seen. `popularity_checked_on` set with no
        # deezer_fans is enrichment reporting a finding — "Deezer does not know this
        # artist" — not a gap to re-probe. Re-probing it anyway had scoring make 1,118
        # doomed Deezer calls per run while holding one connection, which is 23 minutes
        # of serial HTTP and well past the ten the Supabase pooler tolerates: the run
        # died on "server closed the connection unexpectedly".
        needs_probe = (a.deezer_fans is None and a.popularity_checked_on is None
                       and a.name not in cache)
        if live and needs_probe:
            cache[a.name] = artist_fans(a.name) or 0     # fallback for un-enriched acts
        d = a.deezer_fans if a.deezer_fans is not None else cache.get(a.name, 0)
        if d and d > 0:
            dz.append(d)
        if a.lastfm_listeners and a.lastfm_listeners > 0:
            lf.append(a.lastfm_listeners)

    if not dz and not lf:
        return None

    top_dz, top_lf = (max(dz) if dz else None), (max(lf) if lf else None)
    # A bill with several sizeable acts is a bigger night than one act plus support.
    strong = sum(1 for f in (dz or lf) if f >= 50_000)
    bump = min(0.4, 0.15 * (strong - 1)) if strong > 1 else 0.0

    # Deezer decides when it knows the artist. Last.fm only when Deezer does not.
    if top_dz:
        source, best, unit = "deezer", top_dz, "fans"
    else:
        source, best, unit = "lastfm", top_lf, "listeners"

    label = "Deezer" if source == "deezer" else "Last.fm"
    reason = f"{_fmt(best)} {unit} on {label}"
    if len(rows) > 1:
        reason += f" · {len(rows)} acts billed"

    # A fallback ranking is ranked against a different crowd, so it never claims high
    # confidence however big the number is.
    if source == "deezer":
        confidence = "high" if best >= STATURE_FLOOR else "low"
    else:
        confidence = "medium" if best >= STATURE_FLOOR else "low"
        reason += " (Deezer has no data — ranked separately)"

    # Under the floor an act is not ranked against its cohort, it is placed at the bottom
    # of the scale. Percentile-ranking a cohort that is mostly micro-acts grades on a
    # curve: 270 of the 321 artists Deezer has never heard of have under 1,000 listeners,
    # so TinFish's 502 came out at the 81st percentile of that crowd and scored 8.7 —
    # beside Belle & Sebastian's 1.8M at 10.0. Being marginally less unknown than the
    # other unknowns is not stature. A small following is a fact we can state, so we do,
    # instead of grading it generously or refusing to answer.
    below_floor = best < STATURE_FLOOR
    if below_floor:
        reason += " · small following"

    return {
        "source": source,
        "raw": math.log10(best) + bump,
        "provisional": _fans_to_score(best),
        "confidence": confidence,
        "reason": reason,
        "below_floor": below_floor,
    }


# ---------- the tour graph ----------

def build_tour_graph(db, cutoff) -> dict:
    """Count every upcoming date of every tour, once, before scoring starts.

    Rarity used to read the event title for words like "farewell" and fired on 486 of
    11,658 upcoming shows — 4.2% — because it depended on a promoter typing a magic word
    into a field. The shape of a tour is already in our own database and answers the same
    question with evidence: how many dates, spread over how many countries, and how many
    of them at this one address.

    One asymmetry runs through the component, and it is what makes this honest rather
    than merely clever. Our catalogue is Ticketmaster's, so:

      * Seeing MANY dates is strong evidence a show is NOT rare. ABBA Voyage has 151
        dates at one venue; Tablao Flamenco 1911 has 556. No coverage gap invents those.
      * Seeing ONE date is weak evidence a show IS rare. It may be the artist's only
        appearance anywhere, or merely the only leg Ticketmaster sells us.

    So a crowded tour is marked down with high confidence, a lone date is marked up with
    low confidence, and the reason chips say "listed" instead of claiming the world.

    Built with four aggregates rather than a query per event: scoring walks ~11,700
    events, and asking the database once each is the N+1 that took the events list from
    2.17 MB and four round trips down to one.
    """
    where = ("e.starts_at >= :cut AND e.retired_at IS NULL "
             "AND e.headliner_artist_id IS NOT NULL")
    args = {"cut": cutoff}

    # Total dates per artist — no venue join, so the 381 venue-less events still count.
    totals = dict(db.execute(text(
        f"SELECT e.headliner_artist_id, count(*) FROM events e WHERE {where} GROUP BY 1"
    ), args).all())

    # Dates per artist per country.
    by_country: dict = {}
    for aid, ctry, n in db.execute(text(
        f"""SELECT e.headliner_artist_id, c.country, count(*)
            FROM events e
            JOIN venues v ON v.id = e.venue_id
            JOIN cities c ON c.id = v.city_id
            WHERE {where} AND c.country IS NOT NULL
            GROUP BY 1, 2"""), args).all():
        by_country.setdefault(aid, {})[ctry] = n

    # Biggest single-venue block per artist, and how many of their dates have a venue.
    venue_block = {
        aid: (top, tot) for aid, top, tot in db.execute(text(
            f"""SELECT aid, max(n), sum(n) FROM (
                    SELECT e.headliner_artist_id aid, e.venue_id vid, count(*) n
                    FROM events e WHERE {where} AND e.venue_id IS NOT NULL
                    GROUP BY 1, 2) t
                GROUP BY aid"""), args).all()
    }

    # venue -> country, so an event knows its own country without a query.
    venue_country = dict(db.execute(text(
        "SELECT v.id, c.country FROM venues v JOIN cities c ON c.id = v.city_id"
    )).all())

    # First and last night of each tour. An opening night and a closing night are both
    # occasions in a way the twelfth date is not, and this costs one more aggregate over
    # data the graph is already reading.
    ends = {aid: (first, last) for aid, first, last in db.execute(text(
        f"""SELECT e.headliner_artist_id, min(e.starts_at), max(e.starts_at)
            FROM events e WHERE {where} AND e.starts_at IS NOT NULL
            GROUP BY 1"""), args).all()}

    return {"totals": totals, "by_country": by_country,
            "venue_block": venue_block, "venue_country": venue_country,
            "ends": ends}


def build_bill_index(db, cutoff) -> tuple[dict, dict]:
    """Every event's line-up, and every artist by id, in two queries.

    _artist_stature used to run one query per event to fetch its bill, and
    _venue_component one per venue. Over 11,900 events that is ~24,000 sequential
    round trips to a database in Singapore, which is both slow and brittle: two full
    runs died mid-pass, one on the Supabase pooler closing an idle connection and one
    on a local socket error, and a single network blip anywhere in a five-minute run
    loses the whole thing.

    Same treatment as build_tour_graph, and the same treatment the events list already
    had for the same reason. 14,991 bill rows over 5,988 artists load in one pass.
    """
    bills: dict = {}
    rows = (db.query(EventArtist.event_id, Artist)
              .join(Artist, Artist.id == EventArtist.artist_id)
              .join(Event, Event.id == EventArtist.event_id)
              .filter((Event.starts_at >= cutoff) | (Event.starts_at.is_(None)))
              # Artist.name breaks ties in sort_order — see the note in
              # festival_scoring.build_festival_index. Only the first six count.
              .order_by(EventArtist.event_id, EventArtist.sort_order, Artist.name).all())
    for eid, a in rows:
        bills.setdefault(eid, []).append(a)
    # Headliners are reached by id when an event has no event_artists rows at all.
    artists = {a.id: a for a in db.query(Artist).all()}
    return bills, artists


def build_facts_index(db, cutoff) -> dict:
    """promoter and seatmap per event, in one query.

    event_facts holds 150,200 rows across 20 keys; two of them are the production signal.
    Loaded in a single pass for the same reason as the bills and the tour graph — scoring
    walks ~10,000 events and asking per event is the N+1 that kept killing this job.
    """
    out: dict = {}
    rows = db.execute(text("""
        SELECT f.event_id, f.fact_key, f.fact_value
        FROM event_facts f
        JOIN events e ON e.id = f.event_id
        WHERE f.fact_key IN ('promoter', 'seatmap')
          AND (e.starts_at >= :cut OR e.starts_at IS NULL)
          AND e.retired_at IS NULL
    """), {"cut": cutoff}).all()
    for eid, key, val in rows:
        out.setdefault(eid, {})[key] = val
    return out


def build_venue_index(db) -> dict:
    """venue id -> capacity. One query instead of one per event."""
    return {vid: cap for vid, cap in db.query(Venue.id, Venue.capacity).all()}


def _venue_component(ev, caps):
    if not ev.venue_id:
        return None
    cap = caps.get(ev.venue_id)
    if not cap or cap < 1:
        return None
    return {"raw": math.log10(cap), "confidence": "high", "reason": f"{cap:,}-cap venue"}


def _rarity_component(ev, graph):
    """Scarcity of THIS date, from the tour graph plus what the source says outright.

    Returns a `raw` in log10(dates) units for the cohort to rank, never a hand-made
    score. Confidence follows the asymmetry in build_tour_graph: high when we have
    positively observed a real tour or a residency, low when we are inferring rarity
    from a single listing that our one source may simply not cover.
    """
    blurb = f"{ev.title or ''} {ev.description or ''}".lower()
    word = next((w for w in RARE_WORDS if w in blurb), None)

    aid = ev.headliner_artist_id
    dates = graph["totals"].get(aid) if aid else None

    if not dates:
        # No tour to look at. A stated rare occasion is still real evidence on its own.
        if not word:
            return None
        return {"raw": RARE_WORD_BONUS, "confidence": "high",
                "reason": f"Rare occasion · “{word}”"}

    # A single listed date was the highest raw in the cohort, which had the component
    # backwards: the least-evidenced events were getting the biggest lift. We hold one
    # source, so "one date" much more often means "the only leg Ticketmaster sells" than
    # "the only show on earth". No comparison is possible, so there is no signal — the
    # same absence-over-guess rule the rest of the scorer follows.
    if dates == 1 and not word:
        return None

    raw = -math.log10(dates)
    bits = []

    # Residency: many dates at one address is the clearest "not rare" there is.
    top, with_venue = graph["venue_block"].get(aid, (0, 0))
    resident = (with_venue >= RESIDENCY_MIN_DATES
                and top / with_venue >= RESIDENCY_SHARE)
    if resident:
        raw -= RESIDENCY_PENALTY
        bits.append(f"Resident run · {top} dates at one venue")
    elif dates == 1:
        bits.append("Only date listed")
    else:
        bits.append(f"1 of {dates} dates listed")

    # Sole date in this country, on a tour that visits others.
    if not resident and ev.venue_id:
        ctry = graph["venue_country"].get(ev.venue_id)
        spread = graph["by_country"].get(aid) or {}
        if ctry and len(spread) > 1 and spread.get(ctry) == 1:
            raw += COUNTRY_ONLY_BONUS
            bits.append(f"only date in {ctry}")

    if word:
        raw += RARE_WORD_BONUS
        bits.append(f"“{word}”")

    if resident or word or dates >= 8:
        confidence = "high"          # positively observed, not inferred from absence
    elif dates >= 2:
        confidence = "medium"
    else:
        confidence = "low"           # one listing may just be our one source's reach

    return {"raw": round(raw, 4), "confidence": confidence, "reason": " · ".join(bits)}


def _production_component(ev, facts):
    """How big a production this is, from who is putting it on and how the room is sold.

    Neither signal is a measurement of the show itself, and the component says so through
    its confidence: a promoter name is strong evidence of scale (Live Nation does not book
    pub back rooms), a seatmap alone is weaker (it says the room has numbered seats, which
    a 300-seat theatre also has).

    `pct` rather than `raw`: these are bands, not a continuum. Ranking four discrete
    values against a cohort would invent precision that is not in the data.
    """
    f = facts.get(ev.id) or {}
    promoter = (f.get("promoter") or "").strip()
    up = promoter.upper()
    has_seatmap = bool(f.get("seatmap"))

    if promoter and any(m in up for m in MAJOR_PROMOTERS):
        return {"pct": 0.9, "confidence": "high",
                "reason": f"Promoted by {promoter.title()}"}
    if VENUE_PROMOTED in up:
        # The venue running its own night: a real signal, and a modest one.
        return {"pct": 0.3, "confidence": "medium",
                "reason": "Put on by the venue itself"
                          + (" · seated room" if has_seatmap else "")}
    if promoter:
        return {"pct": 0.55, "confidence": "medium",
                "reason": f"Promoted by {promoter.title()}"}
    if has_seatmap:
        return {"pct": 0.5, "confidence": "low", "reason": "Seated, numbered room"}
    return None


# A tour has to be long enough for its ends to mean anything. Two dates do not have an
# opening night, they have two nights.
TOUR_ENDS_MIN_DATES = 4


def _context_component(ev, graph=None):
    """The occasion. What makes THIS date different from the others on the tour.

    Deliberately not day-of-week. A Saturday show is easier to attend, which is a fact
    about your calendar rather than about the night — rewarding it would push every
    weekend date up the rankings for no reason connected to the music.
    """
    # Not named `text`: that is sqlalchemy.text at module level now, and shadowing it
    # inside a function is the kind of quiet trap that bites whoever edits this next.
    blurb = f"{ev.title or ''} {ev.description or ''}".lower()
    if "festival" in blurb or " fest" in blurb:
        return {"pct": 0.85, "confidence": "high", "reason": "Festival"}
    hit = next((w for w in SPECIAL_WORDS if w in blurb), None)
    if hit:
        return {"pct": 0.7, "confidence": "medium", "reason": hit.capitalize()}

    # Opening or closing night, straight from the tour graph.
    if graph and ev.headliner_artist_id and ev.starts_at:
        aid = ev.headliner_artist_id
        if (graph["totals"].get(aid) or 0) >= TOUR_ENDS_MIN_DATES:
            first, last = (graph.get("ends") or {}).get(aid, (None, None))
            if first and ev.starts_at == first:
                return {"pct": 0.75, "confidence": "high", "reason": "Opening night of the tour"}
            if last and ev.starts_at == last:
                return {"pct": 0.75, "confidence": "high", "reason": "Final night of the tour"}
    return None


def _collect(db, ev, cache, graph, bills=None, artists=None, caps=None, facts=None):
    comps = {}
    a = _artist_stature(db, ev, cache, bills, artists)
    if a:
        comps["artist"] = {"weight": WEIGHTS["artist"], "raw": a["raw"],
                           "confidence": a["confidence"], "reason": a["reason"],
                           "source": a["source"], "below_floor": a["below_floor"]}
    v = _venue_component(ev, caps or {})
    if v:
        comps["venue"] = {"weight": WEIGHTS["venue"], "raw": v["raw"], "confidence": v["confidence"], "reason": v["reason"]}
    r = _rarity_component(ev, graph)
    if r:
        comps["rarity"] = {"weight": WEIGHTS["rarity"], "raw": r["raw"],
                           "confidence": r["confidence"], "reason": r["reason"]}
    pr = _production_component(ev, facts or {})
    if pr:
        comps["production"] = {"weight": WEIGHTS["production"], "pct": pr["pct"],
                               "confidence": pr["confidence"], "reason": pr["reason"]}
    c = _context_component(ev, graph)
    if c:
        comps["context"] = {"weight": WEIGHTS["context"], "pct": c["pct"], "confidence": c["confidence"], "reason": c["reason"]}

    # Rarity modulates a show; it cannot be the whole of one. Left to stand alone it put
    # "Gavit Class of '97 Reunion Concert" at 10.0 — top of the entire catalogue, above
    # Bob Dylan — on the word "reunion" and nothing else, and dropped hospitality packages
    # to 1.5 by the same route. Scarcity of an act we cannot measure says nothing about
    # the experience, so these go back to an honest "no rating".
    if set(comps) == {"rarity"}:
        comps.pop("rarity")
    return comps


def score_all_events():
    """Nightly job: re-score all UPCOMING events. Continuous components (artist, venue)
    are percentile-ranked within the cohort; signal components (rarity, context) carry a
    fixed percentile; blend by weight; ordinal-rank so only the top ~2% reach 9+."""
    db: Session = SessionLocal()
    cache: dict[str, int] = {}
    try:
        cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        events = db.query(Event).filter((Event.starts_at >= cutoff) | (Event.starts_at.is_(None))).all()
        graph = build_tour_graph(db, cutoff)
        bills, artists = build_bill_index(db, cutoff)
        caps = build_venue_index(db)
        facts = build_facts_index(db, cutoff)

        blended = []   # (ev, comps)
        unscored = []  # rows with nothing trustworthy to go on
        for ev in events:
            comps = _collect(db, ev, cache, graph, bills, artists, caps, facts)
            if not comps:
                # Collected rather than assigned: these go out through the same Core update
                # as the scored rows, so a row deleted mid-pass is skipped instead of
                # aborting the run. See the note above the write loop.
                unscored.append(ev.id)
                continue
            blended.append((ev, comps))

        # Percentile-rank each continuous component against its own cohort. The artist
        # component has two possible cohorts, and an artist sits in exactly ONE of them:
        # those Deezer knows, and those only Last.fm knows. They are never mixed, and an
        # artist is never ranked twice and given the better result.
        ranked = {}
        for name in ("venue", "rarity"):
            vals = sorted(c[name]["raw"] for _, c in blended if name in c)
            if vals:
                ranked[name] = vals
        # Below-floor acts are excluded from the cohort as well as from the ranking: left
        # in, they are most of it, and they drag the median down so everyone above the
        # floor is ranked against noise.
        by_source = {}
        for _, c in blended:
            a = c.get("artist")
            if a and not a.get("below_floor"):
                by_source.setdefault(a["source"], []).append(a["raw"])
        for src in by_source:
            by_source[src].sort()

        rows = []  # (ev, comps, blend_pct)
        for ev, comps in blended:
            parts = []
            for name, c in comps.items():
                if name == "artist":
                    cohort = by_source.get(c["source"])
                    if c.get("below_floor") or not cohort:
                        c["pct"] = 0.0
                        c["ranked_against"] = "floor"
                    else:
                        c["pct"] = _pct(cohort, c["raw"])
                        c["ranked_against"] = c["source"]
                elif "raw" in c:
                    c["pct"] = _pct(ranked[name], c["raw"])
                parts.append((c["pct"], c["weight"]))
            wsum = sum(w for _, w in parts)
            rows.append((ev, comps, sum(p * w for p, w in parts) / wsum))

        # Sort on the blend, then on id to break ties.
        #
        # The id is not decoration. The final score is an ordinal rank — position in this
        # list divided by its length — and 4,370 events blend to exactly the same value
        # (an artist at the stature floor with nothing else to go on). Sorting on the blend
        # alone leaves those ties in whatever order the query returned, and
        # `db.query(Event)...all()` has no ORDER BY, so Postgres is free to hand them back
        # differently every time. Measured: two runs over identical, frozen inputs produced
        # 3,094 different scores, and that block of ties spread across 0.0 to 2.9 — the same
        # show could be rated anywhere in a three-point band from one night to the next.
        #
        # Same defect as the bill ordering in build_bill_index, in a different place: a rank
        # computed over ties is only reproducible if the ties are broken by something fixed.
        rows.sort(key=lambda r: (r[2], str(r[0].id)))
        m = len(rows)

        # Write in chunks, by primary key, through Core rather than the ORM.
        #
        # THE LOCK. A single transaction covering ~9,000 events held a write lock on
        # `events` for the length of the whole pass. refresh_catalogue updates the same
        # table, queued behind it, and was killed by Supabase's statement timeout:
        #   QueryCanceled ... CONTEXT: while updating tuple (348,2) in relation "events"
        # Its own query is not slow — 35 ids match in 0.056s on uq_event_source — it was
        # purely waiting. Short transactions let the two jobs interleave, and a pass that
        # dies halfway keeps the work it already wrote instead of discarding all of it.
        #
        # WHY NOT THE ORM. Chunking through the unit of work reintroduced a different
        # failure: the pass now spans several commits, and the sweep deletes duplicate rows
        # while it runs, so a row loaded at the start can be gone by the time its chunk
        # flushes. The ORM reads that as a conflict and aborts the whole run —
        #   StaleDataError: UPDATE expected to update 3 row(s); 2 were matched
        # A Core update keyed on id simply matches nothing for a row that no longer exists,
        # which is the correct behaviour: the event is gone, so its score is moot. It also
        # skips building 9,000 unit-of-work records, and sidesteps expire_on_commit
        # re-SELECTing every instance after each chunk.
        #
        # Ranking is settled above, so committing partway cannot change a single score.
        CHUNK = 500
        stmt = (
            sa_update(Event.__table__)
            .where(Event.__table__.c.id == sa_bindparam("_id"))
            .values(mxs=sa_bindparam("_mxs"), mxs_breakdown=sa_bindparam("_bd"))
        )
        payload: list[dict] = []

        def flush():
            if payload:
                db.execute(stmt, payload)
                db.commit()
                payload.clear()

        for i, (ev, comps, _b) in enumerate(rows):
            opct = i / (m - 1) if m > 1 else 1.0
            highs = sum(1 for c in comps.values() if c["confidence"] == "high")
            score = round(_calibrate(opct), 1)
            breakdown = {
                "scored": True,
                "final": score,
                "percentile": round(opct * 100),
                "components": {
                    name: {"score": round(c["pct"] * 10, 1), "weight": c["weight"],
                           "confidence": c["confidence"], "reason": c["reason"],
                           **({"ranked_against": c["ranked_against"]} if c.get("ranked_against") else {})}
                    for name, c in comps.items()
                },
                "missing": [k for k in ("rarity", "venue", "production", "context") if k not in comps],
                "confidence": "high" if highs >= 2 else "medium" if highs >= 1 else "low",
                "reasons": [c["reason"] for c in comps.values()],
            }
            payload.append({"_id": ev.id, "_mxs": score, "_bd": breakdown})
            if len(payload) >= CHUNK:
                flush()
        flush()

        gap = {"scored": False, "reason": "Not enough trusted data to score yet"}
        for eid in unscored:
            payload.append({"_id": eid, "_mxs": None, "_bd": gap})
            if len(payload) >= CHUNK:
                flush()
        flush()
        return {"total": len(events), "scored": len(blended), "unscored": len(events) - len(blended)}
    finally:
        db.close()


def score_events_by_ids(ids: list) -> int:
    """Live search: provisional (uncalibrated) Artist-only score for freshly-ingested
    events; the nightly job adds Venue/Rarity/Context + calibration."""
    if not ids:
        return 0
    db: Session = SessionLocal()
    cache: dict[str, int] = {}
    scored = 0
    try:
        for ev in db.query(Event).filter(Event.id.in_(ids)).all():
            a = _artist_stature(db, ev, cache)
            if a:
                ev.mxs = round(a["provisional"], 1)
                ev.mxs_breakdown = {
                    "scored": True, "final": ev.mxs, "provisional": True,
                    "components": {"artist": {"score": a["provisional"], "weight": WEIGHTS["artist"],
                                              "confidence": a["confidence"], "reason": a["reason"],
                                              "source": a["source"]}},
                    "reasons": [a["reason"]],
                }
                scored += 1
        db.commit()
    finally:
        db.close()
    return scored
