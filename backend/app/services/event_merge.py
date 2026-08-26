"""One show sold as several ticket types, filed by Ticketmaster as several events.

'Christmas Rocks - 2 Day Ticket', '- 3 Day Ticket', '- 4 Day Ticket' and '- Day 1' are all
16:30 on 27 December at O2 City Hall Newcastle. Only 'Day 1' carries the bill — five acts;
the pass rows carry one. A user browsing sees the same night four times.

This is the concert half of what merge_festivals already does for festivals, and it is the
larger half: measured 2026-08-26, of 140 duplicate upcoming listings only 17 come from split
venue rows. The other 123 are ticket types of one show at one venue.

WHY THE GROUPING IS SAFE despite base_name() splitting hard. base_name('SHAKIRA - LAS
MUJERES YA NO LLORAN WORLD TOUR') is just 'SHAKIRA', which on its own would collapse
unrelated shows. It cannot here, because the key is (base name, venue, EXACT start time):
two different shows do not begin in the same room at the same minute. The venue and the
minute do the work; the name only has to agree on its opening.

Soft merge, via events.merged_into — the column already exists and every read filters on it,
so a merge is reversible and nothing is destroyed.
"""
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
# One definition of "the same show, before the ticket type" — the festival merge splits
# Ticketmaster's listing names the same way, and two rules that disagreed would fight.
from app.services.festival_merge import base_name

# Tables where a unique constraint forbids the same (owner, event) twice, so the loser's row
# has to be dropped rather than repointed when the survivor already has one.
# (table, the column that pairs with event_id in its unique constraint)
_PAIRED = [
    ("event_artists", "artist_id"),
    ("event_facts", "fact_key"),
    ("event_genres", "genre_id"),
    ("calendar_entries", "user_id"),
    ("dismissed_suggestions", "user_id"),
    ("reviews", "user_id"),
    ("trip_stops", "trip_id"),
]

# Tables with no such constraint: everything moves.
_PLAIN = ["event_offers", "event_sources", "event_changes", "event_highlights",
          "notifications", "referrals", "travel_legs", "hotel_bookings", "passport_entries"]

# Scalar fields the survivor should inherit if it is missing them.
_FILLABLE = ["image_url", "description", "price_from_amount", "price_from_currency",
             "doors_at", "timezone"]


def find_ticket_variants() -> list:
    """Groups of event rows that are one show. Bounded to rows that share a venue and time."""
    db: Session = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT e.id, e.title, e.venue_id, e.starts_at, e.headliner_artist_id,
                   (SELECT count(*) FROM event_artists ea WHERE ea.event_id = e.id) acts,
                   (SELECT count(*) FROM event_facts ef WHERE ef.event_id = e.id) facts,
                   (SELECT count(*) FROM event_offers eo WHERE eo.event_id = e.id) offers,
                   (SELECT count(*) FROM calendar_entries ce WHERE ce.event_id = e.id) saved,
                   e.image_url IS NOT NULL AS has_img, e.mxs
            FROM events e
            WHERE e.merged_into IS NULL AND e.starts_at IS NOT NULL AND e.venue_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM events o
                          WHERE o.merged_into IS NULL AND o.id <> e.id
                            AND o.venue_id = e.venue_id AND o.starts_at = e.starts_at)
        """)).mappings().all()
    finally:
        db.close()

    # TWO keys, because neither alone is enough and they fail in opposite directions.
    #
    # By base name: catches variants whose headliner is wrong. 'SABATON | Fast Track' has a
    # headliner of 'Fast Track - O2 arena' — an artist row minted from a Ticketmaster billing
    # string, not an act — so grouping by headliner would never pair it with 'Sabaton'.
    #
    # By headliner: catches variants whose titles will not align. base_name splits at the
    # FIRST separator, so 'Backstreet Boys at Sphere - Suite Reservation' bases to
    # 'Backstreet Boys at Sphere' while 'Backstreet Boys: Into The Millennium' bases to
    # 'Backstreet Boys', and the two never meet. Same act, same room, same minute is a
    # stronger claim than either name: nobody plays two shows at once.
    by_name, by_head = defaultdict(list), defaultdict(list)
    for r in rows:
        by_name[(base_name(r["title"]).lower(), r["venue_id"], r["starts_at"])].append(dict(r))
        if r["headliner_artist_id"]:
            by_head[(r["headliner_artist_id"], r["venue_id"], r["starts_at"])].append(dict(r))

    candidates = [g for g in by_name.values() if len(g) > 1] + \
                 [g for g in by_head.values() if len(g) > 1]

    # A row can qualify under both keys; folding it twice would fail the second time.
    merged: list = []
    for g in candidates:
        ids = {r["id"] for r in g}
        hit = next((m for m in merged if ids & {r["id"] for r in m}), None)
        if hit:
            have = {r["id"] for r in hit}
            hit += [r for r in g if r["id"] not in have]
        else:
            merged.append(list(g))
    return merged


def _survivor(rows: list) -> dict:
    """The row that is most fully the show.

    The bill decides it first: 'Christmas Rocks - Day 1' holds five acts where each pass row
    holds one, so the listing a user should land on is the one that can say who is playing.

    Then a title carrying no ticket type at all, ABOVE the fact count. Ranking facts higher
    kept 'Hollywood Vampires - Venue Premium Tickets' over plain 'Hollywood Vampires' on the
    strength of 17 provenance rows against 15 — two rows of near-identical bookkeeping
    deciding which name a user reads. Artwork, then the shortest title, break what is left.
    """
    plain = lambda r: (r["title"] or "").strip() == base_name(r["title"])
    return max(rows, key=lambda r: (r["acts"], plain(r), r["facts"], r["offers"],
                                    r["has_img"], -len(r["title"] or "")))


def _fold(db: Session, win_id, lose_id) -> None:
    for table, other in _PAIRED:
        db.execute(text(f"""DELETE FROM {table} x WHERE x.event_id = :l
            AND EXISTS (SELECT 1 FROM {table} y WHERE y.event_id = :w
                        AND y.{other} IS NOT DISTINCT FROM x.{other})"""),
            {"l": lose_id, "w": win_id})
        db.execute(text(f"UPDATE {table} SET event_id = :w WHERE event_id = :l"),
                   {"l": lose_id, "w": win_id})
    for table in _PLAIN:
        db.execute(text(f"UPDATE {table} SET event_id = :w WHERE event_id = :l"),
                   {"l": lose_id, "w": win_id})
    # Anything already merged into the loser follows it, or it is orphaned behind a row that
    # is itself hidden.
    db.execute(text("UPDATE events SET merged_into = :w WHERE merged_into = :l"),
               {"l": lose_id, "w": win_id})
    db.execute(text("UPDATE events SET merged_into = :w WHERE id = :l"),
               {"l": lose_id, "w": win_id})


def merge_ticket_variants(dry_run: bool = True, limit: int | None = None) -> dict:
    """Fold ticket-type rows into the listing that is the show. Dry run by default."""
    db: Session = SessionLocal()
    out = {"groups": 0, "rows_merged": 0, "moved_saves": 0, "filled": 0, "dry_run": dry_run}
    try:
        groups = find_ticket_variants()
        if limit:
            groups = groups[:limit]
        for g in groups:
            win = _survivor(g)
            losers = [r for r in g if r["id"] != win["id"]]
            if not losers:
                continue
            out["groups"] += 1
            print(f"\n=== {win['title'][:52]}  ({win['starts_at']:%Y-%m-%d %H:%M}) ===")
            print(f"  KEEP  {win['title'][:48]:48} {win['acts']:>2} acts, {win['facts']:>2} facts")
            for l in losers:
                saved = " SAVED BY A USER — moved to the survivor" if l["saved"] else ""
                print(f"  FOLD  {l['title'][:48]:48} {l['acts']:>2} acts, {l['facts']:>2} facts{saved}")
                out["rows_merged"] += 1
                out["moved_saves"] += l["saved"]
                if dry_run:
                    continue
                # One query for both rows, not one per column per row. This runs inside the
                # 3-hourly sweep against a hosted database, where 24 round trips per folded
                # row is the difference between seconds and minutes.
                cols = ", ".join(_FILLABLE)
                pair = {r["id"]: r for r in db.execute(
                    text(f"SELECT id, {cols} FROM events WHERE id = ANY(:ids)"),
                    {"ids": [win["id"], l["id"]]}).mappings().all()}
                keep, drop = pair[win["id"]], pair[l["id"]]
                fills = {c: drop[c] for c in _FILLABLE
                         if keep[c] is None and drop[c] is not None}
                if fills:
                    out["filled"] += len(fills)
                    sets = ", ".join(f"{k} = :{k}" for k in fills)
                    db.execute(text(f"UPDATE events SET {sets} WHERE id = :w"),
                               {**fills, "w": win["id"]})
                _fold(db, win["id"], l["id"])

        if dry_run:
            db.rollback()
            print("\n[events] DRY RUN — nothing written.")
        else:
            db.commit()
            print(f"\n[events] folded {out['rows_merged']} ticket-type row(s) "
                  f"into {out['groups']} show(s)")
    except Exception as e:
        db.rollback()
        print(f"[events] merge failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    return out
