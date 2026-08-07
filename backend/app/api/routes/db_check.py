from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/db-check")
def db_check(db: Session = Depends(get_db)):
    """Confirms the backend can actually reach the Supabase database."""
    result = db.execute(text("SELECT 1")).scalar()
    return {"database": "connected", "result": result}
