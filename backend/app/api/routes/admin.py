from fastapi import APIRouter, Depends

from app.core.security import get_current_user_id
from app.scheduler import trigger_refresh_now, trigger_sweep_now

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/refresh")
def refresh_now(limit: int | None = None, user_id: str = Depends(get_current_user_id)):
    """Trigger a deep refresh right now — re-verify EVERY event in the catalogue by its
    Ticketmaster id (status/dates/price), for all shows. Runs in the background. Pass
    ?limit=10 to check only a few events (quick test). Watch server logs for [refresh]."""
    trigger_refresh_now(limit=limit)
    scope = f"first {limit} events" if limit else "all events"
    return {"status": f"deep refresh started ({scope}) — watch the server logs for [refresh] lines"}


@router.post("/sweep")
def sweep_now(user_id: str = Depends(get_current_user_id)):
    """Trigger a broad discovery sweep right now — pulls a wide batch of upcoming shows
    (any artist) + festivals, so newly announced shows appear even for un-followed artists.
    Runs in the background. Watch server logs for [sweep]."""
    trigger_sweep_now()
    return {"status": "sweep started — watch the server logs for [sweep] lines"}
