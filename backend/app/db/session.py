from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# Supabase gives a plain "postgresql://" URL. SQLAlchemy needs to know which
# driver to use, so we point it at psycopg (v3), which we just installed.
db_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)

# The engine manages the actual connections to Postgres.
# pool_pre_ping checks a connection is alive before using it (avoids stale-connection errors).
engine = create_engine(db_url, pool_pre_ping=True)

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
