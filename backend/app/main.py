from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import health, db_check, events

app = FastAPI(title=settings.app_name, version="0.1.0")

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


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "ok"}
