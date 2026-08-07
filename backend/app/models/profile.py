from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class Profile(Base):
    __tablename__ = "profiles"

    # id EQUALS the Supabase Auth user id (FastAPI sets it from the verified JWT).
    # No hard FK to auth.users on purpose: Alembic manages only the public schema.
    id = Column(Uuid, primary_key=True)

    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    home_city_id = Column(Uuid, ForeignKey("cities.id"), nullable=True)  # user-picked, never GPS

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    home_city = relationship("City")
