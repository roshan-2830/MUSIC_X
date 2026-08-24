# Music X — session handoff (2026-08-24)

Paste this whole file into a new chat to carry the context over.

---

## What we're building

**Music X** — a trust-first live-music app. React Native / Expo (SDK 57, TypeScript,
expo-router) front end in `frontend/`, FastAPI + SQLAlchemy + Alembic back end in
`backend/`, Postgres on Supabase, Supabase Auth (ES256 JWT verified against JWKS).

The differentiator is **honesty about data**: every fact carries a source, confidence is
earned not asserted, and we show "no rating yet" rather than a guess. The phase-2 mockup
at `~/Downloads/musicx-mockup-phase2 (1).html` is the design source of truth — read it
before building any screen, it is far richer than it looks.

**Working style:** I'm a beginner. Guide me, and let me type the commands myself. One
step at a time. Explain what a command does before I run it.

---

## Where the project stands

**Repo:** `/Users/roshan/Documents/MusicX_dev`, branch
`feat/trust-layer-and-catalogue-breadth`. Last commit `4117890`. **No GitHub remote yet**
— the company hasn't provided a repo. Commit locally; don't keep suggesting GitHub setup.

**Backend:** 9 routers, 40 endpoints. Alembic head `f6a7b8c9d0e1`, DB fully migrated.
APScheduler runs two in-process jobs (discovery sweep 3h, deep re-verify 24h) — only while
the dev server is up.

**Data in Postgres today:**

| | |
|---|---|
| events | 4,947 (3,660 upcoming, 3,110 scored with MXS) |
| artists | 3,796 |
| festivals | 418 |
| cities / venues | 885 / 1,892 |
| event_facts | 47,654 (the provenance moat — live) |
| event_changes | 36 detected |
| notifications | 4 |
| calendar_entries | 1 |
| follows | 141 |
| lastfm_accounts | 5 |

**Frontend:** 3 screens (Home, Calendar, Search) + modals. Tab bar has 2 tabs; the mockup
has 5. Missing tabs are Passport, Trips, Bucket List.

---

## What got built in this session (ALL UNCOMMITTED)

Three slices are stacked in the working tree. Nothing has been committed.

### Slice A — Last.fm as a taste source
Spotify's taste endpoints return 403 for dev-mode apps, which stranded `taste_profiles`
and Tier B of `/me/recommended`. Last.fm replaces it: profiles are public, so a username
plus our API key is enough — no OAuth, no Premium, no five-user cap.

- `lastfm_accounts` table + model, 2 migrations
- `services/taste_import.py`, `GET/POST/DELETE /me/lastfm`
- Imported artists **rank** recommendations but never become follows. A follow means
  "alert me"; listening means "this is my taste". The reason line says which.
- MXS rewrite: **Deezer decides stature; Last.fm only fills gaps.** Taking the best of
  both had inflated dual-source artists by 8 points for no reason but having two draws.
- Popularity cached on the artist row (`deezer_fans`, `lastfm_listeners`)
- Onboarding leads with Connect Music; "who do you love?" is the fallback

### Slice B — save concerts AND festivals
- Migration `f6a7b8c9d0e1`: `calendar_entries.event_id` became nullable, `festival_id`
  added, check constraint enforces **exactly one** target. Same table on purpose, so
  `services/alerts.py` picks festivals up by the path it already uses.
- `GET/POST/DELETE /me/saves/festivals`
- Bookmark button on `event-card`, `event-hcard`, `festival-card`
- The festival card's heart had been **fake** (`useState(false)`, no API call)

### Slice C — full Calendar page redesign (ported from the mockup)
- New endpoint `GET /me/calendar?mode=mine|city&start=&end=` — resolves each card's tag
  server-side so a dot and the card under it can never disagree
- New `components/calendar-card.tsx`; `app/calendar.tsx` fully rewritten
- Month grid with dots, 14-day strip, Month/14-days toggle, prev/next/Today,
  "jump to next busy month", tap-a-day filter, Up-next countdown, colour key,
  day groups with relative labels, cancelled cards dimmed, footer promise

---

## Bugs found and fixed by RUNNING it (not by typechecking)

Seven, all caught in the browser. This is the lesson: **run the app, don't trust `tsc`.**

1. **Timezone** — a Detroit show stored 21:30 rendered as "FRI 7 AUG 03:00" (the viewer's
   IST). Added `zonedDay`/`zonedTime` to `lib/format.ts`; now "THU 6 AUG 17:30". This had
   also shifted the grid dots. The rest of the app already did this right via `formatDay`.
2. **Window edge** — the agenda listed a day the strip had no cell for. Now fetches ±1 day
   and trims by the venue's day.
3. **Ongoing festivals** filed under "4 days ago" in a "Next 14 days" view. Now file under
   the first day on screen.
4. **"1 DAYS"** → "1 DAY".
5. **City mode showed worldwide festivals** — under "All in London", only 2 of 97
   festivals were in London (14 Kraków, 11 Reading, 11 Leeds), burying the 56 real London
   shows. Festivals are now filtered by city too.
6. **Untagged card** — the filter matched artists anywhere on the bill but the tagger only
   checked headliners, so a support-act match appeared with no reason shown.
7. **Stale header after saving** — eyebrow/tag/dot come from the server payload. The page
   now refetches when the saves list changes.

---

## Product decision made this session

"Your shows" was showing 22 shows when I'd saved zero — they were all there because I
follow 23 artists. Decision: **keep the content, fix the framing.**

- Segment renamed **"Your shows" → "For you"** (dropping followed-artist shows leaves the
  tab empty for every new user; a dead tab is worse than a mislabelled one)
- Eyebrow now states the split: `1 saved · 21 from artists you follow`

---

## Gotchas — read before debugging

- **`expo start --web` was broken before this session.** `app.json` had
  `web.output: "static"`, which makes Expo server-render routes in Node, where Supabase's
  auth client touches `window` and crashes. **I changed it to `"single"`** — uncommitted,
  and a decision still to make. Web dev is impossible with `"static"`.
- **Office network runs a FortiGate TLS-intercepting firewall.** `*.bandsintown.com` and
  artist sites serve a `CN=FortiGate CA` cert → intermittent `CERTIFICATE_VERIFY_FAILED`
  from both httpx and curl. **Test from a hotspot before concluding an API is broken.**
- **Ticketmaster attraction lookup: exact name match only.** Searching "Coldplay" returns
  10 attractions and the 5 with upcoming dates are all tribute bands. Ranking by event
  count picks the tribute every time.
- **Artist-site scraping is measured dead** (Cloudflare JS challenges). Don't retry it.
- **Bandsintown needs a free `app_id`** — code is built and waiting in
  `services/bandsintown.py`; unregistered calls 403. Still to do once a key exists: the
  DB-write path (country→ISO2, dedupe, EventSource rows).
- **Spotify returns a stripped artist object** (no popularity/followers/genres) even on
  Premium. Deezer is the popularity source. Spotify is dead for taste.
- Use `python3.12` for this project; the venv is `backend/.venv`.

---

## What to do next

**1. Commit the three slices** (nothing is committed — do this first).

**2. Finish artist enrichment.** `backend/app/services/enrichment.py` exists, imports
cleanly, and is **called from nowhere** — no scheduler job, no admin endpoint, no runner.
It only has `backfill_popularity()`, though its docstring promises photos, bios, tags and
similar artists. Of the **1,477 artists with an upcoming show**:

| field | filled | coverage |
|---|---|---|
| popularity | 1,141 | 77% ← the only one backfilled |
| tags | 149 | 10% |
| bio | 33 | 2.2% |
| image | 21 | **1.4%** |
| similar | 12 | 0.8% |

The artist screens (`artist-detail`, `artist-about`, similar strip, `artists-row`) are all
built and rendering blanks 98% of the time. Add the missing backfills next to
`backfill_popularity`, wire a third scheduler job plus `POST /admin/enrich`, run it once.

**3. Later:** the three missing tabs (Passport, Trips, Bucket List) are backed by ten
tables no code touches — `passport_entries`, `saved_trips`, `trip_stops`, `travel_legs`,
`hotel_bookings`, `bucket_list`, `reviews`, `review_likes`, `referrals`,
`dismissed_suggestions`.

**Parked/dead:** Feed/Reels tab (no honest video source), Spotify, artist-site scraping,
real push notifications, India data.

---

## How to run

```bash
# backend
cd backend && fastapi dev app/main.py --host 0.0.0.0     # http://127.0.0.1:8000/docs

# frontend
cd frontend && npx expo start        # press w for web, or --dev-client for the EAS build
```

Device testing needs an EAS development build (Expo Go bounces on SDK 57) and a network
without client isolation — use a hotspot.
