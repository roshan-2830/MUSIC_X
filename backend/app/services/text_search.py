"""Matching a search term against text that may be accented, or typed wrong.

Two separate problems, deliberately handled at different strengths.

ACCENTS are not fuzzy. "Gulsen" and "Gülşen" are the same name typed on two keyboards, so
folding belongs in the main match: `fold(col) LIKE fold(term)` in place of `col ILIKE
term`. It can only ever ADD rows — folded text matches everything the unfolded text did —
and the GIN trigram indexes from migration 3396219474a7 serve it, so it is no slower.

TYPOS are fuzzy, so they get their own tier that runs ONLY when the strict search found
nothing. That ordering matters: a search that works today returns exactly what it returns
today, unchanged and in the same order. The fuzzy pass can only fill a screen that was
otherwise empty, which is the one place a wrong guess costs nothing.

Fuzziness is scored against ARTIST and FESTIVAL names, never event titles. Measured on
this catalogue, `similarity` on a short clean name puts the right answer first every time
("Metalica" -> Metallica, 0.73), while the same call against a long title ranks a
coincidence above the real thing ("Metalica" -> "Scene Queen: METALICIOUS", 0.78, over
Metallica at 0.73). `word_similarity` was worse still for the same reason.
"""
from sqlalchemy import func, literal

# Below this, a match is a coincidence rather than a misspelling. Read off this catalogue:
# every correct hit measured at 0.38 or above (Coldpaly->Coldplay 0.38, Foo Figthers->Foo
# Fighters 0.50, Metalica->Metallica 0.73) and the worst false positive at 0.33
# ("Billie Eilish" -> Billie Marten, because Billie Eilish is not in the catalogue).
SIM_FLOOR = 0.35

# Postgres put unaccent and pg_trgm here; mx_fold lives in public. Qualified because a
# search must not depend on whose search_path happens to be in effect.
_EXT = "extensions"


def escape_like(raw: str) -> str:
    """Neuter the LIKE wildcards in what the user typed.

    Without this a search for "50%" matches the entire catalogue. Backslash first, or it
    escapes the escapes that follow.
    """
    return raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def fold(expr):
    """Lowercase and strip accents, in SQL.

    Deliberately not reimplemented in Python. This codebase has already been bitten by a
    normalised-name rule that Python and SQL disagreed about; one definition, in the
    database, cannot drift.
    """
    return func.mx_fold(expr)


def contains(col, safe: str):
    """col holds the term somewhere, accents ignored."""
    return fold(col).like(literal("%") + fold(literal(safe)) + literal("%"), escape="\\")


def starts_with(col, safe: str):
    """col begins with the term, accents ignored."""
    return fold(col).like(fold(literal(safe)) + literal("%"), escape="\\")


def whole_word(col, raw: str):
    """The term appears as a WHOLE word in col.

    \\m and \\M are Postgres word boundaries. This is what stops "ADE" leading with
    "brigADE" and "ADElaide". The term is regex-escaped before folding — a festival called
    "Rock & Roll" must not be read as a pattern — and folding leaves the escapes alone.
    """
    import re
    # self_group() is load-bearing: `~` binds tighter than `||` in Postgres, so without the
    # parentheses this parses as (fold(col) ~ '\m') || ... and the WHERE clause is handed a
    # string instead of a boolean.
    pattern = (literal(r"\m") + fold(literal(re.escape(raw))) + literal(r"\M")).self_group()
    return fold(col).op("~")(pattern)


def similarity(col, raw: str):
    """How close col is to the term, 0..1 — the typo score."""
    return getattr(func, _EXT).similarity(fold(col), fold(literal(raw)))


def is_close(col, raw: str):
    """col is a plausible misspelling of the term."""
    return similarity(col, raw) > SIM_FLOOR
