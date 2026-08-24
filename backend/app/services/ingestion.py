import time
import uuid
from datetime import datetime, date, timezone

from sqlalchemy import func, nulls_last
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.city import City
from app.models.venue import Venue
from app.models.artist import Artist
from app.services import artist_lookup
from app.models.genre import Genre
from app.models.event import Event
from app.models.event_artist import EventArtist
from app.models.event_genre import EventGenre
from app.models.event_offer import EventOffer
from app.models.event_source import EventSource
from app.models.event_change import EventChange
from app.models.festival import Festival
from app.models.festival_lineup import FestivalLineup
from app.models.festival_source import FestivalSource
from app.services.provenance import sync_facts
from app.services.trust import confidence_for
from app.services.ticketmaster import (artist_attraction, fetch_artist_events, fetch_event_by_id,
                                       fetch_music_events, search_festivals, search_music_events)


# Listings that SAY they are not a ticket to anything. Ticketmaster sells add-ons through
# the same events endpoint as concerts, so parking permits and room upgrades arrive looking
# like shows: 'Diljit Dosanjh | Vinyl Room Upgrade (TICKET NOT INCLUDED)', 'Parking permit
# Weezer'. They also mint junk artists — 'Vinyl Room Access', 'Parkeerkaarten Arenapoort'.
#
# Only self-declaring phrases are listed here, and that restraint is the point. Measured
# 2026-08-24: of 17 upcoming listings containing "hotel", EIGHT were real concerts at venues
# named after hotels (Derek Ryan at Castlecourt Hotel, Foster & Allen at Celtic Ross Hotel),
# so "hotel" as a keyword would have deleted real shows. 'VIP Package' and 'Ticket + Hotel
# Bundle' are deliberately NOT here either: those DO include a ticket, so they are real
# things a person can attend, merely redundant packagings of one show.
#
# The test is not "does this look like an add-on" but "does the seller state that no ticket
# is included". That is a fact the listing asserts about itself, not a guess we make.
NOT_A_TICKET = (
    "ticket not included",
    "no ticket included",
    "does not include event ticket",
    "does not include ticket",
    "parking permit",
)


def is_not_attendable(title: str) -> bool:
    """True when the listing itself says it is not a ticket to an event.

    Such a listing cannot be attended, so it does not belong in a catalogue of shows —
    and Ticketmaster pulls their pages while its own API still reports them `onsale`,
    which is how one reached a user as a Get-tickets button leading to a 404.
    """
    low = (title or "").lower()
    return any(m in low for m in NOT_A_TICKET)


def _get_or_create(db, model, defaults=None, **filters):
    obj = db.query(model).filter_by(**filters).first()
    if obj:
        return obj
    obj = model(**{**filters, **(defaults or {})})
    db.add(obj)
    db.flush()
    return obj


def _parse_start(dates):
    start = dates.get("start", {})
    if start.get("dateTime"):
        try:
            return datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
        except ValueError:
            pass
    if start.get("localDate"):
        try:
            return datetime.fromisoformat(start["localDate"] + "T00:00:00+00:00")
        except ValueError:
            pass
    return None


def _map_status(dates):
    code = (dates.get("status") or {}).get("code")
    if code == "cancelled":
        return "cancelled"
    if code in ("postponed", "rescheduled"):
        return "postponed"
    return "scheduled"


def _price_from(pr: dict):
    """The cheapest published ticket price — or None.

    Ticketmaster sends `min: 0.0, max: 0.0` to mean "no price published" (usually an
    off-sale or invite-only show). Storing that as 0.00 would tell the user the show
    is FREE, which is a fabrication. No published price means no price."""
    if not pr:
        return None
    lo, hi = _num(pr.get("min")), _num(pr.get("max"))
    if lo is None:
        return None
    if lo == 0 and (hi is None or hi == 0):
        return None
    return lo


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

def _pick_image(images):
    """Pick the best artwork URL from a Ticketmaster images array (prefer wide 16:9)."""
    best = None
    for im in images or []:
        url = im.get("url")
        if not url:
            continue
        score = (im.get("width") or 0) + (1000 if im.get("ratio") == "16_9" else 0)
        if best is None or score > best[0]:
            best = (score, url)
    return best[1] if best else None


# ---------------------------------------------------------------------------
# Change detection
#
# Re-checking an event is only worth doing if we notice when the answer moves.
# Before we overwrite a row with fresher data we compare the two, and write one
# EventChange row per REAL difference. Those rows are the receipts a cancellation
# alert is later built from — without them, a show can be cancelled overnight and
# nobody ever knows it happened.
#
# Rules we hold to here:
#   • a brand-new event records nothing (there is no "before" to compare against)
#   • a value going missing is not a change, it is missing data — we stay quiet
#   • we only record a status move we can name; anything else is left alone
# ---------------------------------------------------------------------------

# (old status, new status) -> what we would call that in plain English
_STATUS_KIND = {
    ("scheduled", "cancelled"): "cancelled",
    ("scheduled", "postponed"): "postponed",
    ("postponed", "cancelled"): "cancelled",
    ("postponed", "scheduled"): "reinstated",
    ("cancelled", "scheduled"): "reinstated",
    # cancelled -> postponed is NOT good news: still not happening on that date, and
    # no new one published. Calling it "back on" would be the friendliest lie we tell.
    ("cancelled", "postponed"): "postponed",
}


def _utc(dt):
    """Compare two datetimes on equal terms. The DB hands back tz-aware values; a
    naive one is read as UTC rather than guessed at."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _money(x):
    try:
        return None if x is None else round(float(x), 2)
    except (TypeError, ValueError):
        return None


def track_changes(db, ev, *, status, starts_at, price_amount, source="ticketmaster") -> list:
    """Compare what the source just told us against what we already hold, and stage
    one EventChange row per difference. MUST be called BEFORE the new values are
    written onto `ev`. Returns the rows staged (empty list = nothing moved)."""
    rows = []

    def add(field, kind, old, new):
        rows.append(EventChange(
            event_id=ev.id, field=field, kind=kind, source=source,
            old_value=None if old is None else str(old),
            new_value=None if new is None else str(new),
        ))

    old_status, new_status = (ev.status or "scheduled"), (status or "scheduled")
    if new_status != old_status:
        kind = _STATUS_KIND.get((old_status, new_status))
        if kind:
            add("status", kind, old_status, new_status)

    old_when, new_when = _utc(ev.starts_at), _utc(starts_at)
    if old_when and new_when and old_when != new_when:
        add("starts_at", "date_moved", old_when.isoformat(), new_when.isoformat())

    old_price, new_price = _money(ev.price_from_amount), _money(price_amount)
    if old_price is not None and new_price is not None and old_price != new_price:
        add("price_from_amount",
            "price_drop" if new_price < old_price else "price_rise",
            old_price, new_price)

    for r in rows:
        db.add(r)
    return rows


def upsert_event(db: Session, e: dict, full: bool = True):
    """Map ONE raw Ticketmaster event into our DB (create or update its rows).

    full=True  (nightly import): write everything — lineup, genres, offers.
    full=False (live search): write only the event core + city + venue +
               headliner + price. That's all a search result needs to display,
               open, and be scored — and it keeps search fast (far fewer writes
               to the remote DB). The rest is filled in later by the full import.

    Returns (event, created):
      - event   = the Event row, or None if the raw payload was unusable (skipped)
      - created = True if a brand-new Event was inserted, False if one was updated
    """
    tm_id, name = e.get("id"), e.get("name")
    if not tm_id or not name:
        return None, False
    # Same rule as the batch path: a listing that says it is not a ticket is not a show.
    if is_not_attendable(name):
        return None, False

    emb = e.get("_embedded", {})
    dates = e.get("dates", {})

    venue = None
    vlist = emb.get("venues") or []
    if vlist:
        v = vlist[0]
        loc = v.get("location") or {}
        city_obj = None
        cname = (v.get("city") or {}).get("name")
        ccode = (v.get("country") or {}).get("countryCode")
        if cname and ccode:
            city_obj = _get_or_create(
                db, City, name=cname, country=ccode[:2],
                defaults={"timezone": v.get("timezone"),
                          "lat": _num(loc.get("latitude")),
                          "lng": _num(loc.get("longitude"))},
            )
        if v.get("name"):
            venue = _get_or_create(
                db, Venue, name=v["name"],
                city_id=(city_obj.id if city_obj else None),
                defaults={"lat": _num(loc.get("latitude")),
                          "lng": _num(loc.get("longitude"))},
            )

    attractions = emb.get("attractions") or []
    headliner = None
    if attractions and attractions[0].get("name"):
        headliner = artist_lookup.get_or_create(db, attractions[0]["name"])

    pr = (e.get("priceRanges") or [{}])[0]

    src = db.query(EventSource).filter_by(
        source="ticketmaster", source_event_id=tm_id).first()
    if src:
        event = db.get(Event, src.event_id)
        created = False
    else:
        event = Event()
        db.add(event)
        created = True

    # Before we paint over the old values, note anything that actually moved.
    if not created and event is not None:
        track_changes(db, event, status=_map_status(dates),
                      starts_at=_parse_start(dates), price_amount=_price_from(pr))

    event.title = name
    event.starts_at = _parse_start(dates)
    event.timezone = dates.get("timezone")
    event.status = _map_status(dates)
    event.headliner_artist_id = headliner.id if headliner else None
    event.venue_id = venue.id if venue else None
    event.price_from_amount = _price_from(pr)
    event.price_from_currency = pr.get("currency")
    event.last_verified = date.today()
    event.confidence = confidence_for(
        last_verified=event.last_verified,
        has_when=event.starts_at is not None,
        has_where=event.venue_id is not None,
    )
    event.image_url = _pick_image(e.get("images"))
    event.description = e.get("description") or e.get("info")
    db.flush()

    if not src:
        db.add(EventSource(event_id=event.id, source="ticketmaster",
                           source_event_id=tm_id, source_url=e.get("url")))

    # Live-search mode: stop here. The event, its venue/city, headliner and price
    # are enough to show a result and score it; skip the extra round-trips.
    if not full:
        return event, created

    # Provenance: save the receipts for everything this payload actually publishes.
    sync_facts(db, [(event.id, e, e.get("url"))])

    if e.get("url") and not db.query(EventOffer).filter_by(
            event_id=event.id, seller_name="Ticketmaster").first():
        db.add(EventOffer(event_id=event.id, seller_name="Ticketmaster",
                          url=e.get("url"), is_official=True))

    # line-up — dedupe within this event (in-memory + existing rows)
    seen_artists = {ea.artist_id for ea in
                    db.query(EventArtist).filter_by(event_id=event.id).all()}
    for i, att in enumerate(attractions):
        if not att.get("name"):
            continue
        # Shared find-or-create. This was _get_or_create(db, Artist, name=...), a
        # filter_by on the exact string — the strictest match in the codebase, sitting in
        # the path that writes line-ups. 'Weezer' and 'weezer' would have become two acts.
        artist = artist_lookup.get_or_create(db, att["name"])
        if artist.id in seen_artists:
            continue
        seen_artists.add(artist.id)
        db.add(EventArtist(event_id=event.id, artist_id=artist.id,
                           is_headliner=(i == 0), sort_order=i))

    # genres — dedupe within this event (Ticketmaster repeats the same genre)
    seen_genres = {eg.genre_id for eg in
                   db.query(EventGenre).filter_by(event_id=event.id).all()}
    for c in e.get("classifications") or []:
        gname = (c.get("genre") or {}).get("name")
        if not gname or gname.lower() in ("undefined", "other"):
            continue
        genre = _get_or_create(db, Genre, name=gname)
        if genre.id in seen_genres:
            continue
        seen_genres.add(genre.id)
        db.add(EventGenre(event_id=event.id, genre_id=genre.id))

    return event, created


def ingest_from_ticketmaster(size: int = 100):
    """Bulk import: fetch broad 'upcoming music' events and upsert them all."""
    events = fetch_music_events(size=size)
    db: Session = SessionLocal()
    created = updated = skipped = 0
    try:
        for e in events:
            event, was_created = upsert_event(db, e)
            if event is None:
                skipped += 1
            elif was_created:
                created += 1
            else:
                updated += 1
        db.commit()
    finally:
        db.close()
    return {"fetched": len(events), "created": created, "updated": updated, "skipped": skipped}


# Ticketmaster's free tier allows 5,000 requests a day and the deep re-verify spends
# one per event. With the sweeps taking ~550, this cap keeps a night's run comfortably
# inside the budget while the catalogue keeps growing. Events past the cap are not
# skipped forever — they move up the queue as their date approaches.
MAX_REVERIFY_PER_RUN = 2000


def reverify_all_events(delay_seconds: float = 0.15, limit: int | None = None) -> dict:
    """Deep refresh: re-fetch EVERY Ticketmaster event we have (by its TM id) and update
    it in place — status (cancelled/postponed), dates, price — for ALL shows in the
    catalogue, not just followed artists. `limit` caps how many (for a quick test).
    Network fetches run without holding a DB connection; one batched write at the end."""
    db: Session = SessionLocal()
    try:
        # UPCOMING only, soonest first. Two reasons this matters now that the broad
        # sweep reaches a year ahead instead of two days:
        #
        #   • Re-checking a show that already happened cannot tell us anything and
        #     cost 933 API calls a night.
        #   • Every check is one Ticketmaster request, and the free tier allows 5,000
        #     a day. Checking all 4,677 events plus the sweeps came to ~5,229 — over
        #     the limit, which would have started failing silently.
        #
        # Soonest-first is also the right priority: a show next week is the one someone
        # has tickets for, and a show next June gets re-checked many times as it nears.
        rows = (
            db.query(EventSource.source_event_id)
            .join(Event, Event.id == EventSource.event_id)
            .filter(EventSource.source == "ticketmaster",
                    EventSource.source_event_id.isnot(None),
                    (Event.starts_at >= datetime.now(timezone.utc)) | (Event.starts_at.is_(None)))
            .order_by(nulls_last(Event.starts_at.asc()))
            .all()
        )
        tm_ids = [r[0] for r in rows]
    finally:
        db.close()
    tm_ids = list(dict.fromkeys(tm_ids))  # de-dupe, keeps soonest-first order
    tm_ids = tm_ids[:(limit or MAX_REVERIFY_PER_RUN)]

    print(f"[refresh] re-verifying {len(tm_ids)} events by Ticketmaster id")
    raws: list = []
    gone = 0
    for i, tm_id in enumerate(tm_ids, 1):
        raw = fetch_event_by_id(tm_id)
        if raw:
            raws.append(raw)
        else:
            gone += 1
        if i % 200 == 0 or i == len(tm_ids):
            print(f"[refresh] fetched {i}/{len(tm_ids)}")
        time.sleep(delay_seconds)

    updated, lines = 0, []
    if raws:
        db = SessionLocal()
        try:
            # by-id fetches: the full payload, so a missing fact really is gone
            ids, changed = _batch_upsert_search(db, raws, authoritative=True)
            updated = len(ids)
            # Render the log lines HERE, while the session is still open. Reading
            # c.kind after db.close() raises DetachedInstanceError and takes the whole
            # job down with it — including the alerts pass that runs after this.
            lines = [f"{c.kind}: {c.field} {c.old_value} -> {c.new_value}" for c in changed]
        finally:
            db.close()
    summary = {"checked": len(tm_ids), "updated": updated, "gone": gone,
               "changes": len(lines)}
    print(f"[refresh] re-verify done — {summary}")
    for line in lines:
        print(f"[refresh] CHANGE {line}")
    return summary


def ingest_broad_light(size: int = 100) -> int:
    """Broad DISCOVERY sweep — FAST/light path. Fetches a wide batch of upcoming music
    events and upserts only their core (event + city + venue + headliner + source),
    reusing the same batched writer as live search. Much faster than the full import,
    so it's safe to run every few hours. Returns the number of events touched."""
    events = fetch_music_events(size=size)
    db: Session = SessionLocal()
    try:
        # search-endpoint payloads are abbreviated — add/update facts, never withdraw
        ids, changed = _batch_upsert_search(db, events)
        if changed:
            print(f"[sweep] {len(changed)} change(s) spotted while sweeping")
        return len(ids)
    finally:
        db.close()


def _batch_upsert_search(db: Session, events: list, authoritative: bool = False) -> tuple[list, list]:
    """Upsert many Ticketmaster events for the LIVE-SEARCH path with as few DB
    round-trips as possible (bulk-load each table once, instead of ~6 queries per
    event). Writes only event core + city + venue + headliner + source. Returns
    (event IDs in Ticketmaster's order, the EventChange rows this pass recorded)."""
    # --- 0. flatten each raw event into just the fields we need ---
    parsed = []
    for e in events:
        tm_id, name = e.get("id"), e.get("name")
        if not tm_id or not name:
            continue
        # An add-on that states it is not a ticket is not a show. Skipped here rather than
        # filtered at read time, so it never reaches a feed, never mints an artist row, and
        # cannot be resurrected by the nightly re-verify.
        if is_not_attendable(name):
            continue
        emb = e.get("_embedded", {})
        dates = e.get("dates", {})
        v = (emb.get("venues") or [{}])[0]
        loc = v.get("location") or {}
        ccode = (v.get("country") or {}).get("countryCode")
        atts = emb.get("attractions") or []
        pr = (e.get("priceRanges") or [{}])[0]
        parsed.append({
            "tm_id": tm_id, "name": name, "url": e.get("url"),
            "city_name": (v.get("city") or {}).get("name"),
            "country": ccode[:2] if ccode else None,
            "tz": v.get("timezone"),
            "lat": _num(loc.get("latitude")), "lng": _num(loc.get("longitude")),
            "venue_name": v.get("name"),
            "head_name": atts[0]["name"] if atts and atts[0].get("name") else None,
            # The FULL bill, in Ticketmaster's own order — headliner first. This was
            # discarded and only atts[0] was kept, which is why 3,653 of 3,692 upcoming
            # events had no line-up at all: only upsert_event wrote one, and the broad
            # sweep produced almost the entire catalogue. The payload always had this.
            "bill": [a["name"] for a in atts if a.get("name")],
            "starts_at": _parse_start(dates), "timezone": dates.get("timezone"),
            "status": _map_status(dates),
            "price_amt": _price_from(pr), "price_cur": pr.get("currency"),
            "image_url": _pick_image(e.get("images")),
            "description": e.get("description") or e.get("info"),
            "raw": e,
        })
    if not parsed:
        return []

    # --- 1. existing sources: one query (tm_id -> event_id) ---
    tm_ids = list({p["tm_id"] for p in parsed})
    existing_src = {
        s.source_event_id: s.event_id
        for s in db.query(EventSource).filter(
            EventSource.source == "ticketmaster",
            EventSource.source_event_id.in_(tm_ids),
        ).all()
    }

    # --- 2. cities: bulk-load existing, create the rest ---
    want_cities = {(p["city_name"], p["country"]) for p in parsed if p["city_name"] and p["country"]}
    city_map = {}
    if want_cities:
        for c in db.query(City).filter(City.name.in_([n for n, _ in want_cities])).all():
            city_map[(c.name, c.country)] = c
        for (nm, cc) in want_cities:
            if (nm, cc) not in city_map:
                row = next(p for p in parsed if p["city_name"] == nm and p["country"] == cc)
                c = City(name=nm, country=cc, timezone=row["tz"], lat=row["lat"], lng=row["lng"])
                db.add(c)
                city_map[(nm, cc)] = c
        db.flush()

    def city_id_for(p):
        c = city_map.get((p["city_name"], p["country"]))
        return c.id if c else None

    # --- 3. venues: keyed by (name, city_id) ---
    want_venues = {(p["venue_name"], city_id_for(p)): p for p in parsed if p["venue_name"]}
    venue_map = {}
    if want_venues:
        for v in db.query(Venue).filter(Venue.name.in_([n for n, _ in want_venues])).all():
            venue_map[(v.name, v.city_id)] = v
        for (vn, cid), p in want_venues.items():
            if (vn, cid) not in venue_map:
                v = Venue(name=vn, city_id=cid, lat=p["lat"], lng=p["lng"])
                db.add(v)
                venue_map[(vn, cid)] = v
        db.flush()

    # --- 4. headliner artists by name ---
    want_artists = {n for p in parsed for n in p["bill"]} | {
        p["head_name"] for p in parsed if p["head_name"]}
    # Shared find-or-create, matching on the normalised name. This used to filter on
    # Artist.name.in_(...) — case-SENSITIVE — which is where most of the duplicate artists
    # came from: Ticketmaster billing 'headliners' inconsistently, so 'Men at Work' and
    # 'Men At Work' arrived as two names and became two rows.
    artist_map = artist_lookup.get_or_create_many(db, want_artists) if want_artists else {}

    # --- 5. existing Event rows in one query ---
    existing_ids = [existing_src[p["tm_id"]] for p in parsed if p["tm_id"] in existing_src]
    existing_events = (
        {ev.id: ev for ev in db.query(Event).filter(Event.id.in_(existing_ids)).all()}
        if existing_ids else {}
    )

    # --- 6. write events (assign ids up front → no per-event flush) ---
    today = date.today()
    ids, new_sources, changes, fact_ids = [], [], [], {}
    for p in parsed:
        if p["tm_id"] in existing_src:
            ev = existing_events.get(existing_src[p["tm_id"]])
            if ev is None:
                continue
            # Before we paint over the old values, note anything that actually moved.
            changes += track_changes(db, ev, status=p["status"],
                                     starts_at=p["starts_at"], price_amount=p["price_amt"])
        else:
            ev = Event(id=uuid.uuid4())
            db.add(ev)
            new_sources.append((ev.id, p["tm_id"], p["url"]))
        venue = venue_map.get((p["venue_name"], city_id_for(p))) if p["venue_name"] else None
        head = artist_map.get(p["head_name"]) if p["head_name"] else None
        ev.title = p["name"]
        ev.starts_at = p["starts_at"]
        ev.timezone = p["timezone"]
        ev.status = p["status"]
        ev.headliner_artist_id = head.id if head else None
        ev.venue_id = venue.id if venue else None
        ev.price_from_amount = p["price_amt"]
        ev.price_from_currency = p["price_cur"]
        ev.last_verified = today
        ev.confidence = confidence_for(
            last_verified=today,
            has_when=ev.starts_at is not None,
            has_where=ev.venue_id is not None,
        )
        ev.image_url = p["image_url"]
        ev.description = p["description"]
        ids.append(ev.id)
        fact_ids[p["tm_id"]] = ev.id

    for eid, tmid, url in new_sources:
        db.add(EventSource(event_id=eid, source="ticketmaster", source_event_id=tmid, source_url=url))

    # --- 6b. line-ups. The bill was already in every payload and was being thrown away,
    # so the nightly deep re-verify re-fetched all 3,692 events and still left the
    # Line-up section empty on 99% of them. Writing it here costs no extra request:
    # reverify_all_events feeds this same function with authoritative by-id payloads.
    #
    # Only touched when the source actually listed a bill — an empty `attractions` means
    # Ticketmaster published no support acts, which is not the same as us not knowing, so
    # existing rows are left alone rather than deleted.
    billed = [p for p in parsed if p["bill"] and p["tm_id"] in fact_ids]
    if billed:
        held = {
            (ea.event_id, ea.artist_id)
            for ea in db.query(EventArtist).filter(
                EventArtist.event_id.in_([fact_ids[p["tm_id"]] for p in billed])).all()
        }
        for p in billed:
            eid = fact_ids[p["tm_id"]]
            for i, nm in enumerate(p["bill"]):
                a = artist_map.get(nm)
                if a is None or (eid, a.id) in held:
                    continue
                held.add((eid, a.id))
                db.add(EventArtist(event_id=eid, artist_id=a.id,
                                   is_headliner=(i == 0), sort_order=i))

    # Provenance: one bulk pass over everything we just touched. Facts the source
    # has stopped publishing are removed rather than left standing.
    facts = sync_facts(db, [(fact_ids[p["tm_id"]], p["raw"], p["url"])
                            for p in parsed if p["tm_id"] in fact_ids],
                       withdraw=authoritative)
    if any(facts[k] for k in ("added", "updated", "removed")):
        print(f"[facts] {facts}")

    db.commit()
    return ids, changes


def search_and_ingest(keyword: str, size: int = 20):
    """Live search: query Ticketmaster by keyword, upsert every match (batched),
    and return the affected event IDs (kept in Ticketmaster's relevance order)."""
    events = search_music_events(keyword, size=size)
    db: Session = SessionLocal()
    try:
        ids, _changes = _batch_upsert_search(db, events)
        return ids
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Festivals
# ---------------------------------------------------------------------------

def _parse_date(s):
    """Parse a Ticketmaster 'YYYY-MM-DD' local date into a date, or None."""
    try:
        return date.fromisoformat(s) if s else None
    except (ValueError, TypeError):
        return None


def upsert_festival(db: Session, e: dict):
    """Map ONE Ticketmaster festival event into our festivals tables (create/update).
    De-duped by Ticketmaster id first, then by name+city so per-day passes collapse
    into a single festival. Returns the festival id, or None if the event isn't a festival."""
    tm_id, name = e.get("id"), e.get("name")
    if not tm_id or not name or "festival" not in name.lower():
        return None

    emb = e.get("_embedded", {})
    dates = e.get("dates", {})

    # City (reuse the same extraction as events)
    city_obj = None
    vlist = emb.get("venues") or []
    if vlist:
        v = vlist[0]
        loc = v.get("location") or {}
        cname = (v.get("city") or {}).get("name")
        ccode = (v.get("country") or {}).get("countryCode")
        if cname and ccode:
            city_obj = _get_or_create(
                db, City, name=cname, country=ccode[:2],
                defaults={"timezone": v.get("timezone"),
                          "lat": _num(loc.get("latitude")), "lng": _num(loc.get("longitude"))},
            )

    starts_on = _parse_date(dates.get("start", {}).get("localDate"))
    ends_on = _parse_date(dates.get("end", {}).get("localDate"))
    days = (ends_on - starts_on).days + 1 if starts_on and ends_on else None
    pr = (e.get("priceRanges") or [{}])[0]
    attractions = emb.get("attractions") or []
    city_id = city_obj.id if city_obj else None

    # Find existing: by TM id (idempotent re-ingest), else by name+city (merge day passes).
    src = db.query(FestivalSource).filter_by(source="ticketmaster", source_festival_id=tm_id).first()
    if src:
        fest = db.get(Festival, src.festival_id)
    else:
        fest = (
            db.query(Festival)
            .filter(func.lower(Festival.name) == name.lower(), Festival.city_id == city_id)
            .first()
        )
        if not fest:
            fest = Festival(name=name)
            db.add(fest)

    fest.name = name
    fest.city_id = city_id
    fest.starts_on = starts_on
    fest.ends_on = ends_on
    fest.days = days
    fest.artists_count = len(attractions) or None
    fest.price_from_amount = _price_from(pr)
    fest.price_from_currency = pr.get("currency")
    fest.about = e.get("description") or e.get("info")
    fest.image_url = _pick_image(e.get("images"))
    fest.last_verified = date.today()
    fest.confidence = confidence_for(
        last_verified=fest.last_verified,
        has_when=fest.starts_on is not None,
        has_where=fest.city_id is not None,
    )
    db.flush()

    if not src:
        db.add(FestivalSource(festival_id=fest.id, source="ticketmaster",
                              source_festival_id=tm_id, source_url=e.get("url")))

    # Line-up (dedupe against existing + within this payload)
    seen = {fl.artist_id for fl in db.query(FestivalLineup).filter_by(festival_id=fest.id).all()}
    for i, att in enumerate(attractions):
        if not att.get("name"):
            continue
        artist = _get_or_create(db, Artist, name=att["name"])
        if artist.id in seen:
            continue
        seen.add(artist.id)
        db.add(FestivalLineup(festival_id=fest.id, artist_id=artist.id,
                              is_headliner=(i == 0), sort_order=i))
    return fest.id


# A festival happens in ONE place. A show that repeats the SAME bill in city after
# city is a tour, however its promoter markets it.
#
# Measured 2026-08-18: "Brighton - Chalk - Indiepalooza - 'the UK's BEST Indie
# Festival'" appeared as 23 listings across 22 cities, with the identical five-act bill
# of tribute bands (The Kopycat Killers, Kaiser Cheats, Subarctic Monkeys, Scam Fender)
# every night. That gave those acts 24 "festival appearances" each on their artist page.
#
# Earlier attempts at this used duration and bill size, and they were WRONG: Coachella
# 2027 has no end date and no announced line-up in Ticketmaster's data, so "multi-day OR
# 3+ acts" threw out both Coachella weekends while keeping a ceilidh night. Counting
# cities per bill has no such failure mode — every real festival we hold sits in exactly
# one city (Coachella: Indio, ACL: Austin, Lowlands: Biddinghuizen, North Sea Jazz:
# Willemstad), announced line-up or not.
#
# Known limit: a genuine multi-city festival BRAND (Breakaway, Tacos and Tequila) is
# excluded too. That is the honest trade — and nothing is lost for good, since the sweep
# re-imports whatever passes the rule on the next run.
TOURING_CITY_THRESHOLD = 3


def _drop_touring_shows(parsed: list) -> list:
    """Remove listings whose identical bill turns up in 3+ different cities."""
    from collections import defaultdict

    cities_per_bill = defaultdict(set)
    for p in parsed:
        bill = tuple(sorted(p["attractions"]))
        if bill:
            cities_per_bill[bill].add(p["city_name"])
    touring = {bill for bill, cities in cities_per_bill.items()
               if len({c for c in cities if c}) >= TOURING_CITY_THRESHOLD}
    if not touring:
        return parsed
    kept = [p for p in parsed if tuple(sorted(p["attractions"])) not in touring]
    print(f"[festivals] skipped {len(parsed) - len(kept)} listing(s) whose bill repeats "
          f"across {TOURING_CITY_THRESHOLD}+ cities — a tour, not a festival")
    return kept


def _batch_upsert_festivals(db: Session, events: list) -> list:
    """Upsert many Ticketmaster festivals with a handful of queries instead of ~11 each.

    The per-festival version took 455s for 453 festivals — about a second apiece, all of
    it DB round-trips to a remote Postgres: a city lookup, a source lookup, a name+city
    lookup, a flush, a line-up lookup, then two more per artist in the line-up. Roughly
    5,000 round-trips at ~90ms.

    Here every table is loaded ONCE up front, ids are assigned in memory so nothing has
    to flush mid-loop, and it all lands in one commit. Same rules as before:

      • only events with "festival" in the NAME (a gig mentioning a festival is a gig)
      • de-dupe by Ticketmaster id first, then by name+city, so the separate
        single-day and weekend-pass listings collapse into ONE festival
    """
    parsed = []
    for e in events:
        tm_id, name = e.get("id"), e.get("name")
        if not tm_id or not name or "festival" not in name.lower():
            continue
        emb = e.get("_embedded") or {}
        dates = e.get("dates") or {}
        v = (emb.get("venues") or [{}])[0] or {}
        loc = v.get("location") or {}
        ccode = (v.get("country") or {}).get("countryCode")
        starts_on = _parse_date((dates.get("start") or {}).get("localDate"))
        ends_on = _parse_date((dates.get("end") or {}).get("localDate"))
        parsed.append({
            "tm_id": tm_id, "name": name, "url": e.get("url"),
            "city_name": (v.get("city") or {}).get("name"),
            "country": ccode[:2] if ccode else None,
            "tz": v.get("timezone"),
            "lat": _num(loc.get("latitude")), "lng": _num(loc.get("longitude")),
            "starts_on": starts_on, "ends_on": ends_on,
            "days": (ends_on - starts_on).days + 1 if starts_on and ends_on else None,
            "price": (e.get("priceRanges") or [{}])[0] or {},
            "attractions": [a["name"] for a in (emb.get("attractions") or []) if a.get("name")],
            "about": e.get("description") or e.get("info"),
            "image_url": _pick_image(e.get("images")),
        })
    parsed = _drop_touring_shows(parsed)
    if not parsed:
        return []

    # --- 1. cities: one read, then create the missing ones together ---
    want_cities = {(p["city_name"], p["country"]) for p in parsed if p["city_name"] and p["country"]}
    city_map = {}
    if want_cities:
        for c in db.query(City).filter(City.name.in_([n for n, _ in want_cities])).all():
            city_map[(c.name, c.country)] = c
        for (nm, cc) in want_cities:
            if (nm, cc) not in city_map:
                row = next(p for p in parsed if p["city_name"] == nm and p["country"] == cc)
                c = City(name=nm, country=cc, timezone=row["tz"], lat=row["lat"], lng=row["lng"])
                db.add(c)
                city_map[(nm, cc)] = c
        db.flush()

    def city_id_for(p):
        c = city_map.get((p["city_name"], p["country"]))
        return c.id if c else None

    # --- 2. existing sources and festivals: two reads ---
    tm_ids = [p["tm_id"] for p in parsed]
    src_map = {s.source_festival_id: s.festival_id for s in
               db.query(FestivalSource).filter(FestivalSource.source == "ticketmaster",
                                               FestivalSource.source_festival_id.in_(tm_ids)).all()}
    known = (db.query(Festival).filter(Festival.id.in_(set(src_map.values()))).all()
             if src_map else [])
    by_id = {f.id: f for f in known}
    # name+city index, so day passes of one festival find each other
    lower_names = {p["name"].lower() for p in parsed}
    by_name_city = {}
    for f in db.query(Festival).filter(func.lower(Festival.name).in_(lower_names)).all():
        by_name_city[(f.name.lower(), f.city_id)] = f
        by_id.setdefault(f.id, f)

    # --- 3. artists for every line-up: one read, one create pass ---
    want_artists = {n for p in parsed for n in p["attractions"]}
    # Shared find-or-create, matching on the normalised name. This used to filter on
    # Artist.name.in_(...) — case-SENSITIVE — which is where most of the duplicate artists
    # came from: Ticketmaster billing 'line-ups' inconsistently, so 'Men at Work' and
    # 'Men At Work' arrived as two names and became two rows.
    artist_map = artist_lookup.get_or_create_many(db, want_artists) if want_artists else {}

    # --- 4. write festivals (ids assigned up front → no flush inside the loop) ---
    today = date.today()
    ids, new_sources, touched = [], [], {}
    for p in parsed:
        cid = city_id_for(p)
        fest = by_id.get(src_map.get(p["tm_id"])) or by_name_city.get((p["name"].lower(), cid))
        if fest is None:
            fest = Festival(id=uuid.uuid4(), name=p["name"])
            db.add(fest)
            by_name_city[(p["name"].lower(), cid)] = fest   # later day passes reuse it
            by_id[fest.id] = fest
        if p["tm_id"] not in src_map:
            new_sources.append((fest.id, p["tm_id"], p["url"]))
            src_map[p["tm_id"]] = fest.id

        fest.name = p["name"]
        fest.city_id = cid
        fest.starts_on = p["starts_on"]
        fest.ends_on = p["ends_on"]
        fest.days = p["days"]
        fest.artists_count = len(p["attractions"]) or None
        fest.price_from_amount = _price_from(p["price"])
        fest.price_from_currency = p["price"].get("currency")
        fest.about = p["about"]
        fest.image_url = p["image_url"]
        fest.last_verified = today
        fest.confidence = confidence_for(
            last_verified=today,
            has_when=fest.starts_on is not None,
            has_where=fest.city_id is not None,
        )
        ids.append(fest.id)
        touched.setdefault(fest.id, []).append(p["attractions"])

    for fid, tmid, url in new_sources:
        db.add(FestivalSource(festival_id=fid, source="ticketmaster",
                              source_festival_id=tmid, source_url=url))

    # --- 5. line-ups: one read for everything we touched, then add what's missing ---
    have: dict = {}
    for fl in db.query(FestivalLineup).filter(FestivalLineup.festival_id.in_(list(touched))).all():
        have.setdefault(fl.festival_id, set()).add(fl.artist_id)
    for fid, lineups in touched.items():
        seen = have.setdefault(fid, set())
        order = len(seen)
        for names in lineups:
            for i, nm in enumerate(names):
                artist = artist_map.get(nm)
                if not artist or artist.id in seen:
                    continue
                seen.add(artist.id)
                db.add(FestivalLineup(festival_id=fid, artist_id=artist.id,
                                      is_headliner=(i == 0 and order == 0), sort_order=order))
                order += 1

    db.commit()
    return list(dict.fromkeys(ids))


def ingest_festivals(size: int = 100):
    """Broad festival sweep -> batched upsert. Returns the festival ids touched."""
    events = search_festivals(size=size)
    db: Session = SessionLocal()
    try:
        return _batch_upsert_festivals(db, events)
    finally:
        db.close()


def ingest_artist_tour(name: str) -> dict:
    """Pull one artist's WHOLE tour from Ticketmaster by attraction id.

    Better than the keyword search this used to rely on, in two ways: it returns
    every date the seller lists for that performer (Weezer: 53, where our broad sweep
    had a handful), and it cannot pick up a tribute act, because `artist_attraction`
    only accepts an exact name match.

    Everything lands through the normal batch writer, so these events get provenance
    facts, a derived confidence and change detection like any other.
    """
    attraction = artist_attraction(name)
    if not attraction:
        # No exact attraction: we have nothing to claim. Not an error.
        return {"artist": name, "matched": False, "events": 0, "changes": 0}

    raws = fetch_artist_events(attraction["id"])
    if not raws:
        return {"artist": name, "matched": True, "attraction": attraction["name"],
                "events": 0, "changes": 0}

    db: Session = SessionLocal()
    try:
        # by-attraction payloads come from the events endpoint (a page, not a by-id
        # fetch), so they are not authoritative for withdrawing facts.
        ids, changes = _batch_upsert_search(db, raws)
        return {"artist": name, "matched": True, "attraction": attraction["name"],
                "events": len(ids), "changes": len(changes)}
    finally:
        db.close()
