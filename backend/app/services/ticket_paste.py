"""Reading a booking confirmation somebody pasted in.

WHY THIS IS VERIFICATION, NOT SEARCH, and why that matters. The paste happens on one event's
page, so we already know which show is meant. We are not asked "which of 7,500 concerts is this
about" — we are asked "does this text plausibly refer to THIS one". That turns the PRD's hardest
rule into an easy one: "ambiguous ⇒ needsReview, never guessed" is satisfied by never having to
choose in the first place.

WHAT IT DOES NOT KEEP. A confirmation email carries a name, a postal address, the last digits of
a card, sometimes a barcode. The caller stores the seller and the reference; nothing else is
returned and the text is never written down. Holding somebody's payment record to answer a
question we have already answered would be the opposite of the point.
"""
import re
import unicodedata
from datetime import date

# Sellers we recognise, and the strings that give them away. Ordered: the first hit wins, so the
# more specific names come before the ones that appear inside other brands' emails ("Live
# Nation" turns up in plenty of Ticketmaster mail).
SELLERS = [
    ("Ticketmaster", ("ticketmaster", "ticketweb", "tmuk", "livenation.com/ticketmaster")),
    ("Dice", ("dice.fm", "dicefm", "from dice", "your dice ticket")),
    ("AXS", ("axs.com", "axs uk", "axs europe")),
    ("BookMyShow", ("bookmyshow", "bms ")),
    ("Eventbrite", ("eventbrite",)),
    ("See Tickets", ("seetickets", "see tickets")),
    ("Live Nation", ("livenation", "live nation")),
    ("Songkick", ("songkick",)),
    ("Resident Advisor", ("residentadvisor", "ra.co")),
]

# Order references, most explicit first. A bare number is never taken as a reference: "2026" and
# "18:30" would both qualify and neither is an order.
REF_PATTERNS = [
    r"order\s*(?:number|no\.?|#|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{4,24})",
    r"booking\s*(?:reference|number|no\.?|id|ref)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{4,24})",
    r"confirmation\s*(?:number|no\.?|code|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{4,24})",
    r"reference\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{4,24})",
    r"\border\s+([A-Z]{1,4}[-–]?\d{4,12})\b",
]

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def _fold(s: str) -> str:
    """Lowercase, accents removed, punctuation flattened to single spaces.

    So "Estadio Riyadh Air Metropolitano" matches "ESTADIO RIYADH AIR METROPOLITANO" and
    "Tablao Flamenco 1911" matches "tablao flamenco 1911", and an email that writes the venue
    with a comma or a dash still matches.
    """
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _tokens(s: str) -> list:
    # Two-letter words are dropped: "of", "the", "at" match everything and prove nothing.
    return [t for t in _fold(s).split() if len(t) > 2]


def detect_seller(text: str) -> str | None:
    low = _fold(text)
    for name, needles in SELLERS:
        if any(_fold(n) in low for n in needles):
            return name
    return None


def detect_ref(text: str) -> str | None:
    up = text.upper()
    for pat in REF_PATTERNS:
        m = re.search(pat, up, re.I)
        if m:
            ref = m.group(1).strip(" -–")
            # A run of digits that is really a year, a time or a price is not a reference.
            if re.fullmatch(r"\d{1,4}", ref):
                continue
            return ref[:40]
    return None


def _name_hit(text_folded: str, name: str | None) -> bool:
    """Does this name appear, allowing for the email writing it differently?

    Whole-token overlap rather than substring: "The Weeknd" against a body mentioning
    "weekend getaway" must not count, and a venue called "O2" must not match every "o2" inside
    another word.
    """
    if not name:
        return False
    toks = _tokens(name)
    if not toks:
        return False
    body = set(text_folded.split())
    hits = sum(1 for t in toks if t in body)
    # One distinctive token is enough for a one-word name; longer names must match most of it,
    # so "Royal Albert Hall" is not matched by an email that merely says "royal".
    need = 1 if len(toks) == 1 else max(2, (len(toks) + 1) // 2)
    return hits >= need


def _date_hit(text: str, when: date | None) -> bool:
    """Does the show's date appear, in any of the ways an email might write it?"""
    if not when:
        return False
    low = _fold(text)
    mon = [k for k, v in MONTHS.items() if v == when.month][0]
    d, y = when.day, when.year
    candidates = {
        f"{d} {mon}", f"{mon} {d}", f"{d:02d} {mon}", f"{mon} {d:02d}",
        f"{d} {mon} {y}", f"{mon} {d} {y}", f"{y} {when.month:02d} {d:02d}",
        f"{d:02d} {when.month:02d} {y}", f"{when.month:02d} {d:02d} {y}",
    }
    return any(c in low for c in candidates)


def verify(text: str, *, artist: str | None, title: str | None, venue: str | None,
           city: str | None, when: date | None) -> dict:
    """Does this pasted text refer to THIS show?

    Returns what was found and what was matched, so the caller can explain itself rather than
    just refusing. Two independent matches are required, and one of them must be the act or the
    venue: a date and a city alone describe every other show in that city that night.
    """
    folded = _fold(text)
    matched = {
        "artist": _name_hit(folded, artist),
        "title": _name_hit(folded, title),
        "venue": _name_hit(folded, venue),
        "city": _name_hit(folded, city),
        "date": _date_hit(text, when),
    }
    strong = matched["artist"] or matched["title"] or matched["venue"]
    count = sum(1 for v in matched.values() if v)
    return {
        "seller": detect_seller(text),
        "reference": detect_ref(text),
        "matched": matched,
        "match_count": count,
        # The rule, in one place: two signals, at least one of them naming the act or the room.
        "confident": bool(strong and count >= 2),
    }
