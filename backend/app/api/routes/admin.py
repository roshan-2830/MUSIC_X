from fastapi import APIRouter, Depends

from app.core.security import get_current_user_id
from app.scheduler import trigger_enrich_now, trigger_refresh_now, trigger_sweep_now

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


@router.post("/enrich")
def enrich_now(limit: int | None = None, user_id: str = Depends(get_current_user_id)):
    """Fill in artist pages right now — photo, bio, genre tags, similar artists and
    popularity, for the artists who have upcoming shows, busiest first. Free sources
    only (Deezer, Wikipedia, Last.fm); no Ticketmaster budget is spent.

    `limit` is PER STAGE, not for the whole run: each stage asks only for the artists
    still missing its own field. Pass ?limit=5 for a quick end-to-end test — a full run
    is thousands of API calls and takes a while. Runs in the background; watch the
    server logs for [enrich] and [tags] lines."""
    trigger_enrich_now(limit=limit)
    scope = f"{limit} artists per stage" if limit else "the default batch per stage"
    return {"status": f"enrichment started ({scope}) — watch the server logs for [enrich] lines"}
