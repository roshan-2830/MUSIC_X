# Music X — session handoff (2026-08-24, end of day)

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
step at a time. Explain what a command does before I run it. **Verify by running the app,
not by typechecking** — `tsc` passed clean while seven real bugs shipped.

---

## Where the project stands

**Repo:** `/Users/roshan/Documents/MusicX_dev`, branch
`feat/trust-layer-and-catalogue-breadth`. **No GitHub remote** — the company hasn't
provided one. Commit locally; don't suggest GitHub setup.

Recent commits:

| | |
|---|---|
| `1a49b71` | the calendar shows only what you saved |
| `5b252bd` | this handoff |
| `bd14d43` | artist enrichment, one artist-identity path, Deezer fan-count fix, audience counts in UI |
| `8ebae86` | Last.fm taste source, saving festivals, the rebuilt Calendar page |
| `4117890` | similar artists, Last.fm as a taste source, real genres |

**Working tree is clean.** Everything below is committed.

**Backend:** 9 routers, 35 endpoint paths. Alembic head `f6a7b8c9d0e1`, fully migrated.
APScheduler runs **three** in-process jobs — discovery sweep (3h), deep re-verify (24h),
artist enrichment (24h) — and only while the dev server is up.

**Data in Postgres:**

| | |
|---|---|
| events | 4,955 (3,668 upcoming, 3,117 scored) |
| artists | 3,799 |
| festivals | 418 |
| cities / venues | 885 / 1,893 |
| event_facts | 47,726 (the provenance moat) |
| event_changes | 36 |
| artist_similar | 20,985 |
| event_genres / genres | 6,414 / 552 |
| follows | 140 |
| lastfm_accounts | 5 |
| calendar_entries | 3 |

**Frontend:** 3 screens (Home, Calendar, Search) + modals. Tab bar has 2 tabs; the mockup
has 5. Missing tabs are Passport, Trips, Bucket List.

---

## What got built this session

### Artist enrichment — the artist screens now have data

`services/enrichment.py` existed, imported cleanly, and was **called from nowhere**. Now
it has `backfill_images`, `backfill_bios`, `backfill_similar`, `backfill_tags` and
`backfill_similar_photos`, plus `enrich_all`, a daily `enrich_catalogue` scheduler job
(`ENRICH_INTERVAL_HOURS`, `ENRICH_LIMIT`) and `POST /admin/enrich?limit=N` (limit is
**per stage**, not per run).

Coverage of the **1,476 artists with an upcoming show**, after one full run:

| field | before | now |
|---|---|---|
| similar | 0.4% | **98.6%** |
| photo | 1.4% | **71.1%** |
| tags | 10.0% | **68.0%** |
| popularity | 77.3% | 81.0% |
| bio | 2.2% | 10.6% ← the one that stayed low, see below |

Design rules that must not be quietly loosened:

- **Photos need an exact normalised name match.** 426 of 1,451 artists correctly got no
  photo. A blank is honest; a tribute act wearing the real act's face is a lie the page
  asserts and the reader cannot detect.
- **Bios are Wikipedia only**, always stored with `wiki_url` — the URL of the page the
  text was actually read from, never a guessed `/wiki/<Name>`.
- **A failed lookup is never stamped.** `*_checked_on` is set only when the call
  COMPLETED, so a throttled request retries instead of freezing as "nothing here".
- **Network calls happen with no DB connection open**, writes land in short bursts.
  Holding one session for a long run gets it dropped by Supabase's pooler.

### `_todo` orders by who will be OPENED, not by date count

Busiest-first looked right and was wrong. The busiest names in this catalogue are venue
residencies and tribute acts — `Tablao Flamenco 1911` (247 dates), `MJ LIVE` (109),
`Rumours of Fleetwood Mac` (51) — which are **exactly** the acts every source refuses to
match. A bounded run spent its whole budget on artists that can never be filled while
Bruno Mars and Metallica queued behind them. Now: followed artists first, then Deezer
fans, then dates.

### One way to find-or-create an artist

Artists were created in **five places** with **three different matching rules** —
case-sensitive in ingestion, case-insensitive in the routes, normalised-only-within-the-
batch in the Last.fm import. That is where every duplicate came from. All five now call
`services/artist_lookup.get_or_create`, matching on the normalised name — the same key
`dedupe.py` groups by, so the two cannot disagree about what counts as one artist.

`services/dedupe.py` merges what already exists, dry-run by default. **The rule:** a row
merges only if its name is the survivor's RE-CASED or with punctuation REMOVED — never
with characters ADDED. That is why **`OMAR+` stays separate from `OMAR`**: `Omar` plays
Suset Festival in Spain, `OMAR+` plays Reading and Leeds. Asking Deezer cannot settle it,
because our own normaliser strips the `+` before Deezer ever sees it. Merged 6 groups,
13 rows → 7.

### The Deezer identity bug — a fan count at 2% of the truth

`artist_fans`/`artist_image` returned the **first** name match from a result set Deezer
does not order predictably — and Deezer files one artist under several spellings.
Searching A.R. Rahman returns **six entries for one man**, 283,680 fans down to 107. We
had stored **6,379** for him, and **MXS reads that column to judge stature**, so he was
scored at 2% of his audience. Both functions now take the most-followed exact match; 221
punctuated-name artists were re-checked and 4 were materially wrong. Search also collapses
Deezer's own duplicates by normalised name.

### Audience counts in the UI

`ArtistDetail` exposes `deezer_fans` and `lastfm_listeners`; the Following list, both
search lists, onboarding and the artist page show them via `format.audienceLine`.
**Never summed or averaged** — Deezer counts followers, Last.fm counts distinct
listeners, so each number names its own service.

---

### The calendar shows what you saved, and nothing else

`mode=mine` returned saved shows PLUS anything by a followed artist or in a followed
city — 3 saved concerts against 153 follow-derived ones, so the page read as a list of
156 commitments the user had made three of.

The previous session met this and chose to keep the content and fix the framing ("Your
shows" → "For you", eyebrow stating the split), reasoning that an empty tab is worse than
a mislabelled one. **Reversed on the owner's call**, and the old reasoning does not
survive the question a calendar actually answers: an empty calendar is not a dead tab, it
is a true one. Nothing is lost either — Home's Recommended row is built from the same
follow graph, which is where you DISCOVER a show as opposed to the page that says you are
going to it.

Scope label is now "Saved" with a bookmark icon; the eyebrow is the mockup's own
`3 saved · none booked yet`; the empty state names the one action that fills the page,
because "follow an artist or save a show" became false the moment this scope stopped
reading follows. `mode=city` is untouched — it never claimed the shows were yours.

## Bugs I caused and fixed (both found by running it)

1. **Similar-artist photos went blank.** `backfill_similar` writes the 20 names and stamps
   `similar_checked_on`, which made `artist_detail` believe the strip was done — `cached`
   was true and the stamp was today, so neither branch fired and the only code that fills
   those photos never ran. Foo Fighters: 20 names, 0 photos, no path to a photo for 30
   days. `artists.py` now also queues the photo pass when rows are fresh but photoless.
2. **`lineup_matches` was computed inside the `mine` branch** of `/me/calendar`, so it
   was always empty in city mode and a followed support act rendered as a card with no
   reason shown — the same bug found by running the app last session, still live in the
   other scope. Now computed for both modes.
3. **Two backends on port 8000.** An orphaned `uvicorn` from the previous day (parent PID
   1, no `--reload`) held `127.0.0.1:8000` while `fastapi dev` held `*:8000`. macOS lets
   both bind and the **specific address wins**, so `localhost` served yesterday's code and
   hid all of today's work. If today's endpoints seem missing, check
   `lsof -nP -iTCP:8000 -sTCP:LISTEN` before debugging anything else.

---

## Gotchas — read before debugging

- **Run the app. `tsc` proves nothing here.** Seven bugs shipped through a clean typecheck.
- **Opening an artist page CREATES a row.** `/artists/detail?name=X` is find-or-create, so
  tapping a Deezer search result used to mint a duplicate. Fixed, but remember the page is
  a write path, not a read.
- **Office network runs a FortiGate TLS-intercepting firewall.** `*.bandsintown.com` and
  artist sites serve a `CN=FortiGate CA` cert → intermittent `CERTIFICATE_VERIFY_FAILED`.
  **Deezer, Last.fm, Wikipedia and Wikidata are all clean** (verified 2026-08-24), so
  enrichment runs fine from the office. Test from a hotspot before declaring an API broken.
- **Ticketmaster attraction lookup: exact name match only.** Searching "Coldplay" returns
  10 attractions and the 5 with upcoming dates are all tribute bands.
- **Artist-site scraping is measured dead** (Cloudflare JS challenges). Don't retry.
- **Bandsintown needs a free `app_id`** — code waits in `services/bandsintown.py`; the
  DB-write path is still to do once a key exists.
- **Spotify returns a stripped artist object** even on Premium. Deezer is the popularity
  source. Spotify is dead for taste.
- **`app.json` `web.output` must stay `"single"`.** With `"static"`, Expo server-renders in
  Node where Supabase's auth client touches `window` and crashes.
- Use `python3.12`; the venv is `backend/.venv`.

---

## What to do next

**1. `genres` went from 121 rows to 552** in one tagging run, and crowd tags include
artist names, venue names, place names and private notes — an unbounded set.
`tagging.prune_single_artist_genres(db)` exists for exactly this and has NOT been run
since the backfill. It drops genres claimed by only one artist AND not resembling a genre
name, and `tagging.reapply_cached_tags(db)` rebuilds the event links afterwards with no
API calls. Run the prune, then eyeball what it dropped before committing.

**2. Bios land at ~10% while photos land at 71%.** `wikipedia.fetch_artist_bio` only
accepts a page whose short description reads musical and isn't a disambiguation stub.
That strictness is what stops the wrong namesake's biography appearing, so it was NOT
loosened — but it is probably also rejecting artists who do have a real page. Sample 20
of the rejects by hand before touching the filter. Nothing is stored wrongly and nothing
is stamped, so a later run retries them for free.

**3. Ticketmaster billing strings are stored as artists** — e.g. `A.R. Rahman feat. Alka
Yagnik; Udit Narayan; Sukhwinder Singh; Shankar Mahadevan; Shaan & Sehar`. Not
duplicates, so `dedupe.py` correctly leaves them, but they look like junk in search. A
cleanup would split on `feat.` / `;` / ` and ` and attach the real artists to the event.

**4. Accented duplicates are a known gap.** `artist_lookup.key` strips punctuation but
NOT accents, because the key must match what Postgres computes and `unaccent` is not
installed. So `Beyoncé` and `Beyonce` would still become two rows. Every duplicate
actually measured was case or punctuation.

**5. The three missing tabs** — Passport, Trips, Bucket List — backed by ten tables no
code touches: `passport_entries`, `saved_trips`, `trip_stops`, `travel_legs`,
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

# fill artist pages by hand (limit is PER STAGE)
curl -X POST "http://127.0.0.1:8000/admin/enrich?limit=5"   # needs a bearer token
# or, no auth needed:
cd backend && .venv/bin/python -c "from app.services import enrichment; enrichment.enrich_all(limit=1500)"

# find/merge duplicate artists — DRY RUN by default, prints a full plan
cd backend && .venv/bin/python -c "from app.services import dedupe; dedupe.dedupe_artists()"

# drop junk crowd-tag genres, then rebuild event links with no API calls
cd backend && .venv/bin/python -c "
from app.db.session import SessionLocal
from app.services import tagging
db=SessionLocal()
print(tagging.prune_single_artist_genres(db)); print(tagging.reapply_cached_tags(db))
db.commit()"
```

Device testing needs an EAS development build (Expo Go bounces on SDK 57) and a network
without client isolation — use a hotspot.
