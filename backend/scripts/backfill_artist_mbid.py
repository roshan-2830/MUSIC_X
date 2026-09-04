"""Fill artists.mbid from Ticketmaster, busiest artist first.

    .venv/bin/python -m scripts.backfill_artist_mbid --limit 200

New events pick the mbid up during ingestion, but the 9,000 artists already in the
database were ingested before that existed. This asks Ticketmaster's attractions endpoint
for the ones that matter — the artists with upcoming shows, most shows first.

Ticketmaster allows 5,000 requests a day and the sweep already spends some of that, so
this takes a --limit and is meant to be run a few times rather than once over everything.

Writes mbid_checked_on whether or not an id came back. Plenty of acts genuinely have no
MusicBrainz entry — tribute bands, local names, the "Premium Package" listings that are
not artists at all — and without the marker every run would re-ask about the same ones.
"""
import argparse
import time
from datetime import date

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal

TM = "https://app.ticketmaster.com/discovery/v2/attractions.json"
PAUSE = 0.25


def mbid_for(name: str) -> tuple[str | None, str | None]:
    """(mbid, the Ticketmaster attraction name it came from)."""
    try:
        r = httpx.get(TM, params={"apikey": settings.ticketmaster_api_key,
                                  "keyword": name, "size": 3}, timeout=25)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}"
        atts = (r.json().get("_embedded") or {}).get("attractions") or []
    except Exception as e:
        return None, type(e).__name__

    wanted = name.strip().lower()
    for a in atts:
        # Only an exact-ish name match. Ticketmaster's keyword search is fuzzy, and
        # accepting its first guess is how "Coldplay" becomes "Ultimate Coldplay" — a
        # tribute band whose mbid would then be used to fetch somebody else's setlists.
        if (a.get("name") or "").strip().lower() != wanted:
            continue
        links = (a.get("externalLinks") or {}).get("musicbrainz") or []
        if links and isinstance(links[0], dict) and links[0].get("id"):
            return links[0]["id"], a.get("name")
        return None, f"no mbid on {a.get('name')}"
    return None, "no exact name match"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT a.id, a.name, count(*) AS shows
            FROM artists a
            JOIN events e ON e.headliner_artist_id = a.id
            WHERE a.mbid IS NULL
              AND a.mbid_checked_on IS NULL
              AND e.starts_at > now()
              AND e.retired_at IS NULL
            GROUP BY a.id, a.name
            ORDER BY count(*) DESC
            LIMIT :lim
        """), {"lim": args.limit}).all()

        print(f"{len(rows)} artist(s) to ask about"
              + (" — DRY RUN" if args.dry_run else ""))
        found = 0
        for aid, name, shows in rows:
            mbid, why = mbid_for(name)
            if mbid:
                found += 1
                print(f"  {mbid}  {name[:34]:36} ({shows:>3} shows)")
            else:
                print(f"  {'—':36}  {name[:34]:36} ({shows:>3} shows)  [{why}]")
            if not args.dry_run:
                db.execute(text("""
                    UPDATE artists SET mbid = COALESCE(:mbid, mbid),
                                       mbid_checked_on = :today
                     WHERE id = :aid
                """), {"mbid": mbid, "today": date.today(), "aid": aid})
                db.commit()
            time.sleep(PAUSE)

        print(f"\nmbids found: {found} of {len(rows)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
