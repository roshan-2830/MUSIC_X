"""One real building, filed by Ticketmaster as two venue rows.

'Toyota Center' and 'Toyota Center - TX' are one arena in Houston; 'ESTADIO
SHAKIRA(Iberdrola Music)' and 'Shakira Stadium' are one stadium in Madrid. Split like that,
a show appears twice, and whatever one row knows — its location, its capacity — the other
does not.

A HARD merge: the loser's events are repointed and the row is deleted. Artists dedupe the
same way, and it is the safer choice here — `events.venue_id` is the ONLY reference to a
venue, so nothing dangles and no query anywhere needs a `merged_into IS NULL` filter added.
The soft-merge alternative would mean finding every venue read in the codebase and hoping
none was missed, which is the class of bug that has bitten this project repeatedly.

Two rules, both measured over the whole catalogue before being trusted.
"""
import math
import re
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
# One definition of "the same venue name", shared with the ingest that creates the rows.
from app.services.venue_lookup import key as norm_name


# Two rows this close, in one city, are one building. Used ONLY together with a shared
# booking — see below.
NEAR_METRES = 200


def _tokens(name: str) -> set:
    """The words of a venue name, for asking whether two names agree on anything."""
    return {w for w in norm_name(name).split() if len(w) > 1}


def _metres(la1, lo1, la2, lo2):
    if None in (la1, lo1, la2, lo2):
        return None
    r = math.radians
    h = (math.sin((r(la2) - r(la1)) / 2) ** 2
         + math.cos(r(la1)) * math.cos(r(la2)) * math.sin((r(lo2) - r(lo1)) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def _by_name(db: Session) -> list:
    """RULE 1 — same city, same name once the listing artefacts are stripped.

    Measured over 2,024 venues: four groups, every one a genuine pair (The Eastern /
    The Eastern-GA, Toyota Center / Toyota Center - TX, Amerant Bank Arena twice,
    Intersection / The Intersection). No judgement call among them.
    """
    rows = db.execute(text("""
        SELECT v.id, v.name, v.city_id, v.lat, v.lng, v.capacity,
               (SELECT count(*) FROM events e WHERE e.venue_id = v.id) AS evs
        FROM venues v WHERE v.city_id IS NOT NULL
    """)).mappings().all()
    groups = defaultdict(list)
    for r in rows:
        groups[(r["city_id"], norm_name(r["name"]))].append(dict(r))
    return [{"why": "same name", "rows": g} for g in groups.values() if len(g) > 1]


def _by_booking(db: Session) -> list:
    """RULE 2 — same city, within 200 m, AND hosting the same headliner on the same date.

    BOTH halves are needed, and each alone is bad.

    Proximity alone is almost entirely false: 261 pairs sit within 200 m, and they are
    overwhelmingly different rooms of one complex — V Theater and Saxe Theater inside Planet
    Hollywood, OVO Hydro and SEC Armadillo on one Glasgow campus, Ziggo Dome and Johan
    Cruijff ArenA next door to each other. Merging those would destroy real venues.

    A shared booking alone is also wrong: it paired Bleecker Bell with Iridium, 3.9 km apart
    in New York.

    Together they are strong, because an act plays ONE room a night: if two rows 200 m apart
    both claim the same headliner on the same date, one row is a duplicate of the other.
    Four pairs pass, including the Shakira stadium the name rule cannot see — 'estadio
    shakira' and 'shakira stadium' are the same words in two languages.
    """
    rows = db.execute(text("""
        SELECT DISTINCT va.id AS a_id, vb.id AS b_id
        FROM events ea
        JOIN events eb ON eb.headliner_artist_id = ea.headliner_artist_id
                      AND eb.starts_at::date = ea.starts_at::date
                      AND eb.venue_id <> ea.venue_id
        JOIN venues va ON va.id = ea.venue_id
        JOIN venues vb ON vb.id = eb.venue_id AND vb.city_id = va.city_id AND va.id < vb.id
        WHERE ea.merged_into IS NULL AND eb.merged_into IS NULL
          AND va.lat IS NOT NULL AND vb.lat IS NOT NULL
    """)).all()
    if not rows:
        return []
    ids = {i for pair in rows for i in pair}
    detail = {r["id"]: dict(r) for r in db.execute(text("""
        SELECT v.id, v.name, v.city_id, v.lat, v.lng, v.capacity,
               (SELECT count(*) FROM events e WHERE e.venue_id = v.id) AS evs
        FROM venues v WHERE v.id = ANY(:ids)
    """), {"ids": list(ids)}).mappings().all()}

    out = []
    for a_id, b_id in rows:
        a, b = detail[a_id], detail[b_id]
        m = _metres(a["lat"], a["lng"], b["lat"], b["lng"])
        if m is None or m >= NEAR_METRES:
            continue
        # Third condition, added after reading the dry run: the names must agree on at
        # least one word. Without it the rule paired İzmir's 'Noche Alaçatı' with 'Sommer
        # Klein' — 72 m apart and sharing a booking, but nothing else, and no reason to
        # believe they are one place. Every genuine pair survives it, because a building
        # renamed still keeps a word: 'shakira' spans 'ESTADIO SHAKIRA' and 'Shakira
        # Stadium', which is exactly the pair the name rule alone cannot see.
        if not (_tokens(a["name"]) & _tokens(b["name"])):
            continue
        out.append({"why": f"same booking, {m:.0f} m apart", "rows": [a, b]})
    return out


def _by_minute(db: Session) -> list:
    """RULE 3 — same city, same headliner at the same MINUTE, and the names share a word.

    Stronger than Rule 2 and it needs no coordinate at all. Rule 2 asks for a shared DATE
    plus 200 m of proximity; a shared MINUTE is a far harder claim on its own, because one
    act cannot begin two shows in one city at one minute. So the location can be unknown, or
    disagree by kilometres, and the conclusion still holds.

    That last part is what earns it a place: every pair it finds is 0.4 to 3.2 km apart on
    paper, so Rule 2 rejected all four — 'The Vogue' and 'Vogue Theatre - IN' in
    Indianapolis, 'HQ' and 'HQ Denver', 'Paramount Theatre' and 'Paramount Theatre-Iowa'
    (a suffix the name key does not strip, because it lists two-letter codes, not state
    names). The disagreeing coordinates were the duplication, not evidence against it.

    The shared word is still required, for the same reason as Rule 2: a headliner can be an
    artefact row minted from a billing string, and two unrelated shows can hang off one.
    """
    rows = db.execute(text("""
        SELECT DISTINCT va.id AS a_id, vb.id AS b_id
        FROM events ea
        JOIN events eb ON eb.headliner_artist_id = ea.headliner_artist_id
                      AND eb.starts_at = ea.starts_at
                      AND eb.venue_id <> ea.venue_id
        JOIN venues va ON va.id = ea.venue_id
        JOIN venues vb ON vb.id = eb.venue_id AND vb.city_id = va.city_id AND va.id < vb.id
        WHERE ea.merged_into IS NULL AND eb.merged_into IS NULL AND ea.starts_at >= now()
    """)).all()
    if not rows:
        return []
    ids = {i for pair in rows for i in pair}
    detail = {r["id"]: dict(r) for r in db.execute(text("""
        SELECT v.id, v.name, v.city_id, v.lat, v.lng, v.capacity,
               (SELECT count(*) FROM events e WHERE e.venue_id = v.id) AS evs
        FROM venues v WHERE v.id = ANY(:ids)
    """), {"ids": list(ids)}).mappings().all()}

    out = []
    for a_id, b_id in rows:
        a, b = detail[a_id], detail[b_id]
        if _tokens(a["name"]) & _tokens(b["name"]):
            out.append({"why": "same act, same minute", "rows": [a, b]})
    return out


def find_duplicates() -> list:
    """Groups of venue rows that are one venue. Rules are unioned, then overlaps folded."""
    db: Session = SessionLocal()
    try:
        groups = _by_name(db) + _by_booking(db) + _by_minute(db)
    finally:
        db.close()

    # A venue can qualify under both rules; merging the same row twice would fail on the
    # second pass. Fold any groups that share a member into one.
    merged: list = []
    for g in groups:
        ids = {r["id"] for r in g["rows"]}
        hit = next((m for m in merged if ids & {r["id"] for r in m["rows"]}), None)
        if hit:
            have = {r["id"] for r in hit["rows"]}
            hit["rows"] += [r for r in g["rows"] if r["id"] not in have]
            hit["why"] = f"{hit['why']} + {g['why']}"
        else:
            merged.append({"why": g["why"], "rows": list(g["rows"])})
    return merged


def _survivor(rows: list) -> dict:
    """The row most listings already point at, preferring one that knows where it is.

    Deliberately NOT "the row with the better coordinates" — there is no way to tell which
    of two disagreeing coordinates is right, and pretending otherwise is how a venue ends up
    confidently in the wrong place. Where both know a location and they disagree, the
    survivor keeps its own and the disagreement is printed.
    """
    # The trailing state code is Ticketmaster's artefact, not part of the name, so on a tie
    # 'Toyota Center' wins over 'Toyota Center - TX' rather than losing on string length.
    def artefact(n):
        low = (n or "").lower()
        # Ticketmaster disambiguates with a hyphen and NO spaces around it — 'Paramount
        # Theatre-Iowa', 'The Eastern-GA', 'Palace Theatre-NY' — whereas a real name spaces
        # its dashes ('Co-op Live' keeps its hyphen mid-name, not trailing). Matching only
        # two-letter codes kept 'Paramount Theatre-Iowa' as the surviving name over the
        # actual 'Paramount Theatre'.
        return bool(re.search(r"\s*[-–]\s*(?:redirect|[a-z]{2})$", low)
                    or re.search(r"\S[-–]\w+$", low))
    return max(rows, key=lambda r: (r["evs"], r["lat"] is not None,
                                    not artefact(r["name"]), len(r["name"] or "")))


def merge_venues(dry_run: bool = True) -> dict:
    """Fold duplicate venue rows together. Dry run by default."""
    db: Session = SessionLocal()
    out = {"groups": 0, "rows_merged": 0, "events_moved": 0, "fields_filled": 0,
           "coord_conflicts": 0, "dry_run": dry_run}
    try:
        for g in find_duplicates():
            win = _survivor(g["rows"])
            losers = [r for r in g["rows"] if r["id"] != win["id"]]
            if not losers:
                continue
            out["groups"] += 1
            city = db.execute(text("SELECT name, country FROM cities WHERE id=:c"),
                              {"c": win["city_id"]}).first()
            print(f"\n=== {win['name'][:44]} ({(city[0] if city else '?')}, "
                  f"{(city[1] if city else '?')}) — {g['why']} ===")
            print(f"  KEEP  {win['name'][:44]:44} {win['evs']:>3} events")

            for l in losers:
                print(f"  FOLD  {l['name'][:44]:44} {l['evs']:>3} events -> moved")
                out["rows_merged"] += 1
                out["events_moved"] += l["evs"]

                # Fill only what the survivor is MISSING. Never overwrite a known value.
                fills = {}
                for col in ("lat", "lng", "capacity"):
                    if win.get(col) is None and l.get(col) is not None:
                        fills[col] = l[col]
                if fills:
                    out["fields_filled"] += len(fills)
                    print(f"        fills {', '.join(fills)} from this row")
                if (win["lat"] is not None and l["lat"] is not None):
                    m = _metres(win["lat"], win["lng"], l["lat"], l["lng"])
                    if m is not None and m > NEAR_METRES:
                        out["coord_conflicts"] += 1
                        print(f"        NOTE both rows claim a location, {m/1000:.1f} km "
                              f"apart — keeping the survivor's, not guessing")
                if dry_run:
                    continue
                if fills:
                    sets = ", ".join(f"{k} = :{k}" for k in fills)
                    db.execute(text(f"UPDATE venues SET {sets} WHERE id = :v"),
                               {**fills, "v": win["id"]})
                    win.update(fills)
                db.execute(text("UPDATE events SET venue_id = :w WHERE venue_id = :l"),
                           {"w": win["id"], "l": l["id"]})
                db.execute(text("DELETE FROM venues WHERE id = :l"), {"l": l["id"]})

        if dry_run:
            db.rollback()
            print("\n[venues] DRY RUN — nothing written.")
        else:
            db.commit()
            print(f"\n[venues] merged {out['rows_merged']} row(s) into {out['groups']} venue(s)")
    except Exception as e:
        db.rollback()
        print(f"[venues] merge failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    return out
