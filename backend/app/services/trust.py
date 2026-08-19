"""How sure are we — derived, never typed in.

Confidence answers one narrow question: **how well does what we are showing you
match what the source last told us?** It is not a rating of the show, and it is
not a guess about the promoter. It is a statement about our own freshness.

Two things move it, and only two:

  • **freshness**    — when did we last re-check this against the official source
  • **completeness** — do we actually hold the basics (a date and a place)

The important property is that it **decays on its own**. Nothing has to run for an
event to lose confidence: the moment the re-verify job stops (server off, API down,
event dropped from the feed) every event slides from "high" to "medium" to "low"
purely because the calendar moved on. A confidence that can only go DOWN without
work, and only goes UP when we genuinely re-check, is a confidence worth printing.

This replaces three hardcoded `confidence = "low"` lines that used to stamp every
event and festival in the catalogue with the same value, whether we had checked it
four hours ago or never.
"""
from datetime import date

# Re-checked today or yesterday. The deep refresh runs daily, so a healthy
# catalogue sits here.
FRESH_DAYS = 1
# Still recent enough to stand behind, but we say so less strongly.
RECENT_DAYS = 7


def confidence_for(*, last_verified: date | None, has_when: bool,
                   has_where: bool, today: date | None = None) -> str:
    """high | medium | low — computed from what we hold, for events and festivals alike.

    `has_when`  — we have a start date/time
    `has_where` — we have a venue (events) or a city (festivals)

    Missing either basic caps us at "low" no matter how recently we looked: a show
    with no date is not something we can be confident about, however fresh the fetch.
    """
    today = today or date.today()

    if not has_when or not has_where:
        return "low"
    if last_verified is None:
        return "low"

    days = (today - last_verified).days
    if days < 0:          # a future date means a clock we cannot trust — don't claim
        return "low"
    if days <= FRESH_DAYS:
        return "high"
    if days <= RECENT_DAYS:
        return "medium"
    return "low"
