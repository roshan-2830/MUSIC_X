"""Fill venues.capacity from Wikidata, busiest venue first.

    .venv/bin/python -m scripts.backfill_venue_capacity --limit 200
    .venv/bin/python -m scripts.backfill_venue_capacity --limit 200 --dry-run

WHY BUSIEST FIRST. Capacity feeds a 15% component of MXS, and the venues hosting the most
shows move the most scores. Wikidata answers for roughly a fifth of the venues we carry —
the arenas — so ordering by show count buys the most coverage per request.

WHY IT RECORDS FAILURES. `capacity_checked_on` is stamped whether or not a number came
back. Most of these venues are not encyclopaedia entries and never will be; without the
stamp, every run re-asks the same 2,800 questions that have no answer. This is the same
mistake the scorer was making with Deezer until today, where "not looked up" and "looked
up, nothing there" were stored identically.

Rate: Wikidata asks for politeness rather than enforcing a hard limit. Two calls per venue
with a short pause is well inside anything reasonable.
"""
import argparse
import time
from datetime import date

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.wikidata import capacity_for

PAUSE = 0.35


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100, help="how many venues to ask about")
    ap.add_argument("--dry-run", action="store_true", help="look up, write nothing")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT v.id, v.name, count(*) AS shows
            FROM venues v
            JOIN events e ON e.venue_id = v.id
            WHERE v.capacity IS NULL
              AND v.capacity_checked_on IS NULL
              AND e.starts_at > now()
              AND e.retired_at IS NULL
            GROUP BY v.id, v.name
            ORDER BY count(*) DESC
            LIMIT :lim
        """), {"lim": args.limit}).all()

        print(f"{len(rows)} venue(s) to ask about"
              + (" — DRY RUN, nothing will be written" if args.dry_run else ""))
        found = 0
        shows_found = shows_total = 0

        for vid, name, shows in rows:
            cap, why = capacity_for(name)
            shows_total += shows
            if cap:
                found += 1
                shows_found += shows
                print(f"  {cap:>7,}  {name[:44]:46} ({shows:>3} shows)  ← {why}")
            else:
                print(f"  {'—':>7}  {name[:44]:46} ({shows:>3} shows)  [{why}]")

            if not args.dry_run:
                db.execute(text("""
                    UPDATE venues
                       SET capacity = COALESCE(:cap, capacity),
                           capacity_checked_on = :today
                     WHERE id = :vid
                """), {"cap": cap, "today": date.today(), "vid": vid})
                db.commit()      # per venue: a run interrupted halfway keeps its work
            time.sleep(PAUSE)

        print(f"\ncapacities found : {found} of {len(rows)}")
        print(f"shows they cover : {shows_found:,} of {shows_total:,}"
              f"  ({100 * shows_found / max(shows_total, 1):.0f}% of the shows asked about)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
