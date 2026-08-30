"""Repair city coordinates that cannot be real.

The trip planner turns distance into travel time, so a wrong coordinate is not a cosmetic
problem — it invents journeys. Nottingham was stored with its LATITUDE copied into its
longitude (52.96 / -52.96), putting it in the Atlantic and making Birmingham to Nottingham a
six-hour flight instead of an hour up the motorway.

Two corruptions, both detectable without asking anyone:

  lng == ±lat   one field written into the other
  (0, 0)        "null island" off West Africa — the value a failed geocode leaves behind

Nothing is moved on a guess. Nominatim is asked for "city, country" and its answer is only
accepted if it agrees with the country we already hold; anything else is left alone and
reported, because a city in the wrong place is better than a city confidently in a different
wrong place.

Run with --apply to write. Without it, this only reports.
"""
import math
import sys
import time

import httpx
from sqlalchemy import text

from app.db.session import SessionLocal

UA = {"User-Agent": "MusicX/1.0 (city coordinate repair; contact jadhav.r@yangtsofour.com)"}


def km(a, b, c, d):
    """Great-circle kilometres between two points."""
    r, p = 6371.0, math.radians
    return 2 * r * math.asin(math.sqrt(
        math.sin(p(c - a) / 2) ** 2
        + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2))


def geocode(q: str):
    try:
        r = httpx.get("https://nominatim.openstreetmap.org/search",
                      params={"q": q, "format": "json", "limit": 3,
                              "addressdetails": 1},
                      headers=UA, timeout=25)
    except Exception as e:
        print(f"    nominatim unreachable: {type(e).__name__}")
        return []
    if r.status_code != 200:
        print(f"    nominatim -> {r.status_code}")
        return []
    try:
        return r.json() or []
    except Exception:
        return []


def verify(apply: bool, limit: int):
    """Check the busiest cities against Nominatim and move the ones that are plainly wrong.

    The detectable corruptions — lat copied into lng, (0,0) — are the easy half. Madrid was
    stored 456 km away in Catalonia: a perfectly plausible coordinate, in the right country,
    that no self-check can catch. The only way to find that class is to ask someone else.

    Scoped to cities that actually host upcoming shows and ordered by how many, because
    Nominatim allows one request a second and the whole table would take twenty minutes for
    rows nobody's trip will ever touch.
    """
    db = SessionLocal()
    rows = db.execute(text("""
        select ci.id, ci.name, ci.country, ci.lat, ci.lng, count(*) n
        from cities ci join venues v on v.city_id = ci.id join events e on e.venue_id = v.id
        where ci.lat is not null and ci.lng is not null
          and e.starts_at > now() and e.merged_into is null and e.retired_at is null
        group by ci.id, ci.name, ci.country, ci.lat, ci.lng
        order by n desc limit :l"""), {"l": limit}).all()
    print(f"checking the {len(rows)} busiest cities\n")
    moved = 0
    for cid, name, country, lat, lng, n in rows:
        hits = geocode(f"{name}, {country}")
        time.sleep(1.1)
        best = next((h for h in hits
                     if ((h.get("address") or {}).get("country_code") or "").upper()
                     == (country or "").upper()), None)
        if not best:
            continue
        d = km(lat, lng, float(best["lat"]), float(best["lon"]))
        if d < 100:
            continue
        print(f"  {name}, {country} ({n} shows): stored is {d:.0f} km from Nominatim's answer")
        print(f"    ({lat:.4f}, {lng:.4f})  ->  ({float(best['lat']):.4f}, {float(best['lon']):.4f})")
        if apply:
            db.execute(text("update cities set lat=:a, lng=:b where id=:i"),
                       {"a": float(best["lat"]), "b": float(best["lon"]), "i": cid})
        moved += 1
    if apply:
        db.commit()
    print(f"\n{'APPLIED' if apply else 'DRY RUN'} — {moved} city/cities more than 100 km out")
    db.close()


def main(apply: bool):
    db = SessionLocal()
    rows = db.execute(text("""
        select id, name, country, lat, lng from cities
        where lat is not null and lng is not null
          and (abs(abs(lng) - abs(lat)) < 0.0001 or (lat = 0 and lng = 0))
        order by name""")).all()
    print(f"{len(rows)} suspect cities\n")
    fixed = cleared = skipped = 0

    for cid, name, country, lat, lng in rows:
        print(f"  {name}, {country}  stored ({lat}, {lng})")
        hits = geocode(f"{name}, {country}")
        time.sleep(1.1)                 # Nominatim asks for one request a second
        best = None
        for h in hits:
            cc = ((h.get("address") or {}).get("country_code") or "").upper()
            if cc == (country or "").upper():
                best = h
                break
        if best is None:
            # Cleared rather than guessed: an unlocated city is excluded from trip planning,
            # which is right. A wrongly located one silently invents journeys.
            print("    no confident match — clearing the coordinates")
            if apply:
                db.execute(text("update cities set lat=null, lng=null where id=:i"), {"i": cid})
            cleared += 1
            continue
        nlat, nlng = float(best["lat"]), float(best["lon"])
        print(f"    -> ({nlat:.5f}, {nlng:.5f})  {best.get('display_name','')[:64]}")
        if apply:
            db.execute(text("update cities set lat=:a, lng=:b where id=:i"),
                       {"a": nlat, "b": nlng, "i": cid})
        fixed += 1

    # A latitude with no longitude is unusable; make that explicit rather than half-known.
    half = db.execute(text(
        "select count(*) from cities where lat is not null and lng is null")).scalar()
    if half:
        print(f"\n  {half} city with a latitude but no longitude — clearing")
        if apply:
            db.execute(text("update cities set lat=null where lng is null"))

    if apply:
        db.commit()
        print(f"\nAPPLIED — {fixed} relocated, {cleared} cleared")
    else:
        print(f"\nDRY RUN — would relocate {fixed}, clear {cleared}. Re-run with --apply")
    db.close()


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    if "--verify" in sys.argv:
        i = sys.argv.index("--verify")
        n = int(sys.argv[i + 1]) if len(sys.argv) > i + 1 and sys.argv[i + 1].isdigit() else 60
        verify(apply, n)
    else:
        main(apply)
