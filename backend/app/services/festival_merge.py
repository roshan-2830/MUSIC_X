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
# The bill-size floor lives with the ingestion rules that first apply it; one
# definition, so the promoter and the ingest test can never disagree.
from app.services.ingestion import BIG_BILL_ACTS

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
      • Never an event carrying anything a user made. Every table below CASCADEs from
        events except events.merged_into and passport_entries, so an unguarded delete does
        not fail — it silently takes a saved show, an invite, a review, a trip stop or a
        passport stamp with it. The first version of this guard checked two of the seven
        and would have been quiet about the rest.

    AND the merged_into pointer, which is why this used to fail every sweep

    events.merged_into is a self-reference with ON DELETE NO ACTION: another event row can
    say "I am a duplicate, the real one is over there". Three Gracie Abrams package rows
    pointed at a doomed listing, so the DELETE hit
    `events_merged_into_fkey` and rolled the whole pass back — every three hours, for good,
    while 32 duplicates stayed on the concert side.

    A row merged into a doomed listing IS that listing under another name, so it goes too.
    If any member of such a family is protected, the whole family stays: deleting the row a
    survivor points at would only re-break the same constraint.
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

        # Pull in anything merged into a covered listing, transitively.
        family = [r[0] for r in db.execute(text("""
            WITH RECURSIVE fold AS (
                SELECT id FROM events WHERE id = ANY(:ids)
                UNION
                SELECT e.id FROM events e JOIN fold ON e.merged_into = fold.id
            )
            SELECT id FROM fold"""), {"ids": ids}).all()]

        # Every table that holds something a user made. All but passport_entries cascade,
        # which is exactly why they have to be checked here instead of trusted to complain.
        protected = [r[0] for r in db.execute(text("""
            SELECT DISTINCT event_id FROM calendar_entries      WHERE event_id = ANY(:ids)
            UNION SELECT DISTINCT event_id FROM notifications   WHERE event_id = ANY(:ids)
            UNION SELECT DISTINCT event_id FROM passport_entries WHERE event_id = ANY(:ids)
            UNION SELECT DISTINCT event_id FROM event_invites   WHERE event_id = ANY(:ids)
            UNION SELECT DISTINCT event_id FROM reviews         WHERE event_id = ANY(:ids)
            UNION SELECT DISTINCT event_id FROM hotel_bookings  WHERE event_id = ANY(:ids)
            UNION SELECT DISTINCT event_id FROM trip_stops      WHERE event_id = ANY(:ids)
        """), {"ids": family}).all()]

        # A protected row must survive, so everything it points at has to survive with it.
        keep = set(protected)
        if protected:
            keep |= {r[0] for r in db.execute(text("""
                WITH RECURSIVE up AS (
                    SELECT id, merged_into FROM events WHERE id = ANY(:p)
                    UNION
                    SELECT e.id, e.merged_into FROM events e JOIN up ON up.merged_into = e.id
                )
                SELECT id FROM up"""), {"p": protected}).all()}
        out["kept_because_saved"] = len(keep)
        doomed = [i for i in family if i not in keep]

        titles = db.execute(text("""SELECT title, count(*) FROM events WHERE id = ANY(:ids)
                                    GROUP BY title ORDER BY count(*) DESC, title LIMIT 12"""),
                            {"ids": doomed}).all()
        print(f"[festivals] {len(doomed)} concert rows are really festival listings"
              + (f" (incl. {len(family) - len(ids)} merged into them)" if len(family) > len(ids) else ""))
        for t, n in titles:
            print(f"    {n} x  {t[:66]}")
        if protected:
            print(f"[festivals] KEEPING {len(protected)} a user saved or was alerted about")

        if not dry_run:
            for tbl in ("event_facts", "event_artists", "event_offers", "event_genres",
                        "event_sources", "event_changes"):
                db.execute(text(f"DELETE FROM {tbl} WHERE event_id = ANY(:ids)"), {"ids": doomed})
            # Cut the self-references inside the doomed set before removing the rows, so
            # the order rows happen to be deleted in can never matter.
            db.execute(text("UPDATE events SET merged_into = NULL WHERE id = ANY(:ids)"),
                       {"ids": doomed})
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


# A festival's name carries its year, the concert listing's often does not: the real thing
# is "Corona Capital 2026" while the three concert rows are plain "Corona Capital". Matching
# has to ignore the year or the two never meet.
_YEAR = re.compile(r"\s*(?:19|20)\d{2}\s*$")


def _name_key(name: str) -> str:
    """Cluster key that survives a missing year. 'Corona Capital 2026' -> 'corona capital'."""
    return _YEAR.sub("", _key(name)).strip()


def _existing_festival_for(db: Session, title: str, day) -> "tuple | None":
    """A festival we already hold that this concert row is a day OF, or None.

    Deliberately NOT keyed on city. The three Corona Capital concert rows carry the right
    venue — Autódromo Hermanos Rodríguez, the Mexico City circuit — under the wrong city,
    Temple City, US. Keyed on city they would miss the real festival in México and promote
    a second Corona Capital into the United States. Name plus a date the festival actually
    covers is the stronger claim, and a festival name is distinctive enough to carry it.
    """
    rows = db.execute(text("""
        SELECT f.id, f.name, f.starts_on, f.ends_on FROM festivals f
        WHERE f.merged_into IS NULL AND f.starts_on IS NOT NULL
          AND :day BETWEEN f.starts_on AND COALESCE(f.ends_on, f.starts_on)
    """), {"day": day}).all()
    want = _name_key(title)
    for fid, name, _s, _e in rows:
        if _name_key(name) == want:
            return fid, name
    return None


# A festival's bill CHANGES from one day to the next; a residency's does not. Both of those
# are "same title, same venue, consecutive nights", which is why the day count alone proves
# nothing — The Weeknd plays three nights at one stadium and Chris Botti six.
#
# Measured 2026-08-26 over every upcoming event we hold: 132 groups are same-title,
# same-venue and consecutive, and requiring the bill to differ across days cuts those to
# five — Corona Capital, Rock The Country (Ocala), Rock The Country (Hamburg), Voices of
# America Country Music Fest and Wasteland. Every one is a festival, and Corona Capital is
# a useful control: the rule independently re-finds a festival we already hold.
#
# This is the signal the bill-size rule cannot see. Rock The Country fields 7-9 acts a day
# against a BIG_BILL_ACTS floor of 10, so it sat under Concerts as four separate one-day
# concerts — and a two-day festival shown as two one-day rows also reports the wrong dates.
MULTIDAY_MIN_ACTS = 2


def find_multiday_events() -> list[dict]:
    """Concert rows that are really the days of one multi-day festival.

    Returns one entry per EVENT row, not per group: each is promoted to its own festival and
    merge_festivals then folds them into a single row with the true date range and a
    day-by-day bill, which is the same path the ticket-type variants already take.
    """
    db: Session = SessionLocal()
    try:
        rows = db.execute(text("""
            WITH per_event AS (
                SELECT e.id, e.title, e.venue_id, e.starts_at::date AS day,
                       (SELECT string_agg(ea.artist_id::text, ',' ORDER BY ea.artist_id)
                          FROM event_artists ea WHERE ea.event_id = e.id) AS bill,
                       (SELECT count(*) FROM event_artists ea WHERE ea.event_id = e.id) AS acts
                FROM events e
                WHERE e.merged_into IS NULL AND e.starts_at >= now()
                  AND e.venue_id IS NOT NULL
                  AND NOT EXISTS (
                        SELECT 1 FROM event_sources es
                        JOIN festival_sources fs ON fs.source_festival_id = es.source_event_id
                        WHERE es.event_id = e.id)
            ), grouped AS (
                SELECT title, venue_id,
                       count(DISTINCT day) AS days,
                       max(day) - min(day) AS span,
                       count(DISTINCT bill) AS distinct_bills,
                       max(acts) AS max_acts
                FROM per_event GROUP BY title, venue_id
            )
            SELECT p.id, p.title, p.day, p.acts, g.days, g.distinct_bills
            FROM per_event p
            JOIN grouped g ON g.title = p.title AND g.venue_id IS NOT DISTINCT FROM p.venue_id
            WHERE g.days >= 2                     -- more than one date
              AND g.span = g.days - 1             -- and they run CONSECUTIVELY, no gaps
              AND g.distinct_bills >= 2           -- and the line-up changes: not a residency
              AND g.max_acts >= :min_acts
            ORDER BY p.title, p.day
        """), {"min_acts": MULTIDAY_MIN_ACTS}).all()
    finally:
        db.close()
    return [{"id": r[0], "title": r[1], "day": r[2], "acts": r[3],
             "group_days": r[4], "group_bills": r[5]} for r in rows]


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
    out = {"promoted": 0, "absorbed": 0, "skipped_saved": 0, "dry_run": dry_run}
    try:
        # Second signal, admitted alongside the bill-size one. A festival that fields fewer
        # than BIG_BILL_ACTS a day is invisible to the count but obvious from its SHAPE:
        # consecutive days at one venue with a line-up that changes. See find_multiday_events.
        multiday = {r["id"]: r for r in find_multiday_events()}
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
            HAVING COUNT(ea.artist_id) >= :n OR e.id::text = ANY(:extra)
        """), {"n": BIG_BILL_ACTS, "extra": [str(k) for k in multiday]}).all()

        big = sum(1 for r in rows if r[0] not in multiday)
        print(f"[festivals] {big} concert rows have a festival-sized bill, "
              f"{len(rows) - big} are days of a multi-day festival")
        for eid, title, day, city_id, img, about, acts in rows:
            saved = db.execute(text("SELECT count(*) FROM calendar_entries WHERE event_id=:e"),
                               {"e": eid}).scalar()
            if saved:
                # Promoting would move it out from under the save. Left alone and reported.
                out["skipped_saved"] += 1
                print(f"    SKIP (saved) {title[:52]} — {acts} acts")
                continue
            why = ("multi-day" if eid in multiday else "big bill")

            # Already held as a festival — this row is one of its days, not a new festival.
            # Carrying the listing's Ticketmaster id onto the EXISTING festival is what makes
            # drop_duplicate_festival_events remove the concert row, so the show stops
            # appearing under Concerts without a second festival being invented.
            found = _existing_festival_for(db, title, day)
            if found:
                out["absorbed"] += 1
                print(f"    {acts:3} acts  [{why:9}] {title[:44]} -> ABSORBED into "
                      f"{found[1][:32]!r}")
                if not dry_run:
                    db.execute(text("""
                        INSERT INTO festival_sources (id, festival_id, source, source_festival_id, source_url)
                        SELECT gen_random_uuid(), :f, 'ticketmaster', es.source_event_id, es.source_url
                        FROM event_sources es
                        WHERE es.event_id = :e AND es.source = 'ticketmaster'
                        ON CONFLICT (source, source_festival_id) DO NOTHING"""),
                        {"f": found[0], "e": eid})
                continue

            print(f"    {acts:3} acts  [{why:9}] {title[:52]}")
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
