from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.city import City
from app.models.event import Event
from app.models.venue import Venue
from app.schemas.city import CityIn, CityOut, CityWithShows

router = APIRouter(prefix="/cities", tags=["cities"])


@router.get("/search-with-shows", response_model=list[CityWithShows])
def search_with_shows(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """App cities whose name matches `q` AND that actually have upcoming shows, ranked by
    how many. This is what the city picker offers first, so users pick the real 'London'
    (41 shows) instead of an empty look-alike from the worldwide map search."""
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.query(City, func.count(Event.id).label("n"))
        .join(Venue, Venue.city_id == City.id)
        .join(Event, Event.venue_id == Venue.id)
        .filter(City.name.ilike(f"%{q.strip()}%"))
        .filter(Event.merged_into.is_(None), Event.retired_at.is_(None))
        .filter((Event.starts_at >= cutoff) | (Event.starts_at.is_(None)))
        .group_by(City.id)
        .order_by(func.count(Event.id).desc())
        .limit(10)
        .all()
    )
    return [
        CityWithShows(id=c.id, name=c.name, country=c.country, show_count=n)
        for c, n in rows
    ]


@router.get("/search-global", response_model=list[CityIn])
def search_global(q: str = Query(..., min_length=2)):
    """Search ALL world cities (OpenStreetMap/Nominatim) — so users can pick any real
    city (Bangalore, Adelaide…), not just cities that already have shows."""
    try:
        r = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "addressdetails": 1, "limit": 10, "accept-language": "en"},
            headers={"User-Agent": "MusicX/0.1 (music discovery app; dev)"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except Exception:
        return []
    out, seen = [], set()
    for item in data:
        a = item.get("address", {})
        name = a.get("city") or a.get("town") or a.get("village") or a.get("municipality") or a.get("state")
        cc = (a.get("country_code") or "").upper()
        if not name or not cc or (name, cc) in seen:
            continue
        seen.add((name, cc))
        try:
            out.append(CityIn(name=name, country=cc, lat=float(item["lat"]), lng=float(item["lon"])))
        except (KeyError, TypeError, ValueError):
            continue
    return out


@router.post("/upsert", response_model=CityOut)
def upsert_city(
    body: CityIn,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get-or-create ANY real city (from GPS or global search) so it can be a home
    city even when we have no shows there yet."""
    name = body.name.strip()
    cc = (body.country or "").upper()[:2] or "XX"
    city = db.query(City).filter(City.name == name, City.country == cc).first()
    if not city:
        city = City(name=name, country=cc, lat=body.lat, lng=body.lng)
        db.add(city)
        db.commit()
        db.refresh(city)
    elif body.lat is not None and city.lat is None:
        city.lat, city.lng = body.lat, body.lng
        db.commit()
        db.refresh(city)
    return city


@router.get("", response_model=list[CityOut])
def list_cities(
    q: str | None = Query(None, description="Filter by city name (starts-with)"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(City)
    if q:
        query = query.filter(City.name.ilike(f"{q}%"))
    return query.order_by(City.name.asc()).limit(limit).all()


def _haversine(a_lat, a_lng, b_lat, b_lng) -> float:
    dlat, dlng = radians(b_lat - a_lat), radians(b_lng - a_lng)
    h = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlng / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))  # km


@router.get("/nearest", response_model=CityOut)
def nearest_city(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db),
):
    """The closest city-with-shows to the given coordinates (for GPS auto-detect)."""
    cities = db.query(City).filter(City.lat.isnot(None), City.lng.isnot(None)).all()
    if not cities:
        raise HTTPException(status_code=404, detail="No cities with coordinates")
    return min(cities, key=lambda c: _haversine(lat, lng, c.lat, c.lng))
