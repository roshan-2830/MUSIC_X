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
    names = [
        n for (n,) in db.query(Artist.name)
        .join(EventArtist, EventArtist.artist_id == Artist.id)
        .filter(EventArtist.event_id == ev.id).order_by(EventArtist.sort_order).all()
    ]
    if not names and ev.headliner_artist_id:
        a = db.get(Artist, ev.headliner_artist_id)
        if a:
            names = [a.name]
    names = [n for n in names if n and n.strip().upper() not in ("TBA", "VARIOUS")]
    if not names:
        return None
    fans = []
    for n in names[:6]:
        if n not in cache:
            cache[n] = artist_fans(n) or 0
        if cache[n] > 0:
            fans.append(cache[n])
    if not fans:
        return None
    top = max(fans)
    raw = math.log10(top)
    strong = sum(1 for f in fans if f >= 50_000)
    if strong > 1:
        raw += min(0.4, 0.15 * (strong - 1))
    reason = f"{_fmt(top)} fans" + (f" · {len(fans)} acts with a following" if len(fans) > 1 else "")
    return {"raw": raw, "provisional": _fans_to_score(top),
            "confidence": "high" if top >= 5_000 else "low", "reason": reason}


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
        comps["artist"] = {"weight": WEIGHTS["artist"], "raw": a["raw"], "confidence": a["confidence"], "reason": a["reason"]}
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

        # sorted raws per continuous component (for percentile ranking)
        ranked = {name: sorted(c[name]["raw"] for _, c in blended if name in c and "raw" in c[name])
                  for name in ("artist", "venue")}

        rows = []  # (ev, comps, blend_pct)
        for ev, comps in blended:
            parts = []
            for name, c in comps.items():
                c["pct"] = _pct(ranked[name], c["raw"]) if "raw" in c else c["pct"]
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
                           "confidence": c["confidence"], "reason": c["reason"]}
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
                                              "confidence": a["confidence"], "reason": a["reason"]}},
                    "reasons": [a["reason"]],
                }
                scored += 1
        db.commit()
    finally:
        db.close()
    return scored
