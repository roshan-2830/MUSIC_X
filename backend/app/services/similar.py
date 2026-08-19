"""Similar artists — from links we can actually point at.

Two kinds of evidence, kept visibly separate because they answer different questions:

  • **Who they share a stage with** — computed from our own catalogue (below).
  • **Who their listeners also play** — Last.fm's scrobble similarity, cached in
    `artist_similar`. This is the stronger signal and the only one that reaches outside
    Ticketmaster's US/UK/Europe footprint: Karan Aujla has no stage link we can see at
    all, and Last.fm returns Diljit Dosanjh, AP Dhillon and Sidhu Moose Wala.

Neither is blended into a single mystery number. Every row states which evidence it
rests on, so a reader can judge it instead of trusting it.

The stage signal uses the three real connections our own catalogue contains, in
descending order of how much they actually mean:

  1. **Shared a festival bill** (weight 5, scaled DOWN by how big the bill is). The
     strongest signal available offline: a booker deliberately put these two acts on
     the same bill. But the size of the bill decides how much that means — sharing a
     six-act line-up is a real statement about who belongs together, while sharing
     Lowlands, which has 127 acts, says almost nothing. Without this scaling every
     Lowlands act came out "similar" to every other one and the lists were alphabetical
     noise.
  2. **Shared a concert line-up** (weight 3). Support slots and co-headline bills —
     the same judgement, at a smaller scale.
  3. **Shared a genre** (weight 1). Weak, and used only to fill out a thin list.
     "Both are rock bands" is barely a link, so it never outranks a real co-billing.

The rule that matters: **if there is no link, the section does not render.** We never
pad with popular names to make it look full. An artist with no shared bill and no
genre in common simply has no similar artists here, and saying so is the honest
answer — the same rule as an unrated show or an unpublished doors time.

Every result carries the reason in plain English, naming the festival or show it came
from, so a reader can check the claim rather than trust it.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

W_FESTIVAL = 5
W_LINEUP = 3
W_GENRE = 1

# Listening overlap outranks co-billing: a booker's judgement about one bill is weaker
# evidence than millions of listening sessions. A Last.fm match of 1.0 scores 10, so it
# beats even a tight co-bill (5) — but an artist with BOTH sits top, which is right.
W_LASTFM = 10

# A bill of this size or smaller counts for full weight; bigger bills are scaled down
# proportionally, so a 127-act festival contributes about a twelfth of a 10-act one.
TIGHT_BILL = 10


# Below this, the evidence is too thin to publish. It is set so that:
#   • a tight co-bill (10 acts or fewer) qualifies on its own          -> 5.0 / 3.0
#   • sharing ONLY a huge festival does not                            -> 127 acts = 0.39
#   • sharing ONLY a genre does not                                    -> 1.0
# The middle case is the one that matters. Tyler, The Creator's single link is Lowlands,
# where 126 other acts score identically — so any ordering is arbitrary and the top of
# the list came out as "2hollis, ADÉLA, Afra". Publishing that as "similar artists"
# would be inventing a relationship the data cannot support, so we publish nothing.
MIN_SCORE = 2.0


def _bill_weight(base: float, bill_size: int) -> float:
    """Full weight for a tight bill, fading as the line-up grows."""
    return base * min(1.0, TIGHT_BILL / max(bill_size, 1))

# Placeholder acts that are not artists at all.
_NOT_ARTISTS = ("tba", "various", "various artists", "special guest", "special guests")


def similar_artists(db: Session, artist_id, limit: int = 8) -> list[dict]:
    """Artists genuinely linked to this one. Empty list when there is no link."""
    scores: dict = {}          # artist_id -> {"name","image_url","score","reasons"}

    def bump(aid, name, image, weight, reason):
        if not name or name.strip().lower() in _NOT_ARTISTS or aid == artist_id:
            return
        row = scores.setdefault(aid, {"id": aid, "name": name, "image_url": image,
                                      "score": 0, "reasons": []})
        row["score"] += weight
        if reason and len(row["reasons"]) < 3:
            row["reasons"].append(reason)

    # --- 1. shared festival bill ---------------------------------------------
    for r in db.execute(text("""
        SELECT a.id, a.name, a.image_url, f.name AS festival,
               (SELECT COUNT(*) FROM festival_lineup x
                 WHERE x.festival_id = me.festival_id) AS bill_size
        FROM festival_lineup me
        JOIN festival_lineup them ON them.festival_id = me.festival_id
                                 AND them.artist_id <> me.artist_id
        JOIN artists a  ON a.id = them.artist_id
        JOIN festivals f ON f.id = me.festival_id
        WHERE me.artist_id = :aid
    """), {"aid": artist_id}).all():
        bump(r[0], r[1], r[2], _bill_weight(W_FESTIVAL, r[4]),
             f"Also on the bill at {r[3]}")

    # --- 2. shared concert line-up -------------------------------------------
    for r in db.execute(text("""
        SELECT a.id, a.name, a.image_url, e.title,
               (SELECT COUNT(*) FROM event_artists x WHERE x.event_id = me.event_id)
        FROM event_artists me
        JOIN event_artists them ON them.event_id = me.event_id
                               AND them.artist_id <> me.artist_id
        JOIN artists a ON a.id = them.artist_id
        JOIN events  e ON e.id = me.event_id
        WHERE me.artist_id = :aid
    """), {"aid": artist_id}).all():
        bump(r[0], r[1], r[2], _bill_weight(W_LINEUP, r[4]), f"Shared a bill: {r[3]}")

    # --- 3. shared genre — weak, so it only ever tops up a thin list ----------
    # Capped hard: without a cap this returns every pop act in the catalogue, which
    # would bury the acts that share an actual stage.
    for r in db.execute(text("""
        WITH my_genres AS (
            SELECT DISTINCT eg.genre_id
            FROM event_artists ea
            JOIN event_genres eg ON eg.event_id = ea.event_id
            WHERE ea.artist_id = :aid
        )
        SELECT a.id, a.name, a.image_url, g.name, COUNT(DISTINCT ea.event_id) AS shows
        FROM event_genres eg
        JOIN my_genres mg ON mg.genre_id = eg.genre_id
        JOIN genres g          ON g.id = eg.genre_id
        JOIN event_artists ea  ON ea.event_id = eg.event_id
        JOIN artists a         ON a.id = ea.artist_id
        WHERE ea.artist_id <> :aid
        GROUP BY a.id, a.name, a.image_url, g.name
        ORDER BY shows DESC
        LIMIT 40
    """), {"aid": artist_id}).all():
        bump(r[0], r[1], r[2], W_GENRE, f"Also plays {r[3]}")

    # ties broke alphabetically before, which is how "2hollis, ADÉLA, Afra" ended up
    # topping a list. More shared links beats fewer; the alphabet is the last resort.
    ranked = sorted((r for r in scores.values() if r["score"] >= MIN_SCORE),
                    key=lambda x: (-x["score"], -len(x["reasons"]), x["name"]))
    return [
        {"id": r["id"], "name": r["name"], "image_url": r["image_url"],
         "reason": r["reasons"][0] if r["reasons"] else "Shares a genre",
         "shared": len(r["reasons"])}
        for r in ranked[:limit]
    ]


def _lastfm_rows(db: Session, artist_id) -> list:
    """Cached Last.fm similarity for this artist. Never calls the network — the route
    refreshes the cache in the background so an artist page never waits on it."""
    return db.execute(text("""
        SELECT name, match, image_url FROM artist_similar
        WHERE artist_id = :aid AND source = 'lastfm'
        ORDER BY match DESC NULLS LAST
    """), {"aid": artist_id}).all()


def similar_combined(db: Session, artist_id, artist_name: str, limit: int = 10) -> list[dict]:
    """Both signals, merged and each row labelled with the evidence behind it."""
    from app.services.deezer import _norm

    stage = {r["name"]: r for r in similar_artists(db, artist_id, limit=30)}
    by_norm = {_norm(k): k for k in stage}

    merged: dict = {}
    for name, match, image in _lastfm_rows(db, artist_id):
        m = float(match or 0)
        key = _norm(name)
        also_on_stage = by_norm.get(key)
        if also_on_stage:
            s = stage.pop(also_on_stage)
            by_norm.pop(key, None)
            merged[key] = {
                "id": s["id"], "name": s["name"], "image_url": s["image_url"] or image,
                "reason": f"Plays with them, and their listeners overlap",
                "shared": s["shared"] + 1, "_score": W_LASTFM * m + MIN_SCORE,
            }
        else:
            merged[key] = {
                "id": None, "name": name, "image_url": image,
                "reason": f"Listeners of {artist_name} also play them",
                "shared": 1, "_score": W_LASTFM * m,
            }

    # whatever the stage signal found that Last.fm did not mention
    for name, s in stage.items():
        merged.setdefault(_norm(name), {**s, "_score": MIN_SCORE})

    ranked = sorted(merged.values(), key=lambda x: (-x["_score"], x["name"]))
    return [{k: v for k, v in r.items() if k != "_score"} for r in ranked[:limit]]
