import uuid

from sqlalchemy import Column, String, Uuid

from app.db.session import Base


class Genre(Base):
    __tablename__ = "genres"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    slug = Column(String, unique=True, nullable=True)
