import uuid

from sqlalchemy import Column, String, Uuid

from app.db.session import Base


class Artist(Base):
    __tablename__ = "artists"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=True)
    image_url = Column(String, nullable=True)
