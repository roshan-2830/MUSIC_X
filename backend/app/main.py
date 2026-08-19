from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import (health, db_check, events, me, cities, artists, admin,
                            festivals, notifications)
from app.scheduler import scheduler, start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()          # begin the recurring catalogue refresh
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

# Dev CORS — lets the web app call the API. Tighten (specific origins) before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(db_check.router)
app.include_router(events.router)
app.include_router(me.router)
app.include_router(cities.router)
app.include_router(artists.router)
app.include_router(admin.router)
app.include_router(festivals.router)
app.include_router(notifications.router)


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "ok"}
