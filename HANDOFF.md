# Music X — context handoff (8 September 2026)

**Paste this whole file into a new Claude chat as your first message.** It carries everything
needed to continue without re-explaining the project.

---

## Read me first, Claude

You are picking up an in-progress product. Before you write code:

**How I work.** I'm a beginner. **Guide me and let me type the commands myself**, one step at a
time, and say what a command does before I run it. **Verify by running the app, not by
typechecking** — `tsc` has passed clean while seven real bugs shipped. Explain things in simple
terms and keep answers short unless I ask for detail. If I say I don't understand, give me a
concrete example from our own data rather than rephrasing.

**Two files govern the code.**
- `frontend/AGENTS.md` — **read https://docs.expo.dev/versions/v57.0.0/ before writing any Expo
  code.** SDK 57 patterns differ from older blog posts and things fail silently.
- The mockup at `~/Downloads/musicx-mockup-phase2 (1).html` (413 KB) is the **design source of
  truth**. Read the relevant part before building any screen. Most UI questions are already
  answered in it.

**I push my own commits.** Commit locally when I ask; never run `git push`.

**There is a full reference document** — every feature, job, key and rule, in detail:
https://claude.ai/code/artifact/dc2c3a54-2cae-4adf-bda8-37a246582fa3

---

## 1. What Music X is

A **trust-first live-music app**: find concerts worth travelling for, decide whether to go, keep
the trip in one place. React Native / Expo (SDK 57, TypeScript, expo-router) in `frontend/`,
FastAPI + SQLAlchemy + Alembic in `backend/`, Postgres + Auth on Supabase.

**The one rule that shapes every decision — "absence over guess":**

> Every fact carries a source. Confidence is earned, not asserted. Where we do not know
> something we say so; we never fill a gap with a plausible-looking value.

That is a technical constraint, not a slogan. It is why:
- A rating omits components with no data and re-weights the rest, rather than substituting an average
- An artist with no confident photo match shows initials, never a lookalike's face
- A fact that vanishes from its source is **deleted**, not kept
- Confidence **decays on its own** — stop the re-verify job and everything slides high → medium → low
- The trip ledger never converts currencies: it prints "£309 + €240"

**When unsure which option to build, pick the one that claims less.**

---

## 2. Where the code is

```
/Users/roshan/Documents/MusicX_dev     branch main
remote: github.com/roshan-2830/MUSIC_X.git
```

| | |
|---|---|
| `backend/app/api/routes/` | 17 routers, 96 endpoints |
| `backend/app/models/` | 40 models → 42 tables |
| `backend/app/services/` | 39 modules — **the real logic. Read the docstrings, they explain WHY** |
| `backend/alembic/versions/` | 41 migrations, head `3036e206da09` |
| `frontend/src/app/` | 6 screens (index, calendar, trips, me, search, _layout) |
| `frontend/src/components/` | 49 components; full pages are `Modal`s, not routes |
| `frontend/src/lib/api.ts` | 1,524 lines — every backend call + types. Start here |

Backend 17.5k lines Python, frontend 20k lines TypeScript.

**Run it:**
```bash
cd backend  && .venv/bin/uvicorn app.main:app --reload --port 8000   # python3.12, venv at backend/.venv
cd frontend && npx expo start                                        # press w for web
```
`localhost:8000/docs` is the fastest way to see the API.

---

## 3. Current state — read this, it changed today

### The Supabase migration (8 Sep)

The project **moved from a personal Supabase account to a company-owned org**.

| | |
|---|---|
| Project | `musicx-prod`, org `YangtsoFour` |
| Ref | `fmgewgmilsnyjvdddngd` |
| Region | **Singapore** `ap-southeast-1` (was Mumbai) — same region as Render |
| Postgres | 17.6 |
| Plan | **FREE — this is the open problem, see §8** |
| Data API | **OFF**. Keep it off. |

Verified end to end: 42 tables restored row-for-row, search indexes intact, backend serving,
Render deployed, Vercel bundle rebuilt, live signup → profile row → name in the Me tab.

**The old project still exists as a rollback.** Nothing points at it. Safe to delete after ~15 Sep.

### Live data

```
events            21,423   (18,749 upcoming, 16,870 scored)
event_facts      201,211
artists           12,358      venues  4,006      cities  1,540
festivals            992
profiles              16      auth users  3
calendar_entries      44      passport_entries  11
db size          264 MB of the free tier's 500 MB
```

### Deployment

| | |
|---|---|
| API | Render, **Singapore**, free plan → `https://musicx-api.onrender.com` |
| Web | Vercel → `https://music-x-five.vercel.app` |
| Migrations | run on deploy: `alembic upgrade head && uvicorn … --workers 1` |

**`--workers 1` is load-bearing** — the scheduler runs inside the API process, so a second
worker means two of every job.

**Render's free plan sleeps after 15 min idle.** While asleep nothing refreshes and no
notification is delivered. Needs Starter ($7/mo) before anyone depends on the jobs.

---

## 4. What was built in the last session

**My shows** (`components/my-shows.tsx`, `GET /me/shows`) — everything saved, filed by plan
state, six tabs with counts. Nothing on the screen moves a show between tabs, because state is
derived from facts (see §6).

**My bookings — the trip ledger** (`components/my-bookings.tsx` 983 lines, `GET /me/bookings`) —
one card per show holding ticket + stay + travel, a 3-stage progress count, spend per currency,
and a banner when a free-cancellation window closes within a week. New: manual "record my stay"
route, travel-leg CRUD (the `travel_legs` table had no API at all), and a `ticket_cost` column.

**`components/day-picker.tsx`** — single-date scrollable calendar, sibling of the range picker.

**Timezone fix** — the event page formatted dates on the *reader's* clock, so it disagreed with
every list card by one day. All dates now render in the **venue's** timezone.

**Three performance fixes** — see §7, this is the important part.

**The archive job** (`services/archive.py`) — past shows nobody kept are now deleted daily.

### Recent commits (newest first)

```
8481943 feat: let go of past shows nobody kept
85814c3 chore: keep the migration dumps and env backups out of the repo
cddb8c0 perf: stop asking the database a million separate questions
739301d perf: the scoring pass was 37 MB and eleven minutes; it is 7 MB and twenty seconds
78a12a3 fix: a show's date is the day it happens where it happens
cb65397 feat: the My shows and My bookings screens
f1e5532 feat: My shows and My bookings, the two Me-tab rows that went nowhere
e76e555 fix: pick trip dates on a calendar, and clear two icons off the home header
7a70e23 feat: the reviews screen
17b4b78 feat: sign up with a name, and one onboarding screen instead of a fork
2b2ef6e feat: a splash and three intro slides
58ba942 feat: reviews, written by people who were actually there
b34cf8b feat: MXS scores on five signals instead of two
```

**1 commit unpushed.** I run `git push origin main` myself.

---

## 5. MXS — the scoring system (the most important logic)

`services/scoring.py`, 775 lines.

```
MXS = 0.35·Artist + 0.25·Rarity + 0.15·Venue + 0.15·Production + 0.10·Context
```

| Component | Source | Coverage |
|---|---|---|
| Artist | Deezer followers; Last.fm listeners as **fallback, never a tiebreak** | 86.0% |
| Rarity | the tour graph — every upcoming date of every tour, from our own DB | 76.4% |
| Venue | Wikidata capacity (`P1083`) | 12.8% |
| Production | promoter + seatmap, already in `event_facts` | 70.1% |
| Context | festival, anniversary, tour finale, opening/closing night | 19.8% |

**Four non-obvious properties:**
1. Components with no data are **dropped and the weights re-normalised** — never faked.
2. The number is a **rank, not a measurement**. Percentile-ranked within the cohort, blended,
   ranked again. Only the top ~2% reach 9.0+. **This is why adding shows changes every existing
   score**, and why the job cannot score one event alone.
3. **Ties must break on a fixed key** (the event id). Ranking over unbroken ties made the same
   show drift across a three-point band — 3,094 scores changed on frozen input.
4. **Rarity cannot stand alone.** Left to, it put "Gavit Class of '97 Reunion Concert" at 10.0,
   above Bob Dylan, on the word "reunion".

Below **5,000 listeners** an act sits at the floor rather than being ranked — ranking unknowns
against each other made "marginally less unknown" read as stature (a 502-listener band scored 8.1).

Day-of-week is deliberately excluded: a Saturday show is a fact about your calendar.

Every score writes its workings to `events.mxs_breakdown` — components, weights, confidence,
reason chips, and which components were **missing**. The app shows all of it.

---

## 6. Plan states — derived, not transitioned

`services/plan.py`. **Interested → Planning → Confirmed → Attended.**

```
attended    the show happened AND there is a ticket
confirmed   there is a ticket
planning    a stay, an invite sent, or a note written
interested  they saved it
```

Recomputed on every read. Nothing "moves" a show. A stored state must be moved by whoever
causes the change, so every future feature has to remember — and the one that forgets leaves
somebody on Interested with a hotel booked.

Two exceptions: **attended** can be a stored answer ("I was there" without a ticket), and
**missed** is an answer, not a stage. The cache write-back must never overwrite either.

---

## 7. Performance — the outage, and what fixed it

**Supabase cut the old project off on 5 Sep**: the free tier allows 5 GB/month of egress
(data *leaving* the database) and we used **13.9 GB**. Not users — there were 5. Our own
background jobs. Fixed, then the project moved.

Measured breakdown: `events` 11 GB, `event_facts` 2.2 GB, everything else 1.6 GB.

### Three fixes, all in `services/scoring.py`

**1. Ask for the columns you use.** `db.query(Event)` meant all 29 columns. Two are 81% of a
row: `description` (671 B of Ticketmaster small print — the top-scoring show carries 581 bytes
about handbag size at Wembley) and `mxs_breakdown` (542 B, the job's own previous output, which
it overwrites without reading). Now `load_only(...)` on six columns: 1,255 B → 458 B.

Proved by re-running with `raiseload=True`, which makes touching a deferred column raise. It
completed, so no score can have moved.

**2. Skip when nothing changed.** `services/job_state.py`. The pass ran ~700 times a month,
nearly all producing identical scores. A **fingerprint** — counts and newest timestamps across
everything it reads, hashed — is compared to the one stored after the last run. Three required
properties: **fails open** (any error → run), **has a 24h ceiling**, **costs nothing to ask**
(all aggregates). The fingerprint is taken *again after* the run, because scoring writes to
`events` and moves its own fingerprint.

**3. Never hold ORM objects across a commit.** `db.commit()` expires every instance, so the next
`ev.id` triggered a **full-row refetch** — 13,891 extra queries per pass, ignoring `load_only`
entirely and handing the saving straight back. The list now holds ids.

```
scoring pass:  ~37 MB → 7 MB      ~11 min → 21 s
passes/month:  ~700 → ~20
refetches:     13,891 → 0
events egress: ~11 GB → ~140 MB/month
determinism:   two runs, 19,420 scores compared, 0 changed
```

### A fourth fix: stop asking a million separate questions

A round trip to Supabase measures **27.3 ms**. There were 661,017 one-at-a-time
`UPDATE event_facts SET last_verified` statements — five hours of waiting, while the database
spent 91 seconds doing the work. Now one batched statement per chunk, with an
`IS DISTINCT FROM` guard so the 3-hourly refresh emits nothing after the first pass of the day.
Also: `build_bill_index` now takes an explicit id set, so `score_events_by_ids` stopped
querying per event (~11,790 per refresh → 0).

**Caveat for whoever continues this:** `pg_stat_statements` counts are **lifetime** and have
never been reset, so some apparent N+1s are from code replaced months ago. Measure a **delta
around a real run** instead. And **the festival merge, the event dedupe and the alerts engine
still read the whole catalogue with every column** — the same mistake, in three places we did
not fix. They are now the largest egress consumers.

---

## 8. Background jobs

`app/scheduler.py` — APScheduler, **inside the API process**, so they only run while the server
is up.

| Job | Every | What |
|---|---|---|
| `sweep_catalogue` | 3 h | broad **discovery** of new shows + festivals |
| `refresh_catalogue` | 3 h | **re-verify** everything inside a 7-day horizon |
| `refresh_catalogue_deep` | 24 h | the same over the whole catalogue |
| `enrich_catalogue` | 24 h | artist photo, bio, tags, similar, popularity |
| `reminders` | 1 h | on-sale, week-out, day-of |
| `passport_stamps` | 1 h | record finished ticketed shows |
| `push_delivery` | 2 min | send what hasn't reached a device |
| `archive_past_events` | 24 h | **new** — drop past shows nobody kept |

**`SCHEDULER_ENABLED=0` is in my local `backend/.env`** — otherwise every dev-server restart
fires a sweep, a refresh and an enrichment within 90 seconds. Default is ON so production can't
be broken by a variable nobody set.

Two cadences because they answer different questions: a cancellation matters most for a show
somebody has a ticket for *this week*. Splitting them cut daily work 85%. Ticketmaster
re-verify is batched **150 ids per request** — 44 requests, not 6,583.

Manual triggers: `POST /admin/{sweep,refresh,score,enrich,push,archive}`, gated by
`ADMIN_USER_IDS`. **Empty denies everyone, including me.** `/admin/enrich`'s limit is *per
stage*. `/admin/archive` is **dry-run by default**.

### The archive job (`services/archive.py`) — read before touching it

Nothing had ever deleted a past event; the catalogue grew ~18 MB/day toward a 500 MB ceiling.

**What makes it safe is not the grace period.** Almost every FK into `events` is
`ON DELETE CASCADE` — `calendar_entries`, `hotel_bookings`, `reviews`, `travel_legs`,
`trip_stops`, `event_invites`, `notifications`. So `DELETE FROM events WHERE starts_at < now()`
would **silently** take a person's saved shows, hotel booking, reviews and trip plans. Only
`passport_entries` is `NO ACTION` and would object, which is luck.

So a show survives if **any** row in **any** user-owned table points at it — not "if attended",
if anybody ever did anything with it, including being notified or dismissing it. Grace
(`ARCHIVE_GRACE_DAYS`, default 14) is the *second* guard.

**And the table lists are checked against the live schema every run.** `_verify_coverage` reads
the actual foreign keys and **refuses to run** on anything unclassified. This is the fix for the
festival-cleanup bug, whose hand-written guard named 2 of the 7 tables it needed and came one
saved show away from deleting user data. Proved by hiding `reviews` from the list and calling
with `dry_run=False`: it deleted nothing and stopped.

First run at 14 days removed **1,279** past events (eligible 1,244 — the guard is *transitive*:
a survivor protected only by a duplicate pointing at it becomes eligible once that duplicate
goes, so chunks cascade). All eleven user-owned tables verified unchanged before and after.

**Postgres does not return deleted space to disk.** The win shows up as growth *pausing* while
the next ~1,300 shows refill the holes, not as the size number dropping.

---

## 9. External APIs and keys

Names only; values live in `backend/.env` and the Render dashboard, never committed.

| Service | What we get | Env var(s) | Limit |
|---|---|---|---|
| **Ticketmaster** | the catalogue: events, venues, prices, seatmaps, promoters, bills, MusicBrainz ids | `TICKETMASTER_API_KEY` | 5,000/day |
| **Deezer** | follower counts (primary MXS signal), photos, global artist search | *no key* | free |
| **Last.fm** | listener counts (fallback), crowd genre tags, similar artists, user history | `LASTFM_API_KEY` | free |
| **setlist.fm** | what an artist plays live; a user's attended gigs for the Passport | `SETLISTFM_API_KEY` | throttled |
| **Wikipedia** | cited bios, stored with the URL actually read | *no key* | free |
| **Wikidata** | venue capacity `P1083` | *no key* | CC0 |
| **Bandsintown** | an artist's own tour incl. festivals TM misses | `BANDSINTOWN_APP_ID` | free |
| **OpenStreetMap** | places near a venue, 4 Overpass mirrors | *no key* | be polite |
| **Tripsure** | hotels + flights, two products | `TRIPSURE_*` ×3, `TRIPSURE_FLIGHT_*` ×3 | partner |
| **Expo Push** | phone notifications | `EXPO_ACCESS_TOKEN` | free |
| **Web Push** | browser notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | free |
| **Spotify** | scaffolded only, needs app review | `SPOTIFY_CLIENT_ID/SECRET` | 5 testers |
| **Supabase** | Postgres + Auth | `DATABASE_URL`, `SUPABASE_URL` | see §10 |

Frontend, **public by design** (Metro bakes them into the bundle — never put a secret here):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`,
`EXPO_PUBLIC_GYG_PARTNER_ID`, `EXPO_PUBLIC_GYG_CAMPAIGN`. `EXPO_PUBLIC_API_URL` must be set and
**https** in any deployed build.

**Three lessons about external sources:**
- **Test the source before designing on it.** Four services were going to seed reviews. All four
  checked; none has concert reviews. (Last.fm `getShouts` → "Invalid Method"; Ticketmaster has 59
  attraction fields and zero opinion words — the one matching `/star/` was `startDateTime`.)
- **A failed lookup is never stamped.** `*_checked_on` only on a **completed** call, so a
  throttled request retries instead of freezing as "nothing here".
- **Match on identifiers, not names.** Asking setlist.fm for "Coldplay" by name returned a
  tribute band's set from an Italian beer festival. Use the MusicBrainz id; record whether the
  match was by id or name.
- **If HTTPS fails on an office network**, check the certificate issuer before blaming the API —
  ours said `CN=FortiGate CA`. On a hotspot it worked immediately.

---

## 10. Open problems, in priority order

### 1. The org is on the FREE plan — this is the deadline

**264 MB of a 500 MB ceiling, growing ~18 MB/day** (~1,300–2,200 new events daily). When it
fills, **writes start failing**: no new shows, no new signups. Query optimisation cannot fix it;
it is about what we keep. Free tier also has **no backups**, which we cannot launch on.

**Pro is $25/mo on the organisation.** I am asking my manager. The archive job slows the climb;
Pro removes the ceiling.

### 2. `anon` has write grants on all 42 tables, and zero RLS

The new project granted `anon` and `authenticated` **SELECT + INSERT + UPDATE + DELETE** on all
42 tables (the old one gave only SELECT) because "Automatically expose new tables" was ticked at
creation. **Harmless while the Data API is OFF**, and a live write hole the moment anyone turns
it on, since the anon key ships inside the app bundle by design.

Two statements close it. Nothing uses those roles — the backend connects as `postgres`, Auth
uses its own internal role:
```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```
The second matters — without it the next migration re-grants everything.

### 3. Three more full-catalogue readers never fixed

`festival_merge.py`, `event_merge.py` and `alerts.py` all read the whole catalogue with **every
column** — the same mistake removed from scoring. They are now the biggest egress consumers.
Same `load_only` fix, roughly an hour.

### 4. Launch blockers

- Apple Developer enrolment ($99/yr, has a queue — start early)
- Render Starter ($7/mo) — free plan sleeps and stops every job
- **In-app account deletion** — an App Store *requirement*
- Privacy policy + terms on a real domain
- App name and bundle id — **permanent** once submitted
- Replace the Expo default icon and splash image
- Sentry, and database backups

### 5. Known gaps

- **No automated tests at all.** Verification has been by measurement and by running the app.
  This is the biggest structural gap in the project.
- Venue capacity covers 12.8% of shows — Wikidata knows arenas, not clubs. Re-run
  `scripts/backfill_venue_capacity.py`.
- MusicBrainz ids on 252 artists. Re-run `scripts/backfill_artist_mbid.py`.
- Artist bios ~10% — Wikipedia disambiguation is strict on purpose.
- Tripsure is search-only; no booking flow (would need us to take payment).
- `components/follow-artists.tsx` is orphaned since the onboarding merge.
- `event_facts` stores `source_url` on every row — the same URL ~9× per event, ~19 MB. Belongs
  on the event.
- Not built, tables empty: bucket list, referrals, Music X Wrapped, appearance/theme, roadmap
  page, privacy page, help.

---

## 11. Rules that must not be quietly loosened

Every one was learned by getting it wrong first.

| Rule | Why |
|---|---|
| Never invent a value | Omit the component, show the gap, say "no rating yet" |
| Never derive a name from an email | `jadhav.r` is not a name |
| Photos need an exact normalised match | 426 of 1,451 artists correctly got none; a tribute act wearing the real face is a lie the reader can't detect |
| Bios are Wikipedia only, with the real URL | Never a guessed `/wiki/<Name>` |
| Stamp the check only on success | Or a throttled request freezes forever as "nothing here" |
| Break every tie on a fixed key | Cost us 3,094 drifting scores |
| Retire on the **second** miss | One bad API response shouldn't delete a real show |
| Check every user table before deleting an event | The festival cleanup was one saved show away from destroying data |
| Withdraw facts only from an authoritative payload | A search page is a projection; absence there proves nothing |
| Never convert currencies | Two right numbers beat one confident wrong one |
| Dates render in the **venue's** timezone | A concert happens on one day |
| Bulk-load, never query per row | 27.3 ms a round trip; a million is seven hours |
| Select only the columns you use | On `events`, 81% of a row is text the jobs never read |
| Never hold ORM objects across a commit | `commit()` expires them; the next attribute access refetches the whole row |
| `--workers 1` | The scheduler lives in the API process |
| Push before you deploy | Render builds from GitHub; a migration in an unpushed commit means the deploy refuses to start |
| Verify by running the app | `tsc` passed clean while seven real bugs shipped |

---

## 12. If you're stuck

**Read the service docstrings.** Nearly every module in `backend/app/services/` opens with
several paragraphs on why it is built that way, what was tried first, and what broke. They are
the real documentation. The five to read first:

```
scoring.py      provenance.py     plan.py     trust.py     job_state.py
```

---

## What I want to do next

*(edit this line before pasting — tell the new chat what you actually want)*

> Nothing specific yet. Ask me what I want to work on.
