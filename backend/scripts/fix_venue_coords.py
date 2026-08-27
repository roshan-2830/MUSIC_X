"""Re-check venues whose coordinates sit far from their own city's cluster.

TWO CAUSES LOOK IDENTICAL IN A DISTANCE QUERY and must not be treated the same way.

  Merrill Auditorium is filed under "Portland, US" and sits 4,081 km from that city's other
  venues — because it is in Portland, MAINE and the city row is Portland, OREGON. The VENUE is
  correct to within a metre; the city is wrong. Moving it would destroy good data.

  Tablao Flamenco 1911 is filed under Madrid and sits 455 km away, in Catalonia. It is a
  flamenco house on Plaza de Santa Ana in central Madrid. Here the VENUE is wrong.

Nominatim separates them: ask it for "venue, city, country" and compare its answer to what we
hold. If it agrees with us, the venue is right and the city row is the problem — leave it
alone. If it disagrees with us AND lands near the city's own venue cluster, we were wrong and
it is safe to move.

Nothing is moved on a guess. A venue Nominatim cannot find, or finds somewhere equally far from
the cluster, is reported and left untouched.

Run: python3.12 scripts/fix_venue_coords.py [--apply]
"""
import math
import sys
import time

import httpx
from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.venue import Venue
from app.models.venue_place import VenuePlace

# Their policy: one request per second, and a real identifying agent.
UA = {"User-Agent": "MusicX/0.1 (live music trip planner; jadhav.r@yangtsofour.com)"}
PAUSE = 1.2

# Far enough from a city's own cluster to be worth questioning at all.
SUSPECT_KM = 100
# Nominatim agreeing with us to within this is "the venue is right".
AGREE_KM = 5
# A replacement must land at least this close to the city's cluster to be believed.
NEAR_CLUSTER_KM = 60


def km(a, b, c, d):
    r, p = 6371.0, math.radians
    return 2 * r * math.asin(math.sqrt(
        math.sin(p(c - a) / 2) ** 2
        + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2))


def geocode(q: str):
    try:
        r = httpx.get("https://nominatim.openstreetmap.org/search",
                      params={"q": q, "format": "json", "limit": 3}, headers=UA, timeout=25)
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
    rows = db.execute(text(f"""
      with centre as (
        select v.city_id,
               percentile_cont(0.5) within group (order by v.lat) lat,
               percentile_cont(0.5) within group (order by v.lng) lng
        from venues v where v.lat is not null group by 1 having count(*) >= 5)
      select v.id, v.name, v.lat, v.lng, c.name city, c.country,
             ct.lat clat, ct.lng clng
      from venues v
      join centre ct on ct.city_id = v.city_id
      join cities c on c.id = v.city_id
      where v.lat is not null
        and 6371*acos(least(1,greatest(-1,
              sin(radians(ct.lat))*sin(radians(v.lat))
            + cos(radians(ct.lat))*cos(radians(v.lat))*cos(radians(v.lng-ct.lng))))) > {SUSPECT_KM}
      order by v.name
    """)).fetchall()
    print(f"{len(rows)} venues more than {SUSPECT_KM} km from their city's cluster\n")

    fixed = kept = unclear = 0
    for r in rows:
        away = km(r.clat, r.clng, r.lat, r.lng)
        print(f"{r.name}  ({r.city}, {r.country}) — {away:.0f} km from cluster")
        hits = geocode(f"{r.name}, {r.city}, {r.country}")
        time.sleep(PAUSE)
        if not hits:
            print("    no match — left alone\n")
            unclear += 1
            continue
        best = None
        for h in hits:
            la, lo = float(h["lat"]), float(h["lon"])
            cand = (km(r.lat, r.lng, la, lo), km(r.clat, r.clng, la, lo), la, lo, h)
            if best is None or cand[1] < best[1]:
                best = cand
        d_stored, d_cluster, la, lo, h = best
        if d_stored <= AGREE_KM:
            print(f"    agrees with us ({d_stored:.1f} km) -> the CITY row is wrong, "
                  f"venue untouched\n")
            kept += 1
            continue
        if d_cluster > NEAR_CLUSTER_KM:
            print(f"    disagrees ({d_stored:.0f} km) but its answer is {d_cluster:.0f} km "
                  f"from the cluster too — too unclear to move\n")
            unclear += 1
            continue
        print(f"    WRONG: ours is {d_stored:.0f} km from Nominatim's, whose answer sits "
              f"{d_cluster:.0f} km from the cluster")
        print(f"    {r.lat:.5f},{r.lng:.5f}  ->  {la:.5f},{lo:.5f}")
        print(f"    {h.get('display_name','')[:90]}")
        if apply:
            v = db.get(Venue, r.id)
            v.lat, v.lng = la, lo
            # Anything cached off the old point is now about the wrong neighbourhood.
            n = db.query(VenuePlace).filter(VenuePlace.venue_id == v.id).delete()
            v.places_fetched_at = None
            db.commit()
            print(f"    moved; {n} cached nearby place(s) cleared for re-fetch")
        else:
            print("    (dry run — pass --apply to move it)")
        print()
        fixed += 1

    print(f"summary: {fixed} wrong, {kept} venue-right/city-wrong, {unclear} unclear"
          f"{'' if apply else '  [DRY RUN]'}")
    db.close()


if __name__ == "__main__":
    main("--apply" in sys.argv)
