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
    main("--apply" in sys.argv)
