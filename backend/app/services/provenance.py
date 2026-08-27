"""Provenance — the receipts for what we show.

`event_facts` has been in the schema since day one with a comment on one column
that is really the whole company philosophy:

    fact_value = Column(Text, nullable=True)   # NULL = "not published" (never invented)

Until now nothing ever wrote a row into it, so the "How we know this" card on an
event was a hand-typed sentence claiming a filing system that did not exist. This
module is that filing system.

Three rules:

  1. **Every row comes from the source.** A fact exists here because Ticketmaster
     published it. Nothing is inferred, averaged, or filled in from a similar show.

  2. **Silence beats a guess.** If the source does not publish the doors time, we
     write no doors row. The gap is the honest answer, and the UI shows it as a gap.

  3. **A fact that stops being published stops being ours.** If it vanishes from the
     source on a later check, we DELETE the row rather than keep serving a value we
     can no longer stand behind.

`trust_tier` records HOW we got the value, which is a different question from how
fresh it is (that is `confidence`, see services/trust.py):

  • high   — the source states it as a structured field. We copied it.
  • medium — we pulled it out of the source's prose with a strict pattern. The
             `snapshot` column keeps the surrounding sentence so the claim is
             auditable by a human, and so a bad extraction is findable later.
"""
import re
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.event_fact import EventFact

SOURCE_NAME = "Ticketmaster"

# "Doors: 6:30 PM" / "doors open 7pm" — a time must actually follow the word, so
# prose like "30 mins prior to doors on event days" correctly matches nothing.
_DOORS_RE = re.compile(
    r"\bdoors?(?:\s+open)?(?:\s+at)?\s*[:\-–]?\s*"
    r"(\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)",
    re.I,
)


# Values the source uses to mean "we have nothing here". Storing them would put
# "Box office hours: N/A" on screen as though it were information — a blank the user
# can see is honest, a filled-in "N/A" is not. Matched on the whole value only.
_PLACEHOLDERS = {
    "n/a", "na", "n.a.", "none", "no", "-", "--", "tbc", "tba", "tbd",
    "unknown", "not available", "not applicable", "no information",
    "no info", "not specified", "null",
}


def _clean(v):
    """Verbatim source text, whitespace-tidied. Blank or a placeholder means the
    source published nothing, so we publish nothing."""
    if not isinstance(v, str):
        return None
    v = " ".join(v.split())
    if not v or v.strip(" .").lower() in _PLACEHOLDERS:
        return None
    return v


def _venue(raw: dict) -> dict:
    return ((raw.get("_embedded") or {}).get("venues") or [{}])[0] or {}


# --- extractors ------------------------------------------------------------
# Each returns either a string (what the source says) or None (not published).
# A few return (value, snapshot) when the value was pulled out of prose.

def _f_doors(raw):
    for field in ("info", "pleaseNote"):
        text = _clean(raw.get(field))
        if not text:
            continue
        m = _DOORS_RE.search(text)
        if m:
            lo, hi = max(0, m.start() - 60), min(len(text), m.end() + 60)
            return m.group(1).upper().replace(".", ""), text[lo:hi]
    return None


def _f_start_time(raw):
    st = (raw.get("dates") or {}).get("start") or {}
    if st.get("timeTBA") or st.get("noSpecificTime") or st.get("dateTBD"):
        return None      # the source is explicitly saying it does not know yet
    return _clean(st.get("localTime"))


def _f_price_range(raw):
    pr = (raw.get("priceRanges") or [{}])[0] or {}
    lo, hi, cur = pr.get("min"), pr.get("max"), pr.get("currency")
    if lo is None:
        return None
    if lo == 0 and (hi is None or hi == 0):
        return None      # 0/0 is Ticketmaster for "no price published", not "free"
    if hi and hi != lo:
        return f"{lo:.2f}–{hi:.2f} {cur or ''}".strip()
    return f"{lo:.2f} {cur or ''}".strip()


def _f_age_policy(raw):
    ar = raw.get("ageRestrictions") or {}
    # Only claim something when the flag is actually set. False means "not enforced",
    # which is NOT the same as "all ages welcome" — so we stay quiet.
    return "Legal drinking age enforced" if ar.get("legalAgeEnforced") is True else None


# Ticketmaster fills unset sale dates with a sentinel far in the past (1900-01-01).
# Printing "On sale from 1 Jan 1900" would be nonsense dressed as a fact.
_EARLIEST_REAL_YEAR = 2000


def _iso_or_none(v):
    v = _clean(v)
    if not v:
        return None
    try:
        when = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    return None if when.year < _EARLIEST_REAL_YEAR else v


def _sales(raw, which):
    pub = ((raw.get("sales") or {}).get("public") or {})
    if which == "start" and (pub.get("startTBD") or pub.get("startTBA")):
        return None
    return _iso_or_none(pub.get("startDateTime" if which == "start" else "endDateTime"))


def _f_presale(raw):
    ps = ((raw.get("sales") or {}).get("presales") or [])
    if not ps:
        return None
    p = ps[0]
    name, when = _clean(p.get("name")), _iso_or_none(p.get("startDateTime"))
    return " · ".join(x for x in (name, when) if x) or None


# fact_key, trust_tier, extractor
FACT_SPECS = [
    # --- structured fields, copied straight across -------------------------
    ("start_time",         "high",   _f_start_time),
    ("timezone",           "high",   lambda r: _clean((r.get("dates") or {}).get("timezone"))),
    ("status",             "high",   lambda r: _clean(((r.get("dates") or {}).get("status") or {}).get("code"))),
    ("price_range",        "high",   _f_price_range),
    ("on_sale",            "high",   lambda r: _sales(r, "start")),
    ("sale_ends",          "high",   lambda r: _sales(r, "end")),
    ("presale",            "high",   _f_presale),
    ("ticket_limit",       "high",   lambda r: _clean((r.get("ticketLimit") or {}).get("info"))),
    ("age_policy",         "high",   _f_age_policy),
    ("accessibility",      "high",   lambda r: _clean((r.get("accessibility") or {}).get("info"))),
    ("please_note",        "high",   lambda r: _clean(r.get("pleaseNote"))),
    ("seatmap",            "high",   lambda r: _clean((r.get("seatmap") or {}).get("staticUrl"))),
    ("promoter",           "high",   lambda r: _clean((r.get("promoter") or {}).get("name"))),
    # --- venue block, also structured -------------------------------------
    ("venue_address",      "high",   lambda r: _clean((_venue(r).get("address") or {}).get("line1"))),
    ("box_office_hours",   "high",   lambda r: _clean((_venue(r).get("boxOfficeInfo") or {}).get("openHoursDetail"))),
    ("box_office_payment", "high",   lambda r: _clean((_venue(r).get("boxOfficeInfo") or {}).get("acceptedPaymentDetail"))),
    ("parking",            "high",   lambda r: _clean(_venue(r).get("parkingDetail"))),
    ("accessible_seating", "high",   lambda r: _clean(_venue(r).get("accessibleSeatingDetail"))),
    ("child_policy",       "high",   lambda r: _clean((_venue(r).get("generalInfo") or {}).get("childRule"))),
    # --- pulled out of prose: keeps a snapshot so a human can audit it -----
    ("doors",              "medium", _f_doors),
]


def extract_facts(raw: dict) -> dict:
    """What this payload actually publishes. Keys absent = not published."""
    out = {}
    for key, tier, fn in FACT_SPECS:
        try:
            got = fn(raw)
        except Exception:
            got = None                       # a malformed payload is not a fact
        if got is None:
            continue
        value, snapshot = got if isinstance(got, tuple) else (got, None)
        if value:
            out[key] = {"value": value, "tier": tier, "snapshot": snapshot}
    return out


def sync_facts(db: Session, pairs: list, today: date | None = None,
               withdraw: bool = True) -> dict:
    """Bring `event_facts` in line with what the source publishes right now.

    `pairs` is a list of (event_id, raw_payload, source_url). Existing rows for
    those events are loaded in ONE query, so this stays cheap on a 1,300-event
    deep refresh.

    `withdraw` — whether a fact absent from this payload should be DELETED.

        Only pass True for an AUTHORITATIVE payload: the by-id detail fetch, which
        is by definition the complete record for that one event. The sweep and live
        search read a search PAGE, which is a projection — a field absent there does
        not establish that the source stopped publishing it, and deleting on that
        basis would let good facts flap in and out every three hours.

        (Measured 2026-08-18: on a 3-event sample the search payload happened to
        carry exactly the same facts as the detail payload, so this is a guard on the
        invariant rather than a fix for an observed bug. Kept because withdrawal is
        destructive and the by-id fetch is the only response we can prove is whole.)

    Returns a tally: added / updated / removed / untouched.
    """
    today = today or date.today()
    if not pairs:
        return {"added": 0, "updated": 0, "removed": 0, "untouched": 0}

    # ONE payload per event. Merging ticket-type listings repointed their Ticketmaster ids
    # onto the surviving event, so 171 events now carry more than one source id — one carries
    # eighteen — and the deep refresh fetches each of them. Two payloads for one event walked
    # this loop twice, and `held.pop` had already removed the row on the first pass, so the
    # second inserted a duplicate and violated uq_event_fact_key.
    #
    # The richest payload wins. They describe the same show, so the one publishing the most
    # is the fullest record of it; picking arbitrarily would make the stored facts depend on
    # the order Ticketmaster happened to return the ids in.
    if len({eid for eid, _, _ in pairs}) != len(pairs):
        best: dict = {}
        for eid, raw, url in pairs:
            n = len(extract_facts(raw))
            if eid not in best or n > best[eid][0]:
                best[eid] = (n, (eid, raw, url))
        pairs = [v[1] for v in best.values()]

    event_ids = [eid for eid, _, _ in pairs]
    held = {}
    for row in db.query(EventFact).filter(EventFact.event_id.in_(event_ids)).all():
        held[(row.event_id, row.fact_key)] = row

    tally = {"added": 0, "updated": 0, "removed": 0, "untouched": 0}
    for event_id, raw, source_url in pairs:
        found = extract_facts(raw)
        for key, f in found.items():
            row = held.pop((event_id, key), None)
            if row is None:
                db.add(EventFact(
                    event_id=event_id, fact_key=key, fact_value=f["value"],
                    source_name=SOURCE_NAME, source_url=source_url,
                    snapshot=f["snapshot"], trust_tier=f["tier"], last_verified=today,
                ))
                tally["added"] += 1
                continue
            if row.fact_value != f["value"]:
                row.fact_value = f["value"]
                row.snapshot = f["snapshot"]
                tally["updated"] += 1
            else:
                tally["untouched"] += 1
            # even an unchanged fact was re-confirmed today — that is the point
            row.source_name, row.source_url = SOURCE_NAME, source_url
            row.trust_tier, row.last_verified = f["tier"], today

    # Anything we held for these events that the source no longer publishes:
    # we cannot stand behind it, so it goes — but only if this payload is the
    # authoritative one (see `withdraw` above).
    if withdraw:
        for row in held.values():
            db.delete(row)
            tally["removed"] += 1

    return tally


# --- how these read on screen -------------------------------------------------
# One place for the labels, so the API, the app and the extractor cannot drift.
LABELS = {
    "doors":              "Doors open",
    "start_time":         "Start time",
    "price_range":        "Ticket price",
    "on_sale":            "On sale from",
    "sale_ends":          "Sales close",
    "presale":            "Presale",
    "age_policy":         "Age policy",
    "ticket_limit":       "Ticket limit",
    "child_policy":       "Children",
    "accessibility":      "Accessibility",
    "accessible_seating": "Accessible seating",
    "parking":            "Parking",
    "box_office_hours":   "Box office",
    "box_office_payment": "Box office payment",
    "venue_address":      "Address",
    "promoter":           "Promoter",
    "seatmap":            "Seat map",
    "please_note":        "Please note",
    "status":             "Listing status",
    "timezone":           "Timezone",
}

# Display order: what a person planning a night out wants first.
DISPLAY_ORDER = [
    "doors", "start_time", "price_range", "on_sale", "sale_ends", "presale",
    "age_policy", "child_policy", "ticket_limit", "accessibility",
    "accessible_seating", "parking", "box_office_hours", "box_office_payment",
    "venue_address", "seatmap", "promoter", "please_note", "status", "timezone",
]

# The facts a visitor would actually plan around. When the source does not publish
# one of these we say so out loud — a visible gap is the honest answer, and it is
# also the more useful one: "doors time not published" tells you to check the venue.
EXPECTED = ["doors", "start_time", "price_range", "age_policy", "child_policy",
            "ticket_limit", "accessibility", "parking"]


def label_for(fact_key: str) -> str:
    return LABELS.get(fact_key, fact_key.replace("_", " ").capitalize())


def sort_key(fact_key: str) -> int:
    return DISPLAY_ORDER.index(fact_key) if fact_key in DISPLAY_ORDER else len(DISPLAY_ORDER)


def missing_expected(present_keys) -> list:
    """Which of the facts worth knowing this source does not publish."""
    have = set(present_keys)
    return [k for k in EXPECTED if k not in have]


# Keys whose value is an ISO timestamp from the source.
_DATE_KEYS = {"on_sale", "sale_ends"}


def display_value(fact_key: str, value: str, tz_name: str | None = None) -> str:
    """How the fact reads on screen.

    `fact_value` in the database stays exactly as the source wrote it — that is what
    makes it auditable. This is the presentation of it, kept here so the API and the
    app cannot disagree about how a date is shown.
    """
    if not value:
        return value
    try:
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except Exception:
        tz = timezone.utc

    def fmt(iso: str) -> str | None:
        try:
            when = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except ValueError:
            return None
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return when.astimezone(tz).strftime("%-d %b %Y, %H:%M")

    if fact_key in _DATE_KEYS:
        return fmt(value) or value
    if fact_key == "start_time":
        return value[:5] if len(value) >= 5 and value[2] == ":" else value
    if fact_key == "presale" and " · " in value:
        name, _, iso = value.rpartition(" · ")
        return f"{name} · {fmt(iso) or iso}"
    return value
