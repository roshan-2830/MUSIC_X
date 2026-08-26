"""searchable without the accent, and forgiving of a typo

157 of 5,223 artists have a non-ASCII name — João Gomes, Gülşen, Edén Muñoz, Beyoncé.
Every one of them was unreachable unless the user typed the accent, which on a phone
keyboard nobody does. And a misspelling returned an empty screen, which a user reads not
as "I typed it wrong" but as "this app doesn't have them".

Two extensions fix both. `unaccent` folds the diacritics; `pg_trgm` scores how close two
strings are, so "Rammstien" can still find "Rammstein".

`mx_fold(text)` is the bridge. unaccent() is STABLE, not IMMUTABLE — Postgres refuses to
index a call to it, because a dictionary could in principle be reloaded. Naming the
dictionary explicitly makes the call deterministic, so the wrapper can be declared
IMMUTABLE and indexed. It lowercases too, so lookups compare LIKE against folded text
rather than ILIKE, and one GIN trigram index then serves BOTH readings of a query: the
substring match and the similarity score.

Revision ID: 3396219474a7
Revises: f6a7b8c9d0e1
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '3396219474a7'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Supabase keeps extensions out of `public` and puts that schema on the search_path. The
# index operator class and the dictionary are referenced by qualified name regardless, so
# an index definition never depends on whose search_path is in effect when it is used.
SCHEMA = 'extensions'

# Every column a search box reads. Cities and venues are indexed too — venues are not
# searchable yet, and this is the index they will need when they are.
TARGETS = [
    ('artists', 'name'),
    ('events', 'title'),
    ('festivals', 'name'),
    ('cities', 'name'),
    ('venues', 'name'),
]


def upgrade() -> None:
    op.execute(f'CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA {SCHEMA}')
    op.execute(f'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA {SCHEMA}')

    # STRICT so a NULL name folds to NULL instead of erroring; PARALLEL SAFE so it can
    # still be used in a parallel seq scan on the tables that outgrow their index.
    op.execute(f"""
        CREATE OR REPLACE FUNCTION public.mx_fold(txt text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
            SELECT lower({SCHEMA}.unaccent('{SCHEMA}.unaccent'::regdictionary, txt))
        $$
    """)

    for table, column in TARGETS:
        op.execute(
            f'CREATE INDEX IF NOT EXISTS ix_{table}_{column}_fold_trgm '
            f'ON {table} USING gin (public.mx_fold({column}) {SCHEMA}.gin_trgm_ops)'
        )


def downgrade() -> None:
    for table, column in TARGETS:
        op.execute(f'DROP INDEX IF EXISTS ix_{table}_{column}_fold_trgm')
    op.execute('DROP FUNCTION IF EXISTS public.mx_fold(text)')
    # The extensions themselves are left installed: dropping them is not this migration's
    # to undo, and another migration may come to depend on them.
