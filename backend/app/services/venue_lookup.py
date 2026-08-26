"""Find-or-create a venue, matching on the name with Ticketmaster's artefacts removed.

The mirror of artist_lookup, and it exists for the same reason. Venues were keyed on the
EXACT (name, city_id), so 'Toyota Center' and 'Toyota Center - TX' became two rows for one
arena in Houston, and a show at it appeared twice. Artists had this fault first — 'Men at
Work' and 'Men At Work' — and it was fixed by matching on a normalised name rather than by
cleaning up afterwards.

One definition of the key, used by both ingest paths and by venue_merge, so a reconcile pass
can never disagree with the ingest about what counts as the same venue.
"""
import re
import unicodedata

from sqlalchemy.orm import Session

from app.models.venue import Venue

# A trailing state code ('Toyota Center - TX'), Ticketmaster's '- Redirect' placeholder,
# punctuation, a leading 'The'. Nothing else.
_TAIL = re.compile(r"\s*[-–]\s*(?:redirect|[a-z]{2})$")
_PUNCT = re.compile(r"[^a-z0-9 ]+")

# Letters NFD cannot help with, because they are distinct characters rather than a base plus
# a combining mark. Without this the punctuation strip DELETES them: Turkish 'Alaçatı' became
# 'alacat', losing its final letter, and 'ß' vanished from a German venue name entirely.
_LETTERS = str.maketrans({
    "ı": "i", "İ": "i", "ø": "o", "Ø": "o", "ł": "l", "Ł": "l",
    "đ": "d", "Đ": "d", "ð": "d", "Ð": "d", "þ": "th", "Þ": "th",
    "ß": "ss", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe",
})


def key(name: str) -> str:
    """The comparison key for a venue name.

    Parentheses are KEPT as words, not stripped. Stripping them looked tidier and merged two
    real venues: Detroit's 'TSDMAAC (Crypt)' and 'TSDMAAC (Catacombs)' are different rooms.

    Accents ARE folded, in Python, via NFD decomposition. Safe to do here precisely because
    this is the only implementation — venue_merge imports this function rather than writing
    its own, so ingest and reconcile cannot drift apart. Without folding, the punctuation
    strip ate accented letters whole ('Autódromo' -> 'aut dromo'), which matched consistently
    but would have missed 'Café' against 'Cafe'.
    """
    s = unicodedata.normalize("NFD", (name or "").translate(_LETTERS))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = _TAIL.sub("", s.lower())
    s = _PUNCT.sub(" ", s)
    s = re.sub(r"^the\s+", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _index(db: Session, city_ids: set) -> dict:
    """Every venue in these cities, by (key, city_id). Bounded by the batch, not the table.

    A row with coordinates wins a collision, so the resolved venue is the one that can draw
    a map — and it is stable, because the tie-break falls through to the id.
    """
    q = db.query(Venue)
    real = [c for c in city_ids if c is not None]
    if None in city_ids:
        q = q.filter(Venue.city_id.in_(real) | Venue.city_id.is_(None)) if real \
            else q.filter(Venue.city_id.is_(None))
    else:
        q = q.filter(Venue.city_id.in_(real))
    out: dict = {}
    for v in sorted(q.all(), key=lambda v: (v.lat is None, str(v.id))):
        out.setdefault((key(v.name), v.city_id), v)
    return out


def resolve_many(db: Session, wanted: dict) -> dict:
    """{(name, city_id): {'lat':…, 'lng':…}} -> {(name, city_id): Venue}.

    Keyed on the ORIGINAL name in the returned map, because that is what the caller holds.
    """
    if not wanted:
        return {}
    index = _index(db, {cid for _, cid in wanted})
    out = {}
    for (name, cid), vals in wanted.items():
        k = (key(name), cid)
        v = index.get(k)
        if v is None:
            v = Venue(name=name, city_id=cid, lat=vals.get("lat"), lng=vals.get("lng"))
            db.add(v)
            index[k] = v
        elif v.lat is None and vals.get("lat") is not None:
            # The row we already had did not know where it was, and this listing does.
            v.lat, v.lng = vals["lat"], vals["lng"]
        out[(name, cid)] = v
    db.flush()
    return out


def get_or_create(db: Session, name: str, city_id=None, lat=None, lng=None) -> Venue:
    """Single-venue form, for the one-event-at-a-time ingest path."""
    return resolve_many(db, {(name, city_id): {"lat": lat, "lng": lng}})[(name, city_id)]
