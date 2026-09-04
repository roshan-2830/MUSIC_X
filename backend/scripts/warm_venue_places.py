"""Fill the nearby-places cache from a machine Overpass will actually talk to.

WHY THIS EXISTS. The "Around the venue" section caches per venue for 90 days, and the design is
right: the first person to open a venue waits for Overpass, everyone after them does not. But
that first fetch happens on the API server, and Overpass rate-limits by IP — a shared cloud
address arrives with its allowance already spent by other tenants. From Render every mirror
failed; from a laptop the same query returned 120 places in 3.9 seconds. So the section read
"We couldn't load places around the venue just now" for every venue nobody had warmed.

Nothing here is a workaround for a bug in the app. Venues do not move, so warming is a one-off
per venue, and the live fetch stays as the fallback for anything this has not reached.

Ordered by how many upcoming shows a venue holds, because that is the order people will open
them in. Overpass is donated infrastructure — the pause between calls is not optional.

    python3.12 -m scripts.warm_venue_places            # dry run, shows what it would do
    python3.12 -m scripts.warm_venue_places --apply 150
"""
import sys
import time
from datetime import datetime, timezone

from sqlalchemy import text

from app.api.routes.travel import _store_places
from app.db.session import SessionLocal
from app.models.venue import Venue
from app.services import nearby

# Overpass asks for restraint and enforces it. A few seconds between calls is the difference
# between a warm cache and a blocked IP.
PAUSE_SECONDS = 4.0


def main(apply: bool, limit: int):
    db = SessionLocal()
    rows = db.execute(text("""
        select v.id, v.name, count(*) n
        from venues v join events e on e.venue_id = v.id
        where e.starts_at > now() and e.merged_into is null and e.retired_at is null
          and v.lat is not null and v.lng is not null
          and v.places_fetched_at is null
        group by v.id, v.name
        order by n desc
        limit :l"""), {"l": limit}).all()

    print(f"{len(rows)} venues to warm, busiest first"
          f"{'' if apply else '  (DRY RUN — nothing will be written)'}\n")
    warmed = empty = failed = 0
    for i, (vid, name, shows) in enumerate(rows, 1):
        venue = db.get(Venue, vid)
        if not apply:
            print(f"  {i:>3}. {name[:52]:<52} {shows:>4} shows")
            continue
        found = nearby.fetch(venue.lat, venue.lng, exclude_name=venue.name)
        if found is None:
            print(f"  {i:>3}. {name[:46]:<46} FAILED — left unstamped, so it will retry")
            failed += 1
        else:
            _store_places(db, venue, found)
            db.commit()
            if found:
                warmed += 1
                print(f"  {i:>3}. {name[:46]:<46} {len(found):>3} places")
            else:
                # Stamped deliberately: a venue that really has nothing walkable around it is a
                # real answer, and re-asking every 90 days is enough.
                empty += 1
                print(f"  {i:>3}. {name[:46]:<46} nothing nearby (stamped)")
        time.sleep(PAUSE_SECONDS)

    if apply:
        print(f"\nwarmed {warmed}, genuinely empty {empty}, failed {failed}")
    else:
        print(f"\nRe-run with --apply N to fetch. At {PAUSE_SECONDS}s a call, "
              f"{len(rows)} venues takes about {len(rows) * (PAUSE_SECONDS + 4) / 60:.0f} minutes.")
    db.close()


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
    main(apply, nums[0] if nums else 40)
