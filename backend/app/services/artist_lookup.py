"""One way to find-or-create an artist, used by every path that does.

Duplicates came from having five ways. Ingestion matched case-SENSITIVELY, the routes
matched case-insensitively, and the Last.fm import normalised only within its own incoming
batch and never against the database. So 'Men at Work' met 'Men At Work' and became a
second artist; 'AR Rahman' met 'A.R. Rahman' and became a second artist that one user then
followed twice, which is how the same act appeared twice in their Following list with the
same photo.

Matching is on the normalised name — lowercased, with everything that is not a letter or
digit removed. That is deliberately the SAME key services/dedupe.py groups by, so a name
this helper treats as already-present is exactly a name dedupe would have merged. The two
cannot drift apart and disagree about what counts as the same artist.

Two limits, stated rather than assumed:

  • The key is computed identically in Python and in SQL, which means it does NOT fold
    accents: Postgres would need the unaccent extension, which is not installed here, and
    a Python-only fold would silently disagree with the query. So 'Beyoncé' and 'Beyonce'
    would still become two rows. Every duplicate actually measured in this catalogue
    (2026-08-24) was case or punctuation, so those are covered; accents are a known gap.

  • This narrows names TOGETHER, so it will never merge two acts that a human would call
    different — except where punctuation is the only difference. 'OMAR' and 'OMAR+' are
    measurably different acts (Spain vs Reading/Leeds) and this helper WILL treat them as
    one. dedupe.py refuses that merge on purpose; here the cost of a lookup collision is
    accepted, because the alternative is the duplicate flood this exists to stop.
"""
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.artist import Artist

# Kept in lockstep with the SQL below. Do not swap in deezer._norm: that folds accents,
# Postgres here does not, and a key that disagrees with the query silently stops matching.
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]")


def key(name: str) -> str:
    """The normalised match key. Same result as the SQL expression in `_norm_col`."""
    return _NON_ALNUM.sub("", name or "").lower()


def _norm_col():
    """Postgres-side equivalent of `key()`, so matching happens in one query."""
    return func.lower(func.regexp_replace(Artist.name, "[^a-zA-Z0-9]", "", "g"))


def get_or_create_many(db: Session, names) -> dict:
    """{requested name -> Artist} for every name given, creating only what we lack.

    One query for the whole batch, then one create pass. Several spellings of the same
    artist in a single batch all map to the SAME row, which is the other half of the bug:
    a batch containing both 'Men at Work' and 'Men At Work' used to create two rows in one
    pass, before any database lookup was involved.

    Flushes so callers get usable ids; commits nothing.
    """
    wanted = {}
    for n in names:
        if n and n.strip():
            wanted.setdefault(key(n), n.strip())
    if not wanted:
        return {}

    found = {}
    for a in (db.query(Artist)
                .filter(_norm_col().in_(list(wanted)))
                .order_by(Artist.deezer_fans.desc().nullslast(), Artist.id).all()):
        # If the catalogue still holds an un-merged duplicate pair, resolve to the row
        # that already looks like the real artist rather than picking arbitrarily. Ordering
        # by id alone chose 'AR Rahman' (no fans, no shows) over 'A.R. Rahman' (283,680
        # fans, a live date) purely on uuid sort order, which would then hang new follows
        # and events off the emptier row — and it is the row dedupe.py deletes. Fans first
        # keeps this helper and dedupe picking the same survivor.
        found.setdefault(key(a.name), a)

    made = 0
    for k, display in wanted.items():
        if k not in found:
            a = Artist(name=display)
            db.add(a)
            found[k] = a
            made += 1
    if made:
        db.flush()

    return {n.strip(): found[key(n)] for n in names if n and n.strip()}


def get_or_create(db: Session, name: str, image_url: str | None = None) -> Artist | None:
    """Single-name version. Fills a missing photo if one is offered, never overwrites."""
    if not name or not name.strip():
        return None
    a = get_or_create_many(db, [name])[name.strip()]
    if image_url and not a.image_url:
        a.image_url = image_url
    return a
