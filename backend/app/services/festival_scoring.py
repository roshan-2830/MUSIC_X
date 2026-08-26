"""MXS for festivals — PRD F2, applied to a festival instead of a show.

Same formula and the same trust rule: 0.35·Artist + 0.25·Rarity + 0.15·Venue +
0.15·Production + 0.10·Context, blended over the components that have REAL data, with the
weight of anything absent re-normalised away rather than filled with a guess.

WHAT A FESTIVAL CAN AND CANNOT ANSWER

  Artist   0.35  the bill, from festival_lineup — scored by the very same rule as a
                 concert's, imported rather than reimplemented (see stature_from_bill)
  Rarity   0.25  a final edition, an anniversary, a reunion, said in its own name or blurb
  Context  0.10  and here a festival says MORE than a concert can: it knows how many days
                 it runs and how many acts it books. The concert scorer has to settle for a
                 flat 0.85 for the word "festival"; this measures the thing itself.
  Venue    0.15  ABSENT. A festival row has a city and no venue — no capacity to read, and
                 a city's population is not a venue's size. Weight re-normalised.
  Production 0.15 ABSENT, parked, exactly as for concerts: no honest source.

REVIEWS ARE NOT HERE, AND THAT IS NOT AN OVERSIGHT

Asked for, and there is nothing truthful to build it from. The reviews table holds 0 rows
and its rows key to event_id, so a festival cannot be reviewed at all. Only 6 of 513
festivals have even finished. And no free source carries festival ratings: MusicBrainz has
the field but not the data — Glastonbury 2014 holds a rating of 5 from TWO votes, Primavera
Sound holds none. Averaging that would be inventing a number and calling it evidence.

A festival's EDITION HISTORY is the real signal in reach (MusicBrainz knows Creamfields from
1998, Corona Capital across 2015-2024), and migration e1abad0f7a7f adds the columns to cache
it. It is deliberately not wired in yet: the coverage probe was flawed — an unquoted `&`
silently zeroed 'Bourbon & Beyond', and throttling zeroed others — so the honest position is
that the number is unknown rather than the 30% that probe reported.

COHORT. Festivals are ranked against FESTIVALS, and the breakdown says so. Mixing them with
concerts would put nearly every festival above nearly every club show — defensible, since a
71-act weekend IS the bigger night — but it would flatten the top of the festival scale into
a band of nines, which is exactly where a user is choosing between them.
"""
import math
from datetime import date

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.models.festival import Festival
from app.models.festival_lineup import FestivalLineup
# The formula, the calibration curve and the artist rule all come from the concert scorer.
# One definition each: a second copy would drift, and the artist rule took a measurement
# over 724 artists to settle.
from app.services.scoring import (RARE_WORDS, WEIGHTS, _calibrate, _fmt, _pct,
                                  stature_from_bill)

# Said of a festival, these mark an edition that will not come again.
FESTIVAL_RARE = RARE_WORDS + ("final edition", "last edition", "farewell edition",
                              "final year", "10th anniversary", "20th anniversary",
                              "25th anniversary", "50th anniversary", "debut edition",
                              "first edition", "inaugural")


def _artist(db: Session, f: Festival, cache: dict):
    """The bill, judged exactly as a concert's line-up is."""
    rows = (db.query(Artist)
              .join(FestivalLineup, FestivalLineup.artist_id == Artist.id)
              .filter(FestivalLineup.festival_id == f.id)
              .order_by(FestivalLineup.sort_order).all())
    # live=False: read stored popularity only. See stature_from_bill.
    return stature_from_bill(db, rows, cache, live=False)


def _rarity(f: Festival):
    text = f"{f.name or ''} {f.about or ''}".lower()
    hit = next((w for w in FESTIVAL_RARE if w in text), None)
    if not hit:
        return None
    return {"pct": 0.9, "confidence": "high", "reason": f"Rare occasion · “{hit}”"}


def _context(f: Festival):
    """How much festival this is: days on site, and how many acts it books.

    Continuous, not a flag. The concert scorer can only ask "is this a festival?" and answer
    0.85 for every one of them; a festival row knows the size of the thing. Three days and
    seventy acts is a different proposition from one afternoon and five, and the ranking
    should be able to say so.
    """
    acts = f.artists_count or 0
    days = f.days or ((f.ends_on - f.starts_on).days + 1 if f.ends_on and f.starts_on else None)

    # The BILL is the festival. A duration on its own says nothing about quality, and taking
    # it as evidence was actively wrong: 'BrownstoneJAZZ FEST CONCERT SERIES' — fifteen dates
    # of a jazz residency with no bill recorded — took the top six places in the whole
    # catalogue, above Austin City Limits, on 0.3 x 14 days alone. So no bill, no context.
    if not acts:
        return None

    # Duration is a modest modifier, and capped. Measured over the catalogue: 151 festivals
    # run 1-3 days and 25 run 4-7, while only 15 run longer — and those are mostly bad data
    # (Time Warp is one night, stored as 15 days). Past a long weekend, another day is not
    # more festival, so credit stops at three extra days.
    raw = math.log10(1 + acts) + 0.15 * min(max((days or 1) - 1, 0), 3)

    bits = [f"{_fmt(acts)} acts billed"]
    if days and days > 1:
        bits.append(f"{days} days")
    return {
        "raw": raw,
        # A day count corroborates the bill; the bill alone still scores, just less certainly.
        "confidence": "high" if (acts and days) else "medium",
        "reason": " · ".join(bits),
    }


def _collect(db: Session, f: Festival, cache: dict) -> dict:
    comps = {}
    if (a := _artist(db, f, cache)):
        comps["artist"] = {"weight": WEIGHTS["artist"], "raw": a["raw"], "source": a["source"],
                           "confidence": a["confidence"], "reason": a["reason"]}
    if (r := _rarity(f)):
        comps["rarity"] = {"weight": WEIGHTS["rarity"], "pct": r["pct"],
                           "confidence": r["confidence"], "reason": r["reason"]}
    if (c := _context(f)):
        comps["context"] = {"weight": WEIGHTS["context"], "raw": c["raw"],
                            "confidence": c["confidence"], "reason": c["reason"]}
    return comps


def score_all_festivals() -> dict:
    """Re-score every upcoming festival. Mirrors score_all_events, on the festival cohort."""
    db: Session = SessionLocal()
    cache: dict = {}
    try:
        today = date.today()
        fests = (db.query(Festival)
                   .filter(Festival.merged_into.is_(None))
                   .filter((Festival.ends_on >= today) | (Festival.starts_on >= today)
                           | (Festival.starts_on.is_(None)))
                   .all())
        blended = []
        for f in fests:
            comps = _collect(db, f, cache)
            if not comps:
                f.mxs = None
                f.mxs_breakdown = {"scored": False,
                                   "reason": "Not enough trusted data to score yet"}
                continue
            blended.append((f, comps))

        # Percentile-rank the continuous components inside their own cohort. Artist has two
        # cohorts and a bill sits in exactly one — those Deezer knows, and those only
        # Last.fm knows — never both, and never ranked twice for the better result.
        ctx = sorted(c["context"]["raw"] for _, c in blended if "context" in c)
        by_source: dict = {}
        for _, c in blended:
            if (a := c.get("artist")):
                by_source.setdefault(a["source"], []).append(a["raw"])
        for k in by_source:
            by_source[k].sort()

        rows = []
        for f, comps in blended:
            parts = []
            for name, c in comps.items():
                if name == "artist":
                    c["pct"] = _pct(by_source[c["source"]], c["raw"])
                    c["ranked_against"] = c["source"]
                elif name == "context":
                    c["pct"] = _pct(ctx, c["raw"])
                parts.append((c["pct"], c["weight"]))
            wsum = sum(w for _, w in parts)
            rows.append((f, comps, sum(p * w for p, w in parts) / wsum))

        rows.sort(key=lambda r: r[2])
        m = len(rows)
        for i, (f, comps, _b) in enumerate(rows):
            opct = i / (m - 1) if m > 1 else 1.0
            highs = sum(1 for c in comps.values() if c["confidence"] == "high")
            f.mxs = round(_calibrate(opct), 1)
            f.mxs_breakdown = {
                "scored": True,
                "final": f.mxs,
                "percentile": round(opct * 100),
                "cohort": f"{m} upcoming festivals",
                "components": {
                    name: {"score": round(c["pct"] * 10, 1), "weight": c["weight"],
                           "confidence": c["confidence"], "reason": c["reason"],
                           **({"ranked_against": c["ranked_against"]} if c.get("ranked_against") else {})}
                    for name, c in comps.items()
                },
                # Named, not silently dropped: a reader can see WHICH parts of the formula
                # this score could not use.
                "missing": {
                    "venue": "a festival has a city, not a venue — no capacity to read",
                    "production": "no honest source",
                    "reviews": "no rating data exists for festivals",
                    **({"rarity": "nothing in the name or blurb marks this edition as rare"}
                       if "rarity" not in comps else {}),
                    **({"context": "neither a day count nor a bill size is recorded"}
                       if "context" not in comps else {}),
                },
                "confidence": "high" if highs >= 2 else "medium" if highs >= 1 else "low",
                "reasons": [c["reason"] for c in comps.values()],
            }
        db.commit()
        return {"total": len(fests), "scored": len(blended),
                "unscored": len(fests) - len(blended)}
    finally:
        db.close()
