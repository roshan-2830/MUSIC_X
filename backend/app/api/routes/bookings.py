"""My shows, and My bookings — the two rows in the Me tab that used to go nowhere.

MY SHOWS is every concert this person saved, filed by the state their plan is actually in.
The state is DERIVED here, not read off `calendar_entries.state`. That column is a cache that
only gets written when somebody opens the show's own page, so a show saved in June and never
re-opened would still file itself under Interested in September even with a hotel booked
against it. `plan.derive` is the truth; this asks it, in bulk, for the whole list at once.

MY BOOKINGS is the trip ledger: ticket, stay and travel for one show, side by side, with what
it all cost. A trip appears here as soon as any ONE of the three exists — you have a ticket, or
you have somewhere to sleep, or you have a way of getting there. Requiring all three would keep
the screen empty for exactly the people who most need somewhere to put a half-booked trip.

THREE THINGS THIS SCREEN REFUSES TO DO:

  It does not convert currencies. Spend is returned per currency and printed "£220 + €118".
  We hold no rate we would defend, and a wrong total is worse than two right ones.

  It does not price a ticket from the listing. `price_from` is the cheapest tier advertised
  when we ingested the show; summing it would produce a total nobody was charged. Only what
  the person typed in counts.

  It does not call a stay a booking. A hotel chosen in our search has `source='picked'` and
  nothing has been paid — Tripsure's booking flow would need us to take a card, which is a
  decision nobody has made. Only a stay somebody recorded themselves says 'recorded'.
"""
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import nulls_last
from sqlalchemy.orm import Session

from app.api.routes.events import _to_list_items, with_related
from app.api.routes.festivals import _to_out as _festival_out
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.calendar_entry import CalendarEntry
from app.models.city import City
from app.models.event import Event
from app.models.event_invite import EventInvite
from app.models.festival import Festival
from app.models.hotel_booking import HotelBooking
from app.models.travel_leg import TravelLeg
from app.schemas.booking import (Bookings, Money, MyShow, MyShows, StayIn, StayLine,
                                 TicketCostIn, TicketLine, TravelIn, TravelLine, Trip)
from app.services import plan as planner

router = APIRouter(tags=["bookings"])

MODES = ("plane", "train", "bus", "car")
# How close a free-cancellation deadline has to be before the ledger shouts about it. A week is
# long enough to actually do something — move the dates, cancel, rebook — and short enough that
# the banner is not permanently on screen and therefore ignored.
CANCEL_SOON_DAYS = 7
NAME_MAX = 120
REF_MAX = 80
# One person cannot plausibly have more legs than this for one show, and the cap is what stops a
# scripted client from turning a ledger card into an unbounded list.
LEGS_MAX = 12


def _cur(c: str | None) -> str:
    """A currency code, or the empty string. Never a guess.

    Three letters upper-cased if that is what arrived; anything else is dropped rather than
    normalised into something plausible, because a wrong currency on a number is worse than no
    currency on it — the number still shows, unlabelled, and nobody is misled about which.
    """
    c = (c or "").strip().upper()
    return c if len(c) == 3 and c.isalpha() else ""


def _sum(pairs) -> list[Money]:
    """Totals per currency, biggest first. Amounts with no currency are ignored entirely —
    they cannot be added to anything without deciding what they are."""
    tot: dict[str, float] = defaultdict(float)
    for amount, currency in pairs:
        cur = _cur(currency)
        if amount is None or not cur:
            continue
        tot[cur] += float(amount)
    return [Money(amount=round(v, 2), currency=k)
            for k, v in sorted(tot.items(), key=lambda kv: -kv[1])]


# ------------------------------------------------------------------------ My shows

@router.get("/me/shows", response_model=MyShows)
def my_shows(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Everything saved, by status, soonest first.

    Four queries regardless of how many shows are saved: the entries, the events, the hotels,
    the invites. The per-show version of this is what the plan card does, and doing that once
    per row would be one round trip each — the same N+1 that took the scoring job from 18
    seconds to 23 minutes.
    """
    uid = uuid.UUID(user_id)

    entries = (db.query(CalendarEntry)
                 .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id.isnot(None))
                 .all())
    by_event = {e.event_id: e for e in entries}

    shows: list[MyShow] = []
    if by_event:
        events = (with_related(db.query(Event))
                  .filter(Event.id.in_(by_event.keys()))
                  .order_by(nulls_last(Event.starts_at.asc()))
                  .all())
        # The two facts `derive` needs beyond the entry itself, both in one query rather than
        # one per show.
        with_base = {r[0] for r in db.query(HotelBooking.event_id)
                     .filter(HotelBooking.user_id == uid,
                             HotelBooking.event_id.in_(by_event.keys())).all()}
        invited = {r[0] for r in db.query(EventInvite.event_id)
                   .filter(EventInvite.from_user_id == uid,
                           EventInvite.event_id.in_(by_event.keys())).all()}

        items = {i.id: i for i in _to_list_items(db, events)}
        for ev in events:
            entry = by_event[ev.id]
            state = planner.derive(entry,
                                   past=planner.is_past(ev.starts_at),
                                   has_base=ev.id in with_base,
                                   has_invited=ev.id in invited)
            # "I wasn't there" is an answer, not a stage, so it is reported as itself — the
            # screen files it under Attended with a "Missed" tag rather than silently dropping
            # a show the person explicitly told us about.
            if entry.state == planner.MISSED:
                state = planner.MISSED
            shows.append(MyShow(**items[ev.id].model_dump(),
                                state=state,
                                booked=bool(entry.booked),
                                has_note=bool((entry.note or "").strip()),
                                is_suggestion=bool(entry.is_suggestion)))

    fests = (db.query(Festival)
               .join(CalendarEntry, CalendarEntry.festival_id == Festival.id)
               .filter(CalendarEntry.user_id == uid, CalendarEntry.is_suggestion.is_(False))
               .order_by(nulls_last(Festival.starts_on.asc()))
               .all())
    city_ids = {f.city_id for f in fests if f.city_id}
    cities = ({c.id: c for c in db.query(City).filter(City.id.in_(city_ids)).all()}
              if city_ids else {})

    counts = {k: 0 for k in (*planner.STATES, planner.MISSED)}
    for s in shows:
        counts[s.state] = counts.get(s.state, 0) + 1
    counts["festivals"] = len(fests)

    return MyShows(
        shows=shows,
        festivals=[_festival_out(f, cities.get(f.city_id) if f.city_id else None)
                   for f in fests],
        counts=counts,
    )


# --------------------------------------------------------------------- My bookings

def _soon(d: date | None, today: date) -> bool:
    """Is this free-cancellation deadline inside the warning window — and not already past?

    Both halves matter. A window that shut last week is not urgent, it is over, and a banner
    that stays lit for it is one somebody learns to ignore.
    """
    return bool(d) and today <= d <= today + timedelta(days=CANCEL_SOON_DAYS)


def _stay_line(row: HotelBooking, today: date | None = None) -> StayLine:
    today = today or date.today()
    return StayLine(
        name=row.name or "Your stay",
        check_in=row.check_in, check_out=row.check_out,
        cost=float(row.cost) if row.cost is not None else None,
        currency=_cur(row.currency) or None,
        booking_ref=row.booking_ref,
        free_cancel_until=row.free_cancel_until,
        cancel_soon=_soon(row.free_cancel_until, today),
        address=row.address,
        source=row.source or "picked",
    )


def _travel_line(row: TravelLeg, today: date | None = None) -> TravelLine:
    today = today or date.today()
    return TravelLine(
        id=row.id, mode=row.mode,
        from_label=row.from_label, to_label=row.to_label,
        travel_on=row.travel_on,
        cost=float(row.cost) if row.cost is not None else None,
        currency=_cur(row.currency) or None,
        booking_ref=row.booking_ref,
        free_cancel_until=row.free_cancel_until,
        cancel_soon=_soon(row.free_cancel_until, today),
    )


def _days_until(starts_at) -> int | None:
    """Whole days from now to the show, in UTC. None when the date is unknown — a show with no
    date is not "0 days away", and rendering it as TONIGHT would be a lie the card shouts."""
    if starts_at is None:
        return None
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    delta = starts_at - datetime.now(timezone.utc)
    # Ceiling, so a show 20 hours away reads "in 1 day" rather than "today".
    return -((-delta.days * 86400 - delta.seconds) // 86400)


@router.get("/me/bookings", response_model=Bookings)
def my_bookings(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """The trip ledger. Five queries, whatever the size of the list."""
    uid = uuid.UUID(user_id)

    entries = {e.event_id: e for e in
               db.query(CalendarEntry)
                 .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id.isnot(None))
                 .all()}
    stays = {h.event_id: h for h in
             db.query(HotelBooking).filter(HotelBooking.user_id == uid).all()}
    legs: dict = defaultdict(list)
    for leg in (db.query(TravelLeg).filter(TravelLeg.user_id == uid)
                  .order_by(TravelLeg.sort_order.asc(), TravelLeg.created_at.asc()).all()):
        legs[leg.event_id].append(leg)

    # A trip exists when ANY of the three does. Somebody who has booked only a flight has a
    # trip in progress and needs somewhere to see it.
    ids = ({eid for eid, e in entries.items() if e.booked}
           | set(stays.keys()) | set(legs.keys()))
    if not ids:
        return Bookings(upcoming=[], past=[], spend=[], trips=0, cancel_windows=0)

    events = (with_related(db.query(Event)).filter(Event.id.in_(ids))
              .order_by(nulls_last(Event.starts_at.asc())).all())
    items = {i.id: i for i in _to_list_items(db, events)}

    today = date.today()
    upcoming: list[Trip] = []
    past: list[Trip] = []
    all_money: list = []
    windows = 0

    for ev in events:
        entry = entries.get(ev.id)
        stay = stays.get(ev.id)
        travel = legs.get(ev.id, [])

        ticket = TicketLine(
            booked=bool(entry and entry.booked),
            provider=entry.ticket_provider if entry else None,
            reference=entry.ticket_ref if entry else None,
            source=entry.ticket_source if entry else None,
            at=entry.booked_at.isoformat() if entry and entry.booked_at else None,
            cost=float(entry.ticket_cost) if entry and entry.ticket_cost is not None else None,
            currency=(_cur(entry.ticket_currency) or None) if entry else None,
        )
        money = [(ticket.cost, ticket.currency)]
        if stay:
            money.append((stay.cost, stay.currency))
        money += [(l.cost, l.currency) for l in travel]
        all_money += money

        stay_line = _stay_line(stay, today) if stay else None
        travel_lines = [_travel_line(l, today) for l in travel]
        closing = ([1] if stay_line and stay_line.cancel_soon else []) \
            + [1 for l in travel_lines if l.cancel_soon]
        # Counted per TRIP for the summary tile — "2 cancel windows" should mean two trips
        # need attention, not two rows on the same card.
        if closing:
            windows += 1

        trip = Trip(
            event=items[ev.id],
            ticket=ticket,
            stay=stay_line,
            travel=travel_lines,
            stages_done=sum([ticket.booked, stay is not None, bool(travel)]),
            spend=_sum(money),
            days_until=_days_until(ev.starts_at),
            cancel_soon=len(closing),
        )
        # A show is "past" only once it has actually finished — six hours after the door time,
        # the same window the plan card uses. Otherwise a trip drops out of Coming up while
        # the person is standing in the crowd.
        (past if planner.has_ended(ev.starts_at) else upcoming).append(trip)

    past.reverse()      # most recent first; upcoming stays soonest-first
    return Bookings(upcoming=upcoming, past=past, spend=_sum(all_money),
                    trips=len(upcoming) + len(past), cancel_windows=windows)


# ------------------------------------------------------------------------ writes

def _event_or_404(db: Session, event_id: UUID) -> Event:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    return ev


def _clean(s: str | None, limit: int) -> str | None:
    s = (s or "").strip()
    return s[:limit] or None


@router.put("/events/{event_id}/stay/record", response_model=StayLine)
def record_stay(event_id: UUID, body: StayIn,
                user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """"Here is the hotel I booked myself."

    A second way into the same row that the hotel search writes, and the only one that works
    at all when no travel provider is connected. PUT, because there is one stay per person per
    show — sending it twice must leave one, not two.

    It overwrites a 'picked' row on purpose: recording a real booking is strictly better
    information than pointing at a search result, so the newer, stronger claim wins.
    """
    ev = _event_or_404(db, event_id)
    name = _clean(body.name, NAME_MAX)
    if not name:
        raise HTTPException(422, "A hotel needs a name.")
    if body.check_in and body.check_out and body.check_out < body.check_in:
        raise HTTPException(422, "Check-out cannot be before check-in.")

    uid = uuid.UUID(user_id)
    row = (db.query(HotelBooking)
             .filter(HotelBooking.user_id == uid, HotelBooking.event_id == ev.id)
             .one_or_none())
    if row is None:
        row = HotelBooking(user_id=uid, event_id=ev.id, name=name)
        db.add(row)

    row.name = name
    row.check_in = body.check_in
    row.check_out = body.check_out
    row.cost = body.cost
    row.currency = _cur(body.currency) or None
    row.booking_ref = _clean(body.booking_ref, REF_MAX)
    row.free_cancel_until = body.free_cancel_until
    # Not 'booked': no money moved through Music X. It says the person told us they booked it,
    # which is a different and weaker claim than a reservation we hold.
    row.source = "recorded"
    db.commit()
    db.refresh(row)
    return _stay_line(row)


@router.post("/events/{event_id}/travel", response_model=TravelLine, status_code=201)
def add_leg(event_id: UUID, body: TravelIn,
            user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """A flight, train, bus or drive. POST, not PUT: a return trip is two legs, and most
    festivals are three or four."""
    ev = _event_or_404(db, event_id)
    if body.mode not in MODES:
        raise HTTPException(422, f"mode must be one of {', '.join(MODES)}")
    frm, to = _clean(body.from_label, NAME_MAX), _clean(body.to_label, NAME_MAX)
    if not frm or not to:
        raise HTTPException(422, "A leg needs where you're going from and to.")

    uid = uuid.UUID(user_id)
    existing = (db.query(TravelLeg)
                  .filter(TravelLeg.user_id == uid, TravelLeg.event_id == ev.id).count())
    if existing >= LEGS_MAX:
        raise HTTPException(409, f"That's already {LEGS_MAX} legs for one show.")

    row = TravelLeg(
        user_id=uid, event_id=ev.id, mode=body.mode,
        from_label=frm, to_label=to, travel_on=body.travel_on,
        cost=body.cost, currency=_cur(body.currency) or None,
        booking_ref=_clean(body.booking_ref, REF_MAX),
        free_cancel_until=body.free_cancel_until,
        sort_order=existing,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _travel_line(row)


@router.delete("/events/{event_id}/travel/{leg_id}", status_code=204)
def remove_leg(event_id: UUID, leg_id: UUID,
               user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Filtered on the user as well as the id, so one person's id cannot delete another's leg."""
    (db.query(TravelLeg)
       .filter(TravelLeg.id == leg_id, TravelLeg.user_id == uuid.UUID(user_id),
               TravelLeg.event_id == event_id)
       .delete())
    db.commit()
    return None


@router.put("/events/{event_id}/ticket-cost", response_model=TicketLine)
def set_ticket_cost(event_id: UUID, body: TicketCostIn,
                    user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """What the ticket actually cost. Null clears it.

    Only on a show already marked as booked — a price against a ticket nobody has is a number
    with nothing behind it, and it would then be summed into a trip total as if it were spent.
    """
    uid = uuid.UUID(user_id)
    entry = (db.query(CalendarEntry)
               .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id == event_id)
               .one_or_none())
    if entry is None or not entry.booked:
        raise HTTPException(409, "Add your ticket first, then what it cost.")
    entry.ticket_cost = body.cost
    entry.ticket_currency = _cur(body.currency) or None
    db.commit()
    db.refresh(entry)
    return TicketLine(
        booked=True, provider=entry.ticket_provider, reference=entry.ticket_ref,
        source=entry.ticket_source,
        at=entry.booked_at.isoformat() if entry.booked_at else None,
        cost=float(entry.ticket_cost) if entry.ticket_cost is not None else None,
        currency=entry.ticket_currency,
    )
