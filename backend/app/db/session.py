from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# Supabase gives a plain "postgresql://" URL. SQLAlchemy needs to know which
# driver to use, so we point it at psycopg (v3), which we just installed.
db_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)

# The engine manages the actual connections to Postgres.
# pool_pre_ping checks a connection is alive before using it (avoids stale-connection errors).
# prepare_threshold=None disables psycopg server-side prepared statements — required for
# Supabase's connection pooler, which otherwise raises "another command is already in progress".
engine = create_engine(
    db_url,
    pool_pre_ping=True,
    # DISCARD CONNECTIONS OLDER THAN FIVE MINUTES. This was -1 — keep forever — and that is
    # what turned a WiFi reconnect into a 500. A connection parked in the pool across a network
    # change is dead, but nothing knew it: the socket looks open to us and is gone at the other
    # end. pool_pre_ping alone did not save us, because the ping itself failed and the psycopg
    # dialect then raised ProgrammingError while restoring autocommit — and SQLAlchemy only
    # treats OperationalError as "this connection is dead, get another one", so the confusing
    # error surfaced to the browser instead of a silent reconnect.
    pool_recycle=300,
    connect_args={
        "prepare_threshold": None,
        # Ask the OS to prove the connection is alive every 30s while idle. This is what makes
        # a dead socket DETECTABLE rather than something we only discover mid-query, and it also
        # stops the pooler and any NAT in between from quietly dropping an idle connection.
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
        # A laptop on hotel WiFi should fail in ten seconds, not hang a request for a minute.
        "connect_timeout": 10,
    },
)

# A factory that creates new database sessions.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Base class that all our future table models will inherit from.
Base = declarative_base()


def get_db():
    """FastAPI dependency: gives each request its own DB session, then closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
