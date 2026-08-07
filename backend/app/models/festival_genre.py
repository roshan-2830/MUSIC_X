import uuid

from sqlalchemy import Column, ForeignKey, Uuid, UniqueConstraint

from app.db.session import Base


class FestivalGenre(Base):
    __tablename__ = "festival_genres"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    festival_id = Column(Uuid, ForeignKey("festivals.id", ondelete="CASCADE"), nullable=False)
    genre_id = Column(Uuid, ForeignKey("genres.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("festival_id", "genre_id", name="uq_festival_genre"),
    )
