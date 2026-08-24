"""Merging artist rows that are the same act typed two ways.

Ticketmaster, Last.fm and Deezer each spell an artist their own way, and until now every
code path that created an artist used a different matching rule — case-sensitive in
ingestion, case-insensitive in the routes, normalised-within-the-batch-only in the
Last.fm import. So 'A.R. Rahman' and 'AR Rahman' became two artists, one user followed
both, and search showed the same act twice with the same photo.

The rule for merging, and why it is not just "same normalised name":

    A row may be merged into another only if its name is the winner's name RE-CASED, or
    with punctuation REMOVED. Never with characters ADDED.

Stripping punctuation before comparing is what makes 'OMAR+' look like 'Omar', and they
are not the same act — measured 2026-08-24, our 'Omar' plays Suset Festival in Spain
while 'OMAR+' plays Reading and Leeds in the UK. Deezer cannot settle it either: it
matches both, because our own normaliser removes the '+' before Deezer ever sees it, so
asking Deezer is circular. The asymmetry is the honest signal — a variant that DROPS a
dot is someone typing the same name lazily; a variant that ADDS a '+' is a different
name. So 'OMAR+' survives as its own artist, and a wrong merge (two acts' tours pooled
under one page) is avoided at the cost of a duplicate that may be real.

Everything here is dry-run by default. Merging deletes rows and git cannot undo it.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.services.deezer import _norm

# Non-derived attachments decide which row survives: these represent real user or
# catalogue data, unlike artist_similar which is a cache we can refetch.
_ATTACHMENTS = (
    ("events",           "SELECT count(*) FROM events WHERE headliner_artist_id = :a"),
    ("event_artists",    "SELECT count(*) FROM event_artists WHERE artist_id = :a"),
    ("festival_lineup",  "SELECT count(*) FROM festival_lineup WHERE artist_id = :a"),
    ("follows",          "SELECT count(*) FROM follows WHERE followable_type='artist' AND followable_id = :a"),
    ("notifications",    "SELECT count(*) FROM notifications WHERE artist_id = :a"),
    ("passport_entries", "SELECT count(*) FROM passport_entries WHERE artist_id = :a"),
    ("bucket_list",      "SELECT count(*) FROM bucket_list WHERE artist_id = :a"),
)

# Scalar columns worth inheriting when the winner has a NULL and the loser does not.
_INHERIT = (
    "image_url", "bio", "bio_source", "wiki_url", "website_url", "tags",
    "deezer_fans", "lastfm_listeners",
    "popularity_checked_on", "tags_checked_on", "similar_checked_on",
    "links_checked_on", "tour_synced_on",
)


def _punct(s: str) -> list:
    return [c for c in (s or "") if not c.isalnum()]


def is_mergeable_into(loser: str, winner: str) -> tuple[bool, str]:
    """May `loser` be merged into `winner`? Returns (verdict, reason).

    Precondition is a shared normalised form; this decides whether the DIFFERENCE is a
    typing variation or a different name.
    """
    if _norm(loser) != _norm(winner):
        return False, "different normalised names"
    if loser == winner:
        return False, "identical strings"
    if loser.lower() == winner.lower():
        return True, "differs only in capitalisation"

    extra = _punct(loser)
    allowed = _punct(winner)
    for c in extra:
        if c in allowed:
            allowed.remove(c)
        else:
            return False, f"adds {c!r}, which the surviving name does not have"
    return True, "drops punctuation the surviving name has"


def _count(db: Session, sql: str, aid) -> int:
    return db.execute(text(sql), {"a": aid}).scalar() or 0


def _attachment_total(db: Session, aid) -> int:
    return sum(_count(db, sql, aid) for _n, sql in _ATTACHMENTS)


def _filled(db: Session, aid) -> int:
    a = db.get(Artist, aid)
    return sum(1 for c in _INHERIT if getattr(a, c, None) is not None)


def find_groups() -> list[dict]:
    """Artist rows sharing a normalised name, with a proposed winner and per-row verdict."""
    db: Session = SessionLocal()
    try:
        keys = [r[0] for r in db.execute(text("""
            SELECT lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) k
            FROM artists GROUP BY 1 HAVING count(*) > 1
        """)).all()]

        groups = []
        for k in keys:
            rows = db.execute(text("""
                SELECT id, name FROM artists
                WHERE lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) = :k
                ORDER BY id
            """), {"k": k}).all()

            scored = []
            for aid, name in rows:
                scored.append({
                    "id": aid, "name": name,
                    "attachments": _attachment_total(db, aid),
                    "filled": _filled(db, aid),
                    "punct": len(_punct(name)),
                })
            # The winner keeps the most real data; ties go to the more punctuated name,
            # which is nearly always the properly typed one ('A.R. Rahman' over
            # 'AR Rahman'), then to the lowest id so the choice is deterministic.
            scored.sort(key=lambda r: (-r["attachments"], -r["filled"], -r["punct"], str(r["id"])))
            winner, rest = scored[0], scored[1:]

            for r in rest:
                ok, why = is_mergeable_into(r["name"], winner["name"])
                r["merge"], r["reason"] = ok, why
            groups.append({"key": k, "winner": winner, "losers": rest})
        return groups
    finally:
        db.close()


def _plan(db: Session, winner_id, loser_id) -> dict:
    """What merging loser into winner would move, and what it would have to delete.

    Deletes are not optional: `uq_follow`, `uq_event_artist`, `uq_bucket_user_artist` and
    `uq_artist_similar` all forbid the same pair twice, so where BOTH rows carry the same
    attachment the loser's copy has to go rather than be repointed. That is exactly the
    A.R. Rahman case — one user followed both spellings.
    """
    w, l = {"a": winner_id}, {"a": loser_id}
    q = lambda sql, p: db.execute(text(sql), p).scalar() or 0

    return {
        "events":        q("SELECT count(*) FROM events WHERE headliner_artist_id=:a", l),
        "notifications": q("SELECT count(*) FROM notifications WHERE artist_id=:a", l),
        "passport":      q("SELECT count(*) FROM passport_entries WHERE artist_id=:a", l),

        "event_artists_move": q("""SELECT count(*) FROM event_artists x WHERE x.artist_id=:l
              AND NOT EXISTS (SELECT 1 FROM event_artists y WHERE y.artist_id=:w AND y.event_id=x.event_id)""",
              {"l": loser_id, "w": winner_id}),
        "event_artists_drop": q("""SELECT count(*) FROM event_artists x WHERE x.artist_id=:l
              AND EXISTS (SELECT 1 FROM event_artists y WHERE y.artist_id=:w AND y.event_id=x.event_id)""",
              {"l": loser_id, "w": winner_id}),

        "follows_move": q("""SELECT count(*) FROM follows x WHERE x.followable_type='artist' AND x.followable_id=:l
              AND NOT EXISTS (SELECT 1 FROM follows y WHERE y.followable_type='artist'
                              AND y.followable_id=:w AND y.user_id=x.user_id)""",
              {"l": loser_id, "w": winner_id}),
        "follows_drop": q("""SELECT count(*) FROM follows x WHERE x.followable_type='artist' AND x.followable_id=:l
              AND EXISTS (SELECT 1 FROM follows y WHERE y.followable_type='artist'
                          AND y.followable_id=:w AND y.user_id=x.user_id)""",
              {"l": loser_id, "w": winner_id}),

        "festival_move": q("""SELECT count(*) FROM festival_lineup x WHERE x.artist_id=:l
              AND NOT EXISTS (SELECT 1 FROM festival_lineup y WHERE y.artist_id=:w AND y.festival_id=x.festival_id)""",
              {"l": loser_id, "w": winner_id}),
        "festival_drop": q("""SELECT count(*) FROM festival_lineup x WHERE x.artist_id=:l
              AND EXISTS (SELECT 1 FROM festival_lineup y WHERE y.artist_id=:w AND y.festival_id=x.festival_id)""",
              {"l": loser_id, "w": winner_id}),

        "bucket_move": q("""SELECT count(*) FROM bucket_list x WHERE x.artist_id=:l
              AND NOT EXISTS (SELECT 1 FROM bucket_list y WHERE y.artist_id=:w AND y.user_id=x.user_id)""",
              {"l": loser_id, "w": winner_id}),
        "bucket_drop": q("""SELECT count(*) FROM bucket_list x WHERE x.artist_id=:l
              AND EXISTS (SELECT 1 FROM bucket_list y WHERE y.artist_id=:w AND y.user_id=x.user_id)""",
              {"l": loser_id, "w": winner_id}),

        # artist_similar is a refetchable cache, so the loser's copy is simply dropped.
        "similar_drop": q("SELECT count(*) FROM artist_similar WHERE artist_id=:a", l),

        "taste_core":     q("SELECT count(*) FROM taste_profiles WHERE :a = ANY(core_artist_ids)", l),
        "taste_adjacent": q("SELECT count(*) FROM taste_profiles WHERE :a = ANY(adjacent_artist_ids)", l),

        "inherits": [c for c in _INHERIT
                     if getattr(db.get(Artist, winner_id), c, None) is None
                     and getattr(db.get(Artist, loser_id), c, None) is not None],
    }


def _apply(db: Session, winner_id, loser_id) -> None:
    """Repoint everything, drop what a unique constraint forbids, then delete the loser."""
    p = {"l": loser_id, "w": winner_id}

    for tbl, col in (("event_artists", "event_id"), ("festival_lineup", "festival_id")):
        db.execute(text(f"""DELETE FROM {tbl} x WHERE x.artist_id=:l
            AND EXISTS (SELECT 1 FROM {tbl} y WHERE y.artist_id=:w AND y.{col}=x.{col})"""), p)
        db.execute(text(f"UPDATE {tbl} SET artist_id=:w WHERE artist_id=:l"), p)

    db.execute(text("""DELETE FROM follows x WHERE x.followable_type='artist' AND x.followable_id=:l
        AND EXISTS (SELECT 1 FROM follows y WHERE y.followable_type='artist'
                    AND y.followable_id=:w AND y.user_id=x.user_id)"""), p)
    db.execute(text("UPDATE follows SET followable_id=:w WHERE followable_type='artist' AND followable_id=:l"), p)

    db.execute(text("""DELETE FROM bucket_list x WHERE x.artist_id=:l
        AND EXISTS (SELECT 1 FROM bucket_list y WHERE y.artist_id=:w AND y.user_id=x.user_id)"""), p)
    db.execute(text("UPDATE bucket_list SET artist_id=:w WHERE artist_id=:l"), p)

    db.execute(text("UPDATE events SET headliner_artist_id=:w WHERE headliner_artist_id=:l"), p)
    db.execute(text("UPDATE notifications SET artist_id=:w WHERE artist_id=:l"), p)
    db.execute(text("UPDATE passport_entries SET artist_id=:w WHERE artist_id=:l"), p)
    db.execute(text("DELETE FROM artist_similar WHERE artist_id=:l"), p)

    # Arrays of ids, easy to miss: a stale id here silently skews recommendations.
    for col in ("core_artist_ids", "adjacent_artist_ids"):
        db.execute(text(f"""UPDATE taste_profiles SET {col} = (
              SELECT array_agg(DISTINCT x) FROM unnest(array_replace({col}, :l, :w)) x)
            WHERE :l = ANY({col})"""), p)

    win, lose = db.get(Artist, winner_id), db.get(Artist, loser_id)
    for c in _INHERIT:
        if getattr(win, c, None) is None and getattr(lose, c, None) is not None:
            setattr(win, c, getattr(lose, c))
    # slug is unique — free the loser's before the winner could ever take it.
    if lose.slug and not win.slug:
        slug, lose.slug = lose.slug, None
        db.flush()
        win.slug = slug
    db.delete(lose)


def dedupe_artists(dry_run: bool = True) -> dict:
    """Report (and optionally perform) every safe artist merge.

    Dry run by default and on purpose: this deletes rows, which no `git checkout` undoes.
    """
    groups = find_groups()
    db: Session = SessionLocal()
    out = {"groups": 0, "merged": 0, "skipped": 0, "detail": []}
    try:
        for g in groups:
            w = g["winner"]
            out["groups"] += 1
            print(f"\n=== {g['key']} ===")
            print(f"  KEEP   {w['name']!r}  (attachments={w['attachments']}, filled={w['filled']})")
            for l in g["losers"]:
                if not l["merge"]:
                    out["skipped"] += 1
                    print(f"  SKIP   {l['name']!r}  — {l['reason']}")
                    print(f"         stays a separate artist (attachments={l['attachments']})")
                    out["detail"].append({"keep": w["name"], "skip": l["name"], "reason": l["reason"]})
                    continue
                plan = _plan(db, w["id"], l["id"])
                moves = {k: v for k, v in plan.items() if k != "inherits" and v}
                print(f"  MERGE  {l['name']!r}  — {l['reason']}")
                if moves:
                    for k, v in moves.items():
                        verb = "delete" if k.endswith(("_drop",)) else "move"
                        print(f"           {verb:6} {v:3}  {k}")
                else:
                    print("           (nothing attached to move)")
                if plan["inherits"]:
                    print(f"           winner inherits: {', '.join(plan['inherits'])}")
                out["detail"].append({"keep": w["name"], "merge": l["name"],
                                      "reason": l["reason"], "plan": moves,
                                      "inherits": plan["inherits"]})
                if not dry_run:
                    _apply(db, w["id"], l["id"])
                out["merged"] += 1
        if dry_run:
            db.rollback()
            print("\n[dedupe] DRY RUN — nothing was written.")
        else:
            db.commit()
            print("\n[dedupe] committed.")
    except Exception as e:
        db.rollback()
        print(f"[dedupe] failed, rolled back: {type(e).__name__} {e}")
        raise
    finally:
        db.close()
    print(f"[dedupe] {out['groups']} groups — {out['merged']} to merge, {out['skipped']} left alone")
    return out
