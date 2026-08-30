from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import (health, db_check, events, me, cities, artists, admin,
                            festivals, genres, notifications, passport, people, travel, plan)
from app.scheduler import scheduler, start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()          # begin the recurring catalogue refresh
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

# CORS is a BROWSER rule, so this list matters only to the web app — a native build ignores
# it entirely. Set CORS_ORIGINS to the deployed web origin(s); unset falls back to the local
# Expo dev servers so `expo start --web` keeps working with no configuration.
#
# Origins must be scheme + host + port with NO trailing slash — the browser compares the
# string literally, and "https://x.com/" never matches the Origin header "https://x.com".
_origins = [o.strip().rstrip("/") for o in settings.cors_origins.split(",") if o.strip()]
if not _origins:
    _origins = ["http://localhost:8081", "http://localhost:19006", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
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
app.include_router(genres.router)
app.include_router(notifications.router)
app.include_router(travel.router)
app.include_router(people.router)
app.include_router(plan.router)
app.include_router(passport.router)


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "ok"}
