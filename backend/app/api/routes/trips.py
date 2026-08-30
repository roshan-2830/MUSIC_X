"""The trip planner, and the trips somebody keeps.

Planning is a READ — it writes nothing and can be run as many times as you like with different
dates and appetites until an itinerary looks right. Saving is the separate, deliberate act.

The stops of a saved trip are rows pointing at real events, not a snapshot, so a cancelled or
moved show inside a saved trip is the same event the alert engine already watches. A JSON blob
would have put those shows out of its reach, which for this app would be the wrong kind of
clever.
"""
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.city import City
from app.models.event import Event
from app.models.saved_trip import SavedTrip
from app.models.trip_stop import TripStop
from app.models.venue import Venue
from app.services import trip as planner

router = APIRouter(prefix="/trips", tags=["trips"])

# Planning further out than this is guesswork: line-ups change and half the catalogue is not
# announced yet.
MAX_WINDOW_DAYS = 120


class Stop(BaseModel):
    event_id: uuid.UUID
    title: str
    starts_at: str | None
    timezone: str | None
    image_url: str | None
    venue_name: str | None
    city: str
    country: str | None
    mxs: float | None
    travel_hours: float
    # No journey to make: either the show is in your own city, or it is in the same place as
    # the stop before it. The screen says "no travel" rather than "~0.0h", which reads like a
    # rounding error and made the first stop of a home-town trip look broken.
    same_place: bool


class TripOut(BaseModel):
    origin_city_id: uuid.UUID
    origin: str
    origin_country: str | None
    mode: str
    starts_on: str
    ends_on: str
    budget_hours: int
    used_hours: float
    cities: int
    stops: list[Stop]


class SavedTripOut(BaseModel):
    id: uuid.UUID
    origin: str | None
    state: str
    total_travel_hours: int | None
    created_at: str
    stops: list[Stop]


def _to_stops(db: Session, rows: list) -> list[Stop]:
    out: list[Stop] = []
    for i, s in enumerate(rows):
        ev, city, h = s["event"], s["city"], s["travel_hours"]
        venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
        out.append(Stop(
            event_id=ev.id, title=ev.title or "Show",
            starts_at=ev.starts_at.isoformat() if ev.starts_at else None,
            timezone=ev.timezone, image_url=ev.image_url,
            venue_name=venue.name if venue else None,
            city=city.name, country=city.country,
            mxs=float(ev.mxs) if ev.mxs is not None else None,
            travel_hours=h, same_place=(h == 0),
        ))
    return out


@router.get("/plan", response_model=TripOut)
def plan_trip(origin_city_id: uuid.UUID,
              start: date, end: date,
              mode: str = Query("fly", pattern="^(local|regional|fly)$"),
              user_id: str = Depends(get_current_user_id),
              db: Session = Depends(get_db)):
    """Build an itinerary. Writes nothing."""
    origin = db.get(City, origin_city_id)
    if origin is None:
        raise HTTPException(status_code=404, detail="Unknown city")
    if origin.lat is None or origin.lng is None:
        # Better to say so than to silently produce a trip with no travel times in it.
        raise HTTPException(status_code=409,
                            detail=f"We don’t have coordinates for {origin.name} yet.")
    if end < start:
        raise HTTPException(status_code=422, detail="End date is before the start date")
    if (end - start).days > MAX_WINDOW_DAYS:
        raise HTTPException(status_code=422,
                            detail=f"Pick a window of {MAX_WINDOW_DAYS} days or less")

    r = planner.plan(db, origin, start, end, mode)
    return TripOut(
        origin_city_id=origin.id, origin=origin.name, origin_country=origin.country,
        mode=mode, starts_on=start.isoformat(), ends_on=end.isoformat(),
        budget_hours=r["budget_hours"], used_hours=r["used_hours"], cities=r["cities"],
        stops=_to_stops(db, r["stops"]),
    )


class SaveIn(BaseModel):
    origin_city_id: uuid.UUID
    mode: str = "fly"
    event_ids: list[uuid.UUID]
    travel_hours: list[float] = []


@router.post("", response_model=SavedTripOut, status_code=201)
def save_trip(body: SaveIn, user_id: str = Depends(get_current_user_id),
              db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    if not body.event_ids:
        raise HTTPException(status_code=422, detail="A trip needs at least one show")

    # The same set of shows is the same trip, whatever order it arrived in. Saving twice
    # returns what is already there rather than making a duplicate somebody has to tidy up.
    wanted = set(body.event_ids)
    for t in db.query(SavedTrip).filter(SavedTrip.user_id == uid,
                                        SavedTrip.state != "archived").all():
        have = {s.event_id for s in db.query(TripStop).filter(TripStop.trip_id == t.id).all()}
        if have == wanted:
            return _saved_out(db, t)

    cap = planner.MODES.get(body.mode, planner.MODES["fly"])
    trip = SavedTrip(user_id=uid, origin_city_id=body.origin_city_id,
                     travel_cap_hours=cap,
                     total_travel_hours=int(round(sum(body.travel_hours or []))),
                     state="saved")
    db.add(trip)
    db.flush()
    for i, eid in enumerate(body.event_ids):
        h = body.travel_hours[i] if i < len(body.travel_hours) else None
        db.add(TripStop(trip_id=trip.id, event_id=eid, sort_order=i,
                        travel_hours_from_origin=int(round(h)) if h is not None else None))
    db.commit()
    return _saved_out(db, trip)


def _saved_out(db: Session, t: SavedTrip) -> SavedTripOut:
    rows = (db.query(TripStop, Event, City)
              .join(Event, Event.id == TripStop.event_id)
              .outerjoin(Venue, Venue.id == Event.venue_id)
              .outerjoin(City, City.id == Venue.city_id)
              .filter(TripStop.trip_id == t.id)
              .order_by(TripStop.sort_order).all())
    stops = [{"event": ev,
              "city": city or City(name="—", country=None),
              "travel_hours": float(st.travel_hours_from_origin or 0)}
             for st, ev, city in rows]
    origin = db.get(City, t.origin_city_id) if t.origin_city_id else None
    return SavedTripOut(
        id=t.id, origin=origin.name if origin else None, state=t.state,
        total_travel_hours=t.total_travel_hours,
        created_at=t.created_at.isoformat(),
        stops=_to_stops(db, stops),
    )


@router.get("", response_model=list[SavedTripOut])
def my_trips(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    trips = (db.query(SavedTrip)
               .filter(SavedTrip.user_id == uid, SavedTrip.state != "archived")
               .order_by(SavedTrip.created_at.desc()).all())
    return [_saved_out(db, t) for t in trips]


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: uuid.UUID, user_id: str = Depends(get_current_user_id),
                db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    t = db.get(SavedTrip, trip_id)
    if t is None or t.user_id != uid:
        raise HTTPException(status_code=404, detail="Trip not found")
    db.query(TripStop).filter(TripStop.trip_id == t.id).delete(synchronize_session=False)
    db.delete(t)
    db.commit()
