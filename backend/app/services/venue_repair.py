"""Recovering a venue's location from a duplicate record of the same venue.

Ticketmaster sometimes files one real venue as two rows, and only one of them carries
coordinates: Madrid's Caja Mágica is both 'ESTADIO SHAKIRA(Iberdrola Music)' at
40.3287,-3.7109 and 'Shakira Stadium' with nothing, so half the Shakira listings could draw
a map and half could not.

The evidence is deliberately NOT the name. Name similarity was measured on these eight rows
and it does not separate: 'Parking - Walibi' matches its real sibling at 0.22 while 'Casa di
Alex' matches an unrelated Milan club at 0.10 — three right and three wrong, with no gap to
put a threshold in. Copying a coordinate on that basis would place a venue confidently in
the wrong city, which is worse than showing no map.

What IS strong evidence is behaviour: two venue rows in the SAME city hosting the SAME
headliner on the SAME date are one place. Two different venues in Madrid do not both host
Shakira on 27 September. That reasoning needs no name at all, and it is why this pass is
narrow — it only ever fires where the catalogue contradicts itself.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal

# Rows that share a headliner and a date in one city. Restricted to pairs where exactly one
# side knows where it is, because that is the only case there is anything to copy.
_PAIRS = """
SELECT va.id AS blank_id, va.name AS blank_name,
       vb.id AS known_id, vb.name AS known_name, vb.lat, vb.lng,
       c.name AS city, a.name AS headliner, count(DISTINCT ea.starts_at::date) AS dates
FROM events ea
JOIN events eb ON eb.headliner_artist_id = ea.headliner_artist_id
              AND eb.starts_at::date = ea.starts_at::date
              AND eb.venue_id <> ea.venue_id
JOIN venues va ON va.id = ea.venue_id AND va.lat IS NULL
JOIN venues vb ON vb.id = eb.venue_id AND vb.city_id = va.city_id
              AND vb.lat IS NOT NULL AND vb.lng IS NOT NULL
JOIN cities c ON c.id = va.city_id
JOIN artists a ON a.id = ea.headliner_artist_id
WHERE ea.merged_into IS NULL AND eb.merged_into IS NULL AND ea.starts_at >= now()
GROUP BY va.id, va.name, vb.id, vb.name, vb.lat, vb.lng, c.name, a.name
ORDER BY dates DESC, va.name
"""


def recover_missing_coords(dry_run: bool = True) -> dict:
    """Give a coordinate-less venue the location of the row it is a duplicate of."""
    db: Session = SessionLocal()
    out = {"recovered": 0, "ambiguous": 0, "dry_run": dry_run}
    try:
        rows = db.execute(text(_PAIRS)).mappings().all()
        # One blank venue could pair with two different known rows — different places that
        # merely share an artist and a date. Nothing distinguishes them, so take neither.
        by_blank: dict = {}
        for r in rows:
            by_blank.setdefault(r["blank_id"], []).append(r)

        for blank_id, cands in by_blank.items():
            spots = {(c["lat"], c["lng"]) for c in cands}
            first = cands[0]
            if len(spots) > 1:
                out["ambiguous"] += 1
                print(f"    SKIP (ambiguous) {first['blank_name'][:38]} — "
                      f"{len(spots)} different locations claim it")
                continue
            print(f"    {first['blank_name'][:34]:34} <- {first['known_name'][:34]:34} "
                  f"{first['lat']:.4f},{first['lng']:.4f}  "
                  f"[{first['city']}, {first['headliner'][:16]}, {first['dates']} date(s)]")
            out["recovered"] += 1
            if not dry_run:
                db.execute(
                    text("UPDATE venues SET lat = :la, lng = :ln WHERE id = :v AND lat IS NULL"),
                    {"la": first["lat"], "ln": first["lng"], "v": blank_id},
                )
        if dry_run:
            db.rollback()
            print("[venues] DRY RUN — nothing written.")
        else:
            db.commit()
            print(f"[venues] recovered {out['recovered']} venue location(s)")
    except Exception as e:
        db.rollback()
        print(f"[venues] repair failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    return out
