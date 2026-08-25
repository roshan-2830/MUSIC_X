"""Folding Ticketmaster's ticket-type listings back into one festival.

Ticketmaster sells a festival as many events — one per ticket type and one per day — and
each arrives here as its own `festivals` row. Measured 2026-08-25: 418 rows for 279 real
festivals. Reading Festival 2026 is ELEVEN rows (Campervan, Souvenir Ticket, Weekend
Camping, Friday, Saturday, Sunday, three multi-day non-camping combinations…), so the app
listed the same festival eleven times.

The same split is also the only place the day-by-day bill exists. Ticketmaster's attraction
objects carry no date field at all — there is no "this artist plays Saturday" anywhere in
their payload — but the per-day LISTINGS each have their own date and their own line-up:

    Reading Festival 2026 - Friday     28 Aug   32 artists
    Reading Festival 2026 - Saturday   29 Aug   36 artists
    Reading Festival 2026 - Sunday     30 Aug   31 artists

So merging is what creates the day view. It is not a side effect; it is the mechanism.

Two rules keep this from merging things that are not the same festival:

  • Grouped by base name AND city. 'Discovery Festival 2027' is THREE festivals — Plymouth
    in June, Dundee in July, Darlington in August — and grouping on the name alone would
    have collapsed a touring festival into one impossible event.

  • A cluster breaks on a gap of more than 3 days. Austin City Limits sells 'Weekend One'
    (4 Oct) and 'Weekend Two' (11 Oct) in the same city; those are separately ticketed
    weekends people attend separately, so they stay separate. Reading's Friday/Saturday/
    Sunday are one day apart and stay together.

Days come from each listing's own date, never from reading the weekday out of its title. A
row covering ONE day labels its line-up with that date; a row spanning several (a weekend
pass) labels nothing, because its bill is the whole festival and we do not know which act
plays when. That distinction is the honest half of the feature: a labelled day is the
seller's own fact, and an unlabelled artist is "on the bill, day not announced".

Merges are SOFT. Losers keep their rows and get `merged_into` set, which every festival
read already filters on — except `/me/saves/festivals`, which joins through
calendar_entries, so saved entries are repointed to the survivor instead.

Dry run by default.
"""
import re
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.festival import Festival

# Ticketmaster separates the festival from the ticket type with one of these.
_SEP = re.compile(r"\s*(?: - | – |\s[-–|]\s|: |\|)")
# How far apart two listings can start and still be the same run of one festival.
CLUSTER_GAP_DAYS = 3


def base_name(name: str) -> str:
    """'Reading Festival 2026 - Friday' -> 'Reading Festival 2026'. Original casing kept,
    because this becomes the surviving festival's display name."""
    return _SEP.split(name or "", maxsplit=1)[0].strip()


def _key(name: str) -> str:
    return re.sub(r"\s+", " ", base_name(name)).lower()


def display_name(names: list, fallback: str) -> str:
    """The surviving festival's name, taken from what the group's names AGREE on.

    Splitting at the first separator groups well but names badly: 'Decibel - Metal & Beer
    Festival: Day 1 Pass' would become 'Decibel'. The common prefix of the rows recovers
    the real name, because every ticket type repeats it — then it is cut back to the last
    separator so a half-word like 'Festival: Day' cannot survive.
    """
    if not names:
        return fallback
    pre = names[0]
    for n in names[1:]:
        i = 0
        while i < len(pre) and i < len(n) and pre[i] == n[i]:
            i += 1
        pre = pre[:i]
    seps = list(_SEP.finditer(pre))
    if seps:
        cand = pre[: seps[-1].start()].strip()
        if len(cand) >= 3:
            return cand
    cand = pre.strip(" -–|:,&+")
    if len(cand) >= 3:
        return cand

    # No usable prefix — try the common SUFFIX. Ticketmaster puts the festival LAST in a
    # ticket name: 'Abono General 3 días Corona Capital 2026' and 'Individual Banamex Plus
    # Corona Capital 2026' share nothing at the front and 'Corona Capital 2026' at the back.
    suf = names[0]
    for n in names[1:]:
        i = 0
        while i < len(suf) and i < len(n) and suf[len(suf) - 1 - i] == n[len(n) - 1 - i]:
            i += 1
        suf = suf[len(suf) - i:] if i else ""
    # Start at a word boundary, so 'l Corona Capital 2026' does not survive.
    suf = suf.strip()
    if " " in suf:
        parts = suf.split(" ")
        while parts and len(parts[0]) < 3:
            parts.pop(0)
        suf = " ".join(parts)
    suf = suf.strip(" -–|:,&+")
    return suf if len(suf) >= 4 else fallback


def find_clusters() -> list[dict]:
    """Groups of rows that are one festival: same base name, same city, dates that run on."""
    db: Session = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT f.id, f.name, f.city_id, f.starts_on, f.ends_on,
                   (SELECT count(*) FROM festival_lineup fl WHERE fl.festival_id = f.id) acts
            FROM festivals f
            WHERE f.merged_into IS NULL AND f.starts_on IS NOT NULL
            ORDER BY f.starts_on, f.name
        """)).all()
    finally:
        db.close()

    buckets: dict = {}
    for r in rows:
        buckets.setdefault((_key(r[1]), r[2]), []).append({
            "id": r[0], "name": r[1], "city_id": r[2],
            "starts_on": r[3], "ends_on": r[4], "acts": r[5],
        })

    clusters = []
    for (key, city_id), items in buckets.items():
        items.sort(key=lambda x: (x["starts_on"], x["name"]))
        run = [items[0]]
        for it in items[1:]:
            if (it["starts_on"] - run[-1]["starts_on"]).days <= CLUSTER_GAP_DAYS:
                run.append(it)
            else:
                clusters.append({"key": key, "city_id": city_id, "rows": run})
                run = [it]
        clusters.append({"key": key, "city_id": city_id, "rows": run})
    return [c for c in clusters if len(c["rows"]) > 1]


def _is_single_day(row: dict) -> bool:
    return row["ends_on"] is None or row["ends_on"] == row["starts_on"]


def _day_label_for(row: dict) -> str | None:
    """The ISO date this listing covers, or None when it spans several days.

    Deliberately the date and not the weekday word: 'Dayticket Friday', 'Friday
    Admission', 'Day 1 Pass (12-04)' and 'dag 2' all mean a date, and every one of them
    would need its own parser. The listing already carries the date.
    """
    return row["starts_on"].isoformat() if _is_single_day(row) else None


def _plan(rows: list[dict]) -> dict:
    """Which row survives, and what each other row contributes."""
    # The fullest bill survives — it is the row with the most to lose if we picked wrong.
    survivor = max(rows, key=lambda r: (r["acts"], -r["starts_on"].toordinal()))
    losers = [r for r in rows if r["id"] != survivor["id"]]
    starts = min(r["starts_on"] for r in rows)
    ends = max((r["ends_on"] or r["starts_on"]) for r in rows)
    days = [r for r in rows if _is_single_day(r) and r["acts"] > 1]
    return {
        "survivor": survivor, "losers": losers,
        "name": display_name([r["name"] for r in rows], base_name(survivor["name"])),
        "starts_on": starts, "ends_on": ends,
        "span_days": (ends - starts).days + 1,
        "day_rows": sorted({r["starts_on"] for r in days}),
    }


def _apply(db: Session, plan: dict) -> None:
    sid = plan["survivor"]["id"]
    surv = db.get(Festival, sid)

    # The survivor's own bill is a day too, when the survivor is a single-day listing.
    if _is_single_day(plan["survivor"]):
        db.execute(text("""UPDATE festival_lineup SET day_label = :d
                           WHERE festival_id = :s AND day_label IS NULL"""),
                   {"d": _day_label_for(plan["survivor"]), "s": sid})

    for lo in plan["losers"]:
        p = {"s": sid, "l": lo["id"], "d": _day_label_for(lo)}
        # Line-up: festival_lineup has no unique constraint, so dedupe by hand on
        # (artist, day) — a weekend pass and a day ticket list the same acts.
        db.execute(text("""
            DELETE FROM festival_lineup x WHERE x.festival_id = :l AND EXISTS (
                SELECT 1 FROM festival_lineup y WHERE y.festival_id = :s
                  AND y.artist_id = x.artist_id
                  AND y.day_label IS NOT DISTINCT FROM :d)"""), p)
        db.execute(text("""UPDATE festival_lineup SET festival_id = :s, day_label = :d
                           WHERE festival_id = :l"""), p)

        db.execute(text("""DELETE FROM festival_genres x WHERE x.festival_id = :l AND EXISTS (
            SELECT 1 FROM festival_genres y WHERE y.festival_id = :s AND y.genre_id = x.genre_id)"""), p)
        db.execute(text("UPDATE festival_genres SET festival_id = :s WHERE festival_id = :l"), p)
        db.execute(text("UPDATE festival_offers SET festival_id = :s WHERE festival_id = :l"), p)

        # A save must follow the festival it was made on, or the user silently loses it —
        # /me/saves/festivals joins through calendar_entries and does NOT filter merged_into.
        db.execute(text("""DELETE FROM calendar_entries x WHERE x.festival_id = :l AND EXISTS (
            SELECT 1 FROM calendar_entries y WHERE y.festival_id = :s AND y.user_id = x.user_id)"""), p)
        db.execute(text("UPDATE calendar_entries SET festival_id = :s WHERE festival_id = :l"), p)

        # festival_sources stays put: it is unique on (source, source_festival_id) and is
        # the record of which Ticketmaster listing each row came from. Repointing it would
        # claim the survivor was fetched under ids it never had.
        lf = db.get(Festival, lo["id"])
        if lf:
            lf.merged_into = sid

    if surv:
        surv.name = plan["name"]
        surv.starts_on = plan["starts_on"]
        surv.ends_on = plan["ends_on"] if plan["ends_on"] != plan["starts_on"] else None
        surv.days = plan["span_days"]
        surv.artists_count = db.execute(text(
            "SELECT count(DISTINCT artist_id) FROM festival_lineup WHERE festival_id = :s"),
            {"s": sid}).scalar()


def merge_festivals(dry_run: bool = True, limit: int | None = None) -> dict:
    """Report (and optionally perform) every festival merge. Dry run by default."""
    clusters = find_clusters()
    if limit:
        clusters = clusters[:limit]
    db: Session = SessionLocal()
    out = {"clusters": 0, "rows_folded": 0, "days_gained": 0}
    try:
        for c in clusters:
            plan = _plan(c["rows"])
            out["clusters"] += 1
            out["rows_folded"] += len(plan["losers"])
            if len(plan["day_rows"]) > 1:
                out["days_gained"] += 1
            print(f"\n=== {plan['name']} ({len(c['rows'])} rows → 1) ===")
            print(f"  KEEP  {plan['survivor']['name'][:58]!r} ({plan['survivor']['acts']} acts)")
            print(f"        dates {plan['starts_on']} → {plan['ends_on']}  ({plan['span_days']} days)")
            if len(plan["day_rows"]) > 1:
                print(f"        day-by-day bill from {len(plan['day_rows'])} day listings: "
                      f"{', '.join(str(d) for d in plan['day_rows'])}")
            for lo in plan["losers"]:
                lbl = _day_label_for(lo)
                print(f"  FOLD  {lo['name'][:52]!r:54} {lo['acts']:3} acts → "
                      f"{'day ' + lbl if lbl else 'no day (spans ' + str(((lo['ends_on'] or lo['starts_on']) - lo['starts_on']).days + 1) + ')'}")
            if not dry_run:
                _apply(db, plan)
        if dry_run:
            db.rollback()
            print("\n[festivals] DRY RUN — nothing written.")
        else:
            db.commit()
            print("\n[festivals] committed.")
    except Exception as e:
        db.rollback()
        print(f"[festivals] failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    print(f"[festivals] {out['clusters']} clusters, {out['rows_folded']} rows folded, "
          f"{out['days_gained']} festivals gain a day-by-day bill")
    return out


# --------------------------------------------------------------- one listing, one home

def drop_duplicate_festival_events(dry_run: bool = True) -> dict:
    """Remove event rows for listings that are already festivals.

    The two sweeps overlap. `fetch_music_events` takes everything and writes `events`;
    `search_festivals` takes anything matching keyword "festival" and writes `festivals`.
    Nothing reconciled them, so measured 2026-08-25 the SAME Ticketmaster id existed in
    both tables 117 times. ARC Music Festival was four `events` rows — one per day, sitting
    under Concerts — and simultaneously the festival those four rows were merged into.

    A listing has one home. If the festival side holds it, the concert side should not, or
    the app shows a festival under Concerts and the same thing again under Festivals.

    Two guards, because deleting rows deserves them:

      • Only when a VISIBLE festival covers the listing — directly, or through the row it
        was merged into. A listing whose only festival row was merged away is still covered
        by the survivor; a listing with no festival at all is left alone rather than
        disappearing from the app entirely.
      • Never an event a user saved or was alerted about. Nothing outranks that, and if one
        ever appears it is reported and skipped rather than quietly taken.
    """
    db: Session = SessionLocal()
    covered = """
        SELECT DISTINCT e.id
        FROM events e
        JOIN event_sources es ON es.event_id = e.id AND es.source = 'ticketmaster'
        JOIN festival_sources fs ON fs.source_festival_id = es.source_event_id
                                AND fs.source = 'ticketmaster'
        JOIN festivals f ON f.id = fs.festival_id
        WHERE COALESCE(f.merged_into, f.id) IN (SELECT id FROM festivals WHERE merged_into IS NULL)
    """
    out = {"found": 0, "kept_because_saved": 0, "deleted": 0, "dry_run": dry_run}
    try:
        ids = [r[0] for r in db.execute(text(covered)).all()]
        out["found"] = len(ids)
        if not ids:
            print("[festivals] no duplicate concert rows")
            return out

        protected = [r[0] for r in db.execute(text("""
            SELECT DISTINCT event_id FROM calendar_entries WHERE event_id = ANY(:ids)
            UNION
            SELECT DISTINCT event_id FROM notifications WHERE event_id = ANY(:ids)
        """), {"ids": ids}).all()]
        out["kept_because_saved"] = len(protected)
        doomed = [i for i in ids if i not in set(protected)]

        titles = db.execute(text("""SELECT title, count(*) FROM events WHERE id = ANY(:ids)
                                    GROUP BY title ORDER BY count(*) DESC, title LIMIT 12"""),
                            {"ids": doomed}).all()
        print(f"[festivals] {len(doomed)} concert rows are really festival listings")
        for t, n in titles:
            print(f"    {n} x  {t[:66]}")
        if protected:
            print(f"[festivals] KEEPING {len(protected)} a user saved or was alerted about")

        if not dry_run:
            for tbl in ("event_facts", "event_artists", "event_offers", "event_genres",
                        "event_sources", "event_changes"):
                db.execute(text(f"DELETE FROM {tbl} WHERE event_id = ANY(:ids)"), {"ids": doomed})
            db.execute(text("DELETE FROM events WHERE id = ANY(:ids)"), {"ids": doomed})
            db.commit()
            out["deleted"] = len(doomed)
            print(f"[festivals] removed {len(doomed)} duplicate concert rows")
        else:
            db.rollback()
            print("[festivals] DRY RUN — nothing written.")
    except Exception as e:
        db.rollback()
        print(f"[festivals] reconcile failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    return out


def drop_non_festivals(dry_run: bool = True, since_hours: int = 6) -> dict:
    """Remove festival rows whose name gives no reason to call them a festival.

    The same test the ingest applies, run over what is already stored. Needed because the
    named-keyword rule was briefly too loose: 'Leeds' and 'Reading' are cities, 'Ultra' and
    'Movement' are ordinary words, and 'Boomtown' is a band — so 'Boomtown Rats',
    'Changes In Latitudes' and 'An Afternoon of Indie LEEDS' were all filed as festivals.

    A row survives on the same evidence as at ingest: a festival word in its own name, or a
    DISTINCTIVE named festival it says outright. Never one a user saved — that outranks any
    classification we can make, and one is reported rather than quietly taken.
    """
    from app.services.ticketmaster import FESTIVAL_KEYWORDS
    from app.services.ingestion import FESTIVAL_WORDS

    named = [k.lower() for k in FESTIVAL_KEYWORDS if not k.islower()]
    db: Session = SessionLocal()
    out = {"checked": 0, "kept_saved": 0, "dropped": 0, "dry_run": dry_run}
    try:
        # Two guards, both learned the hard way:
        #
        #  • Never a merge SURVIVOR. The merge renames a survivor to what its group agreed
        #    on, which strips the ticket-type suffix — 'Openair Frauenfeld 2027 | festival
        #    ticket' becomes 'Openair Frauenfeld 2027', losing the very word this test looks
        #    for. A name-only test cannot judge a row whose name we rewrote.
        #  • Only rows created recently. Anything older predates the loose keyword rule this
        #    is cleaning up after, and was already accepted under a stricter test.
        rows = db.execute(text("""
            SELECT f.id, f.name FROM festivals f
            WHERE f.merged_into IS NULL
              AND f.created_at > now() - make_interval(hours => :age)
              AND NOT EXISTS (SELECT 1 FROM festivals c WHERE c.merged_into = f.id)
        """), {"age": max(1, int(since_hours))}).all()
        out["checked"] = len(rows)
        doomed = []
        for fid, name in rows:
            low = (name or "").lower()
            if any(w in low for w in FESTIVAL_WORDS) or any(k in low for k in named):
                continue
            doomed.append((fid, name))

        saved = {r[0] for r in db.execute(text(
            "SELECT festival_id FROM calendar_entries WHERE festival_id = ANY(:ids)"),
            {"ids": [i for i, _ in doomed]}).all()} if doomed else set()
        keep = [(i, n) for i, n in doomed if i in saved]
        doomed = [(i, n) for i, n in doomed if i not in saved]
        out["kept_saved"] = len(keep)

        print(f"[festivals] {len(doomed)} rows are not festivals by name:")
        for _i, n in doomed[:15]:
            print(f"    {n[:66]}")
        if len(doomed) > 15:
            print(f"    ... and {len(doomed) - 15} more")
        for _i, n in keep:
            print(f"    KEEPING (a user saved it): {n[:50]}")

        if not dry_run and doomed:
            ids = [i for i, _ in doomed]
            for tbl in ("festival_lineup", "festival_genres", "festival_offers", "festival_sources"):
                db.execute(text(f"DELETE FROM {tbl} WHERE festival_id = ANY(:ids)"), {"ids": ids})
            db.execute(text("UPDATE festivals SET merged_into = NULL WHERE merged_into = ANY(:ids)"), {"ids": ids})
            db.execute(text("DELETE FROM festivals WHERE id = ANY(:ids)"), {"ids": ids})
            db.commit()
            out["dropped"] = len(ids)
            print(f"[festivals] removed {len(ids)}")
        else:
            db.rollback()
            if dry_run:
                print("[festivals] DRY RUN — nothing written.")
    except Exception as e:
        db.rollback()
        print(f"[festivals] failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    return out


def promote_big_bill_events(dry_run: bool = True) -> dict:
    """Turn concert rows with a festival-sized bill into festivals.

    Needed because the festival sweep can only find what a festival KEYWORD returns, and
    some of the biggest festivals are named nothing of the sort. Corona Capital sells
    'Abono General 3 días Corona Capital 2026' — no festival word, not a name anyone would
    think to hardcode — and it was sitting under Concerts with a 71-artist bill.

    A long bill is evidence a name cannot give, and it costs no API request: the acts are
    already in event_artists. Measured 2026-08-25, every upcoming event with 10+ acts was a
    festival — Corona Capital, Louder Than Life, Aftershock, Breaking Borders, MISSION
    BAYFEST, Rock Meets Country.

    The listing's own Ticketmaster id moves across, so drop_duplicate_festival_events then
    removes the concert row and merge_festivals folds the ticket-type variants together.
    Run promote -> merge -> dedupe, in that order.
    """
    db: Session = SessionLocal()
    out = {"promoted": 0, "skipped_saved": 0, "dry_run": dry_run}
    try:
        rows = db.execute(text("""
            SELECT e.id, e.title, e.starts_at::date, v.city_id, e.image_url, e.description,
                   COUNT(ea.artist_id) acts
            FROM events e
            JOIN event_artists ea ON ea.event_id = e.id
            LEFT JOIN venues v ON v.id = e.venue_id
            WHERE e.starts_at >= now() AND e.merged_into IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM event_sources es
                JOIN festival_sources fs ON fs.source_festival_id = es.source_event_id
                WHERE es.event_id = e.id)
            GROUP BY e.id, e.title, e.starts_at, v.city_id, e.image_url, e.description
            HAVING COUNT(ea.artist_id) >= :n
        """), {"n": 10}).all()

        print(f"[festivals] {len(rows)} concert rows have a festival-sized bill")
        for eid, title, day, city_id, img, about, acts in rows:
            saved = db.execute(text("SELECT count(*) FROM calendar_entries WHERE event_id=:e"),
                               {"e": eid}).scalar()
            if saved:
                # Promoting would move it out from under the save. Left alone and reported.
                out["skipped_saved"] += 1
                print(f"    SKIP (saved) {title[:52]} — {acts} acts")
                continue
            print(f"    {acts:3} acts  {title[:60]}")
            if dry_run:
                continue
            fest = Festival(name=title, city_id=city_id, starts_on=day, image_url=img,
                            about=about, artists_count=acts)
            db.add(fest)
            db.flush()
            db.execute(text("""INSERT INTO festival_lineup (id, festival_id, artist_id, is_headliner, sort_order)
                SELECT gen_random_uuid(), :f, ea.artist_id, ea.is_headliner, ea.sort_order
                FROM event_artists ea WHERE ea.event_id = :e"""), {"f": fest.id, "e": eid})
            # Carry the listing's identity over, so the concert row is then recognised as a
            # duplicate and the nightly sweep updates the festival rather than re-creating
            # the concert.
            db.execute(text("""INSERT INTO festival_sources (id, festival_id, source, source_festival_id, source_url)
                SELECT gen_random_uuid(), :f, 'ticketmaster', es.source_event_id, es.source_url
                FROM event_sources es WHERE es.event_id = :e AND es.source = 'ticketmaster'
                ON CONFLICT (source, source_festival_id) DO NOTHING"""), {"f": fest.id, "e": eid})
            out["promoted"] += 1
        if dry_run:
            db.rollback()
            print("[festivals] DRY RUN — nothing written.")
        else:
            db.commit()
            print(f"[festivals] promoted {out['promoted']} to festivals")
    except Exception as e:
        db.rollback()
        print(f"[festivals] promote failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    return out


def find_bill_clusters(min_overlap: float = 0.6, min_acts: int = 5) -> list[dict]:
    """Festivals that share a city, a date window and most of their line-up.

    The name-based clustering cannot reach these. Ticketmaster sells Corona Capital as
    'Abono General 3 días Corona Capital 2026', 'Individual Banamex Plus Corona Capital
    2026' and four more; they share no prefix, so base-name grouping leaves six festivals
    where there is one. Their BILLS are identical, which is a fact about the festival rather
    than about how a ticket was named.

    Requires `min_acts` on both sides: two festivals with two acts each can overlap 100% by
    coincidence, and a small bill proves nothing — the same reason bill size is only ever
    used as evidence FOR a festival and never against one.
    """
    db: Session = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT f.id, f.name, f.city_id, f.starts_on, f.ends_on,
                   array_agg(fl.artist_id) acts
            FROM festivals f JOIN festival_lineup fl ON fl.festival_id = f.id
            WHERE f.merged_into IS NULL AND f.starts_on IS NOT NULL
            GROUP BY f.id, f.name, f.city_id, f.starts_on, f.ends_on
            HAVING count(fl.artist_id) >= :m
        """), {"m": min_acts}).all()
    finally:
        db.close()

    items = [{"id": r[0], "name": r[1], "city_id": r[2], "starts_on": r[3],
              "ends_on": r[4], "acts": set(r[5])} for r in rows]
    used, clusters = set(), []
    for i, a in enumerate(items):
        if a["id"] in used:
            continue
        group = [a]
        for b in items[i + 1:]:
            if b["id"] in used or b["city_id"] != a["city_id"]:
                continue
            if abs((b["starts_on"] - a["starts_on"]).days) > CLUSTER_GAP_DAYS:
                continue
            inter = len(a["acts"] & b["acts"])
            union = len(a["acts"] | b["acts"])
            if union and inter / union >= min_overlap:
                group.append(b)
        if len(group) > 1:
            for g in group:
                used.add(g["id"])
            clusters.append({"key": "bill", "city_id": a["city_id"],
                             "rows": [{"id": g["id"], "name": g["name"], "city_id": g["city_id"],
                                       "starts_on": g["starts_on"], "ends_on": g["ends_on"],
                                       "acts": len(g["acts"])} for g in group]})
    return clusters


def merge_by_bill(dry_run: bool = True) -> dict:
    """Merge festivals that share a city, dates and most of their line-up."""
    clusters = find_bill_clusters()
    db: Session = SessionLocal()
    out = {"clusters": 0, "rows_folded": 0}
    try:
        for c in clusters:
            plan = _plan(c["rows"])
            out["clusters"] += 1
            out["rows_folded"] += len(plan["losers"])
            print(f"\n=== {plan['name']} ({len(c['rows'])} rows -> 1, matched on the bill) ===")
            print(f"  KEEP  {plan['survivor']['name'][:60]!r} ({plan['survivor']['acts']} acts)")
            for lo in plan["losers"]:
                print(f"  FOLD  {lo['name'][:60]!r} ({lo['acts']} acts)")
            if not dry_run:
                _apply(db, plan)
        if dry_run:
            db.rollback()
            print("\n[festivals] DRY RUN — nothing written.")
        else:
            db.commit()
            print("\n[festivals] committed.")
    except Exception as e:
        db.rollback()
        print(f"[festivals] bill merge failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    print(f"[festivals] bill-matched: {out['clusters']} clusters, {out['rows_folded']} rows folded")
    return out
