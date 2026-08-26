# Music X — session handoff (2026-08-25, end of day)

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
| `0743a70` | festival search works the way concert search always has |
| `66fc27a` | festival search reaches every festival, and the ones hiding as concerts |
| `8dfcc87` | find the festivals the sweep was throwing away |
| `d80ab5a` | festival pages, one listing one home, and the day-by-day bill |
| `c4f4fcd` | one toggle, one kind of search result |
| `cb5e6a4` | search as you type, ranked by relevance |
| `4f55b8e` | event page: genres on the artwork, a tappable line-up |
| `053c470` | shelves show twelve artists, not one tour repeated |
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
| events | 5,066 (3,779 upcoming, 3,105 scored) |
| artists | 5,209 |
| festivals | **509 visible** (775 rows, the rest merged away) |
| cities / venues | 937 / 2,003 |
| event_facts | 48,782 (the provenance moat) |
| event_changes | 45 |
| artist_similar | 21,145 |
| event_genres / genres | 7,075 / 521 |
| follows | 140 |
| lastfm_accounts | 5 |
| calendar_entries | 4 |
| event_artists (line-ups) | 3,741 |
| festival_lineup | 6,259 (4,146 carry a day) |

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
| similar | 0.4% | **95%** |
| photo | 1.4% | **69%** |
| genre tags | 10.0% | **64%** |
| bio | 2.2% | 10% ← the one that stayed low, see below |

Downstream of the tags: **52% of upcoming events now carry a genre**, up from 10%. That
feeds MXS's `context` component and Tier B genre recommendations, both starved until now.

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

### Genres pruned, and the run order that silently undoes it

The tagging backfill took `genres` from 121 rows to 788, because Last.fm crowd tags
include artist names, countries, TV shows, record labels and private notes
(`Seen Live X7`, `Guys I Would Fuck`, `Funk_Add_To_Lidarr_Batch_1`). Pruned to **521**
while event coverage held at 53.2%, so no real coverage was traded away.

`prune_single_artist_genres` is now **dry-run by default** and returns the full drop and
keep lists, because its trade-off is real: a dry run showed it would have deleted 45
genuine genres — `Baroque`, `Bebop`, `Riot Grrrl`, `Honky Tonk`, `Jungle`, `Ranchera`,
`Stoner Doom`. `GENRE_WORDS` was written when 150 artists were tagged; at 1,003 it was
too thin. Added ~35 missing HEADS (`bop`, `wop`, `tonk`, `grind`, `crust`, `grrrl`,
`doom`, `phonk`, `baroque`, `quartet`…) — heads, not names, so one entry covers every
genre built on it. Deliberately did NOT add `mod`: it is a substring of "modern" and
would rescue `Modtoday` and friends. False deletions went 45 → ~6.

**`JUNK_MARKERS` + `publishable()` are new**, and they exist because a genre word can
RESCUE junk: `Funk_Add_To_Lidarr_Batch_1` survived on "funk". `publishable()` is applied
where tags become genre rows, in both the live path and the rebuild, while `artist.tags`
keeps the raw Last.fm answer — provenance and publication are different promises.

**RUN ORDER, and it is silent when wrong:** `reapply_cached_tags` CREATES any genre it
does not hold, from the cached tags. Running it after the prune puts everything back —
measured here as 753 → 788, a net increase that looked like success. **Rebuild first,
prune LAST**, because the prune counts artists per genre and needs the links to exist.
The docstring now says so.

### Event page: genres on the artwork, a line-up you can tap through

Genres moved from under the About paragraph onto the hero image, over a `LinearGradient`
scrim — without it the chips vanished on pale photos. Tapping any artist in the line-up
opens their page, nested the way the artist page nests its own similar-artists strip; a
single-artist bill skips the sheet and goes straight through. Avatars show real photos,
falling back to initials rather than borrowing another act's face.

**The line-up was empty on 99% of events and the data was already being fetched.** It
reads `event_artists`, and only `upsert_event` ever wrote those rows — the broad sweep,
which produced almost the whole catalogue, wrote none. But the parser read
`_embedded.attractions` and kept only `atts[0]` as headliner, discarding the bill. And
`reverify_all_events` re-fetches every event by TM id nightly through that same parser, so
those bills were downloaded and thrown away every night. `_batch_upsert_search` now writes
them: **zero extra API calls, and it keeps filling itself nightly.** Bill coverage went
1.1% → **47%** (1,758 of 3,769), with 607 events carrying a real support act.

`EventDetail` also falls back to the headliner when no bill is stored — not a guess, since
Ticketmaster named them and they are unarguably on the bill.

### Listings that say they are not a ticket

Reported as a Get-tickets button 404ing. The URL was Ticketmaster's OWN — their API still
returns it, still says `status: onsale`, sale window open — and all five URL variants 404
on their own site. There is no API signal to detect this; they serve stale data, and we
cannot verify links server-side because Ticketmaster 401s every non-browser request.

The real defect was upstream: `Diljit Dosanjh | Vinyl Room Upgrade (TICKET NOT INCLUDED)`
is not a show. Both ingestion paths now skip listings that DECLARE no ticket is included
(`ingestion.is_not_attendable`), and 18 rows were removed.

**Only self-declaring phrases are matched, and the restraint is the point:** of 17 upcoming
listings containing "hotel", EIGHT were real concerts at hotel-named venues — Derek Ryan at
Castlecourt Hotel, Foster & Allen at Celtic Ross Hotel. "hotel" as a keyword would have
deleted real shows. VIP Packages and Ticket+Hotel bundles are deliberately KEPT: those do
include a ticket, so they are attendable, merely redundant packagings of one show.

### Search: as you type, ranked by relevance, one toggle one kind

The box only ran on submit — `onChangeText` stored the text, `onSubmitEditing` did the
work. The backend was never the problem; `search-local` always matched on a substring.

**Two debounces, and the split matters:** 250ms for our DB and the in-memory festival list
(free, this is what feels live), 900ms for the live Ticketmaster supplement. Ticketmaster
allows 5,000 calls a DAY and the sweep plus nightly re-verify spend most of it, so that one
must never fire per keystroke. Both trailing, so continuous typing costs exactly one live
call. Each pass carries a sequence number and discards its result if a later keystroke
bumped it.

**Ranked by WHERE the term matched**, then date within each band: title-starts-with, then
title-contains, then artists on the bill, then city last. Date alone put Corona Capital
SIXTH for "corona", behind a gospel tour in Corona, California. Also escaped the LIKE
wildcards — a search for "50%" was matching the entire catalogue.

**Each toggle now shows only its own kind.** Concerts rendered Artists + Concerts +
Festivals; Festivals did the same. This also removed a Deezer request per keystroke, and
fixed `nothing`, which required all three kinds to be empty and so hid "No results".

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

## Festivals — the whole of day two

Festivals were a dead end: no `GET /festivals/{id}`, no detail component, and
`FestivalCard`'s `onPress` passed by NONE of its four call sites. Now they have a page,
a day-by-day bill, and a search that matches the concert side.

**418 rows → 509 real festivals, 92 with a day-by-day line-up.**

### The bottleneck was one line, not the keywords

```python
if not tm_id or not name or "festival" not in name.lower(): continue
```

Every listing whose TITLE lacked the literal word was fetched and discarded. Creamfields
sells `Creamfields 2026 - Parking - Weekend Camping`; Download sells `Download 2027 -
Charge Candy` and not one of its listings says festival. Widening the keyword list without
fixing this moved the count by 14 — the honest measure of how little it achieved alone.

A listing now qualifies on evidence: a festival word in its own name, OR we asked for that
festival BY NAME and it says the name back, OR **10+ acts on the bill**.

### Bill size is the signal a name cannot give

Measured over every upcoming event: at 10+ acts the list is Corona Capital (71), Louder
Than Life (50), Aftershock (36), Bourbon & Beyond, Oceans Calling — festivals every one.
Corona Capital was sitting under Concerts as **15 event rows**.

This is the inverse of the mistake the old code documented. "multi-day OR 3+ acts" threw
out both Coachella weekends, because a SMALL bill proves nothing. A large one does.

### Named keywords were MEASURED, never guessed

Kept, with what each rescues that the generic net cannot: Download 30, Latitude 28,
Time Warp 19, EDC 14, DGTL 1. **Rejected on the same measurement**, because what they
rescued was not the festival: Movement 58 → "Improvement Movement", Ultra 17 → "Ultra
Sunn", Leeds 10 → a city, Exit 7 → "Last Exit", Boomtown 2 → "Boomtown Rats", ADE 7 →
club nights. Awakenings, Sonar, Lowlands, Wireless, Sonic Temple rescued **nothing**.

### Merging, and the traps in it

`services/festival_merge.py` groups by base name AND city, breaking a cluster on a gap
over 3 days — `Discovery Festival 2027` is THREE festivals (Plymouth/Dundee/Darlington)
and ACL's two weekends are separately ticketed. Festivals also cluster on the **BILL**
(same city, dates within 3 days, 60%+ identical line-up), because `Abono General 3 días
Corona Capital 2026` and `Individual Banamex Plus Corona Capital 2026` share no prefix.
Survivor named from the common prefix, falling back to the common **suffix** — Ticketmaster
puts the festival name LAST in a ticket title.

**Days come from each listing's own date**, never from reading a weekday out of a title.
A multi-day listing labels nothing: its bill is the whole festival and we do not know who
plays when. Unlabelled means "on the bill, day not announced" — a different claim.

### One listing, one home

117 Ticketmaster ids existed in `events` AND `festivals`; ARC Music Festival was four
concert rows under Concerts and the festival simultaneously. Fixed at three layers: the
duplicates removed, the concert sweep skips anything the festival side owns, and the
reconcile runs after BOTH sweeps.

ARC was still wrong after that — `7 September, no end date, 1 act` — because listings
sharing a name exactly reuse one row and each assigned its dates in turn, so only the LAST
survived. Dates now EXPAND; reuse requires dates within 14 days so next year's edition
cannot stretch the span across twelve months.

### Search, matching the concert side exactly

`/festivals/search` (ours, ranked: whole word → prefix → substring → artist on the bill →
city) at 250ms, and `/festivals/search-live` (one Ticketmaster request, stores what it
finds) at 900ms. Festival search had been filtering the first 100 of 507 on the device —
four in five unreachable, which is why "ade" returned "BULL BRIGADE" while Corona Capital
could not be found at all.

## What no source can fix

**Ticketmaster is the ONLY source.** All 928 festival source rows say `ticketmaster`.
Inside its feed: ticketmaster.com 687, ticketweb 135, universe 70, moshtix 18, **frontgate 0**.

Measured 2026-08-25, Ticketmaster returns **zero** listings for: Bonnaroo, Glastonbury,
Tomorrowland, Primavera Sound, Wacken, Hellfest, Sziget, Governors Ball, Hangout, Railbird.
There is no listing named "Amsterdam Dance Event" — the 21 "ADE" results are club nights
during ADE week, mostly matched on the venue attraction "Ademelkweg", and they are
genuinely concerts.

Sources tested and ruled out, all on 2026-08-25:

| source | finding |
|---|---|
| **Eventbrite** | public search API removed Dec 2019, off Feb 2020 |
| **Songkick** | paid licence; "not approving API requests for student, educational or hobbyist purposes" |
| **Bandsintown** | artists only, one artist per key |
| **Front Gate** | organiser-only API — you would have to be their ticketing client |
| **Wikidata** | 7,454 festivals but only **2** with a date after Aug 2026; 7,203 have no date. A worldwide DIRECTORY, not a feed |
| **MusicBrainz** | 164 upcoming with dates, free, no key — but an archive: Bonnaroo 2007, ADE 2018, nothing upcoming for big names |
| **PredictHQ** | **untested** — 14-day trial, no card. The only serious candidate left |

**There is no free API listing all music festivals worldwide.** The realistic path is a
curated table of the ~50 names a CEO will search (Wikidata gives the checklist), and a
PredictHQ trial where the FIRST thing to do is search ADE, Bonnaroo, Glastonbury and
Tomorrowland before writing any integration.

## Open bug: Android NPE on a key press (upstream React Native)

An EAS dev build on Android died with:

```
java.lang.NullPointerException
  at com.facebook.react.ReactActivityDelegate.onKeyDown(ReactActivityDelegate.java:215)
  at com.facebook.react.ReactActivity.onKeyDown(ReactActivity.java:101)
  ... AsyncInputStage -> ImeInputStage.onFinishedInputEvent -> dispatchKeyEvent
```

**This is a React Native bug, not ours.** Nothing in `frontend/src` is in the stack.
RN declares the delegate nullable and then refuses to allow it:

```java
// ReactActivity.java:85
public @Nullable ReactDelegate getReactDelegate() { ... }
// ReactActivityDelegate.java:215
return Objects.requireNonNull(mReactDelegate).onKeyDown(keyCode, event);
```

`mReactDelegate` is assigned ONLY in `onCreate` (lines 148/152) and never cleared, so it
is null only when a key event reaches the Activity before `onCreate` finished. The trace
goes through `AsyncInputStage`, meaning the soft keyboard QUEUED a keystroke and Android
delivered it later — to an Activity that was still starting or had just been recreated
(dev reload, config change, or resume after being killed). The NPE is uncaught inside
`dispatchKeyEvent`, so the process dies. `onKeyUp` and `onKeyLongPress` have the same
flaw; all 17 delegate call sites use `requireNonNull` with no guard.

**Cannot be fixed from JavaScript.** The fix is a config plugin patching `MainActivity`:

```kotlin
override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
  if (reactDelegate == null) return false   // React is not ready; do not let it throw
  return super.onKeyDown(keyCode, event)
}
```

Do NOT call `super` when the delegate is null — `ReactActivity.onKeyDown` is what throws.
Returning false means "not handled", which is correct: React genuinely cannot handle it
yet. Guard `onKeyUp` and `onKeyLongPress` the same way.

Native changes need a **new EAS dev build** before they can be tested, which is the only
real cost here. Not yet built, because the frequency is unknown — worth doing next time a
dev build is needed anyway. `adb` is NOT installed on this machine; installing
platform-tools would let `adb logcat` confirm whether the process actually dies.

## Gotchas — read before debugging

- **Run the app. `tsc` proves nothing here.** Seven bugs shipped through a clean typecheck.
- **Detail screens must NOT import each other.** `artist-detail` takes `onSelectEvent` and
  `onSelectFestival` as CALLBACKS for exactly this reason. Importing `festival-detail` from
  `artist-detail` made a require cycle — "can result in uninitialized values" — because
  `festival-detail` already imports `artist-detail` for its line-up. One-way only:
  `festival-detail → artist-detail` and `event-detail → artist-detail`.
- **Ingest first, reconcile last.** Bitten three times in two days: the genre prune undone
  by `reapply_cached_tags`, the festival merge undone by `fest.name = p["name"]`, and 4
  deleted rows restored by a long-running import holding pre-fix code in memory.
- **A long-running import holds the code it started with.** 4 deleted add-on listings came
  back because `reverify_all_events` was mid-run with the pre-filter code in memory and
  re-inserted them in its final write. A data cleanup during an import gets undone.
- **Ticketmaster 401s every non-browser request**, so link liveness cannot be checked from
  the server. Their API also serves events whose own pages have been pulled. Chrome
  automation is the only way to confirm a 404.
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

**1. Bios land at ~10% while everything else cleared 60%.**
`wikipedia.fetch_artist_bio` only accepts a page whose short description reads musical and
is not a disambiguation stub. That strictness is what stops the wrong namesake's biography
appearing, so it was NOT loosened — but it is probably also rejecting artists who do have a
real page. Sample 20 of the rejects by hand before touching the filter. Nothing is stored
wrongly and nothing is stamped, so a later run retries them for free.

**2. Ticketmaster billing strings are stored as artists** — e.g. `A.R. Rahman feat. Alka
Yagnik; Udit Narayan; Sukhwinder Singh; Shankar Mahadevan; Shaan & Sehar`. Not
duplicates, so `dedupe.py` correctly leaves them, but they look like junk in search. A
cleanup would split on `feat.` / `;` / ` and ` and attach the real artists to the event.

**3. Accented duplicates are a known gap.** `artist_lookup.key` strips punctuation but
NOT accents, because the key must match what Postgres computes and `unaccent` is not
installed. So `Beyoncé` and `Beyonce` would still become two rows. Every duplicate
actually measured was case or punctuation.

**4. The three missing tabs** — Passport, Trips, Bucket List — backed by ten tables no
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
