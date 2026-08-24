"""MXS (Music Experience Score) — PRD F2.

MXS = 0.35·Artist + 0.25·Rarity + 0.15·Venue + 0.15·Production + 0.10·Context,
blended over the components we can compute *with real data*, then rank-calibrated
across the upcoming cohort (hard ceiling: only the top ~2% reach 9.0+).

Trust rule ("absence over guess"): a component with no real data is left OUT (not
faked); its weight is re-normalised away. Production is parked (no honest source).
Every score stores reason chips + per-component confidence in mxs_breakdown.
"""
import bisect
import math
from datetime import datetime, timezone

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
    "final show", "only uk", "only us show", "exclusive",
)
# Context: special-occasion signals.
SPECIAL_WORDS = ("anniversary", "tour finale", "album launch", "world premiere", "residency")


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

def _artist_stature(db, ev, cache):
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
    rows = (
        db.query(Artist)
        .join(EventArtist, EventArtist.artist_id == Artist.id)
        .filter(EventArtist.event_id == ev.id).order_by(EventArtist.sort_order).all()
    )
    if not rows and ev.headliner_artist_id:
        a = db.get(Artist, ev.headliner_artist_id)
        if a:
            rows = [a]
    rows = [a for a in rows if a.name and a.name.strip().upper() not in ("TBA", "VARIOUS")]
    if not rows:
        return None

    dz, lf = [], []
    for a in rows[:6]:
        if a.deezer_fans is None and a.name not in cache:
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
        confidence = "high" if best >= 5_000 else "low"
    else:
        confidence = "medium" if best >= 5_000 else "low"
        reason += " (Deezer has no data — ranked separately)"

    return {
        "source": source,
        "raw": math.log10(best) + bump,
        "provisional": _fans_to_score(best),
        "confidence": confidence,
        "reason": reason,
    }


def _venue_component(db, ev):
    if not ev.venue_id:
        return None
    v = db.get(Venue, ev.venue_id)
    if not v or not v.capacity or v.capacity < 1:
        return None
    return {"raw": math.log10(v.capacity), "confidence": "high", "reason": f"{v.capacity:,}-cap venue"}


def _rarity_component(ev):
    text = f"{ev.title or ''} {ev.description or ''}".lower()
    hit = next((w for w in RARE_WORDS if w in text), None)
    if not hit:
        return None
    return {"pct": 0.9, "confidence": "high", "reason": f"Rare occasion · “{hit}”"}


def _context_component(ev):
    text = f"{ev.title or ''} {ev.description or ''}".lower()
    if "festival" in text or " fest" in text:
        return {"pct": 0.85, "confidence": "high", "reason": "Festival"}
    hit = next((w for w in SPECIAL_WORDS if w in text), None)
    if hit:
        return {"pct": 0.7, "confidence": "medium", "reason": hit.capitalize()}
    return None


def _collect(db, ev, cache):
    comps = {}
    a = _artist_stature(db, ev, cache)
    if a:
        comps["artist"] = {"weight": WEIGHTS["artist"], "raw": a["raw"],
                           "confidence": a["confidence"], "reason": a["reason"],
                           "source": a["source"]}
    v = _venue_component(db, ev)
    if v:
        comps["venue"] = {"weight": WEIGHTS["venue"], "raw": v["raw"], "confidence": v["confidence"], "reason": v["reason"]}
    r = _rarity_component(ev)
    if r:
        comps["rarity"] = {"weight": WEIGHTS["rarity"], "pct": r["pct"], "confidence": r["confidence"], "reason": r["reason"]}
    c = _context_component(ev)
    if c:
        comps["context"] = {"weight": WEIGHTS["context"], "pct": c["pct"], "confidence": c["confidence"], "reason": c["reason"]}
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

        blended = []  # (ev, comps)
        for ev in events:
            comps = _collect(db, ev, cache)
            if not comps:
                ev.mxs = None
                ev.mxs_breakdown = {"scored": False, "reason": "Not enough trusted data to score yet"}
                continue
            blended.append((ev, comps))

        # Percentile-rank each continuous component against its own cohort. The artist
        # component has two possible cohorts, and an artist sits in exactly ONE of them:
        # those Deezer knows, and those only Last.fm knows. They are never mixed, and an
        # artist is never ranked twice and given the better result.
        ranked = {"venue": sorted(c["venue"]["raw"] for _, c in blended if "venue" in c)}
        by_source = {}
        for _, c in blended:
            a = c.get("artist")
            if a:
                by_source.setdefault(a["source"], []).append(a["raw"])
        for src in by_source:
            by_source[src].sort()

        rows = []  # (ev, comps, blend_pct)
        for ev, comps in blended:
            parts = []
            for name, c in comps.items():
                if name == "artist":
                    c["pct"] = _pct(by_source[c["source"]], c["raw"])
                    c["ranked_against"] = c["source"]
                elif "raw" in c:
                    c["pct"] = _pct(ranked[name], c["raw"])
                parts.append((c["pct"], c["weight"]))
            wsum = sum(w for _, w in parts)
            rows.append((ev, comps, sum(p * w for p, w in parts) / wsum))

        rows.sort(key=lambda r: r[2])
        m = len(rows)
        for i, (ev, comps, _b) in enumerate(rows):
            opct = i / (m - 1) if m > 1 else 1.0
            highs = sum(1 for c in comps.values() if c["confidence"] == "high")
            ev.mxs = round(_calibrate(opct), 1)
            ev.mxs_breakdown = {
                "scored": True,
                "final": ev.mxs,
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
        db.commit()
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
