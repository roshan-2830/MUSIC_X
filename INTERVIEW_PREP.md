# Music X — Interview Preparation Guide

*A plain-English walkthrough of the whole project. No jargon left unexplained. Read this and you'll be able to talk about Music X confidently, even the parts you didn't write yourself.*

---

## PART 1 — The 30-second version (memorise this)

> **Music X is a mobile app that helps people discover live concerts worth travelling for, decide whether to go, and keep the whole trip — ticket, hotel, flights — in one place.**
>
> Its guiding idea is **trust**: every fact the app shows comes from a real source, and when we don't know something, we say "we don't know" instead of guessing. We never make up a number to fill a gap.

If you remember only one sentence, remember that one. Almost every technical decision in the project flows from it.

**The golden rule has a name: "absence over guess."** When in doubt, the app shows *less* rather than showing something that might be wrong. Examples:
- If we can't confidently match an artist's photo, we show their **initials**, never a lookalike's face.
- A concert rating skips any ingredient we have no data for, instead of substituting an average.
- If a fact disappears from its original source, we **delete** it — we don't keep showing something we can no longer stand behind.

---

## PART 2 — The building blocks, explained like you're new

Every app like this has two halves. Think of a **restaurant**:

- The **frontend** is the dining room — what customers see and touch (menus, tables, the waiter). In our case, the phone/web app.
- The **backend** is the kitchen — where the actual work happens, hidden from customers (cooking, storage, suppliers). In our case, the server and database.

They talk to each other by passing messages back and forth over the internet.

### The technologies (and what each one actually is)

| Name | What it really is | Restaurant analogy |
|---|---|---|
| **React Native / Expo** | The toolkit used to build the phone app. Write the app once, it runs on iPhone, Android, *and* the web. | The dining room furniture and layout |
| **TypeScript** | The programming language of the frontend. It's JavaScript with a spell-checker that catches mistakes before customers see them. | A recipe written in a careful, checkable format |
| **FastAPI** | The toolkit used to build the backend. It receives requests ("show me concerts in London") and sends back answers. | The kitchen's order window |
| **Python** | The programming language of the backend. | The language the chefs speak |
| **PostgreSQL (Postgres)** | The database — a giant, super-organised set of spreadsheets that stores everything (concerts, artists, users). | The pantry and walk-in fridge |
| **Supabase** | A company that hosts our database *and* handles user login/passwords for us, so we don't build that from scratch. | The building landlord + the security guard at the door |
| **SQLAlchemy** | A translator that lets Python code talk to the database without writing raw database commands by hand. | The order-ticket system between waiters and pantry |
| **Alembic** | Keeps a numbered history of every change we make to the database's structure, so any computer can rebuild it identically. | A logbook of every renovation to the pantry |
| **Render** | The company that runs our backend server on the internet 24/7. | The commercial kitchen we rent |
| **Vercel** | The company that hosts our web version of the app. | The storefront location |

**The size of it:** roughly **17,500 lines of Python** (backend) and **20,000 lines of TypeScript** (frontend). It's a real, substantial project.

---

## PART 3 — How the app is organised (the file tour)

You don't need to memorise file names. You need to understand the *groups* of files and what each group does. Here's the whole thing.

### 🖥️ THE BACKEND (`backend/` folder) — the kitchen

The backend is organised into a few clear layers. Data flows through them like an assembly line.

#### 1. `app/models/` — "What things exist" (40 files → 42 database tables)

Each file here defines the **shape** of one kind of thing we store. Think of them as blank forms:
- `event.py` — a concert (has a title, date, venue, price…)
- `artist.py` — a musician (name, photo, follower count…)
- `venue.py` — a place shows happen (name, city, capacity…)
- `festival.py`, `city.py`, `review.py`, `profile.py` (a user), `calendar_entry.py` (a show someone saved), `hotel_booking.py`, `travel_leg.py` (a flight or train), and so on.

> **If asked "what's a model?"** → "It's the definition of one type of record in the database — like a blank form that says what fields a concert or an artist has."

#### 2. `alembic/versions/` — "The database's renovation history" (41 files)

Every time we added or changed a table, we wrote a small numbered file describing that change. Run them all in order on a fresh, empty database and you get the exact structure we use. This is how we moved the entire database from one hosting account to another without losing anything. These changes are called **migrations**.

> **If asked "what's a migration?"** → "A recorded, replayable change to the database's structure. It means anyone can rebuild the database identically, and we can upgrade it safely without losing data."

#### 3. `app/services/` — "The actual brains" (39 files) ⭐ THE MOST IMPORTANT FOLDER

This is where the real thinking happens. If the models are the *nouns*, services are the *verbs*. A few you should be able to describe:

- **`scoring.py`** — calculates the **MXS score** (explained in full in Part 4). *This is the star of the project.*
- **`trust.py`** — decides how confident we are in each piece of info (high / medium / low).
- **`plan.py`** — works out what stage a user is at with a show (interested → planning → confirmed → attended).
- **`provenance.py`** — records the "receipt" for every fact: where it came from and when we last checked it.
- **`ingestion.py`** — pulls new concerts *in* from Ticketmaster and cleans them up.
- **`enrichment.py`** — fills in artist details (photo, bio, similar artists) ahead of time so pages load instantly.
- **`ticketmaster.py`, `deezer.py`, `lastfm.py`, `wikipedia.py`, `setlistfm.py`…** — one file per outside data source we pull from.
- **`archive.py`** — safely deletes old, unwanted concerts so the database doesn't overflow.
- **`push.py` / `webpush.py`** — send notifications to phones and browsers.

> A lovely detail you can mention: **almost every file in this folder starts with a few paragraphs explaining *why* it was built that way, what was tried first, and what broke.** The code documents its own reasoning. Interviewers love that.

#### 4. `app/api/routes/` — "The order window" (17 files, 96 endpoints)

These define the **web addresses** the frontend can call to ask for things. Each is like a specific window at the kitchen:
- `events.py` — "give me concerts"
- `me.py` — "give me *my* saved shows and bookings"
- `search.py` — "find shows matching this text"
- `plan.py`, `bookings.py`, `trips.py`, `festivals.py`, `artists.py`, `reviews.py`, `notifications.py`, etc.

An **endpoint** is one specific request the app can make, like `GET /events` ("get the list of events"). There are 96 of them.

> **If asked "what's an API endpoint?"** → "A specific web address the app can call to get or change data. Like a phone extension — dial `/events` and you get concerts back."

#### 5. `app/schemas/` — "The shape of each answer"

These define exactly what fields go *out* in each response, so the frontend always knows what it's getting. A quality-control checkpoint on the way out of the kitchen.

#### 6. `app/scheduler.py` + `app/main.py` — "The manager"

- `main.py` is the **front door** of the backend — it starts everything up and lists all the order windows.
- `scheduler.py` runs **background jobs on a timer** (explained in Part 6) — like a night-shift worker who restocks the pantry while the restaurant is closed.

#### 7. `app/core/` — settings and security (config, login-checking).

### 📱 THE FRONTEND (`frontend/` folder) — the dining room

#### `src/app/` — the 6 main screens

These are the actual tabs of the app:
- `index.tsx` — **Home** (discover concerts)
- `search.tsx` — **Search**
- `calendar.tsx` — **Calendar** (your saved shows by date)
- `trips.tsx` — **Trips** (your travel plans)
- `me.tsx` — **Me** (your profile, bookings, passport)
- `_layout.tsx` — the frame that wraps all of them (the tab bar at the bottom)

#### `src/components/` — the 49 reusable pieces

Screens are built out of smaller Lego bricks called **components**. Examples:
- `event-card.tsx` — the little concert tile you see in a list
- `event-detail.tsx` — the full concert page
- `artist-detail.tsx` — an artist's page
- `my-shows.tsx` — all your saved shows, sorted into tabs
- `my-bookings.tsx` — the **trip ledger**: ticket + hotel + travel for each show, with total spend
- `festival-detail.tsx`, `reviews.tsx`, `passport.tsx`, `plan-trip.tsx`, `notifications-modal.tsx`, and so on.

> A neat design choice: in this app, full pages open as **pop-up overlays (modals)** rather than separate web addresses. It keeps navigation simple.

#### `src/lib/` — the plumbing

- **`api.ts`** (1,524 lines) — ⭐ the single file that knows how to call *every* backend endpoint. If the frontend needs data, it goes through here. A great "start here" file.
- `auth.tsx` — handles login/logout and remembers who you are.
- `supabase.ts` — the connection to Supabase (database + login).
- `saves.tsx`, `wishlist.tsx`, `profile.tsx`, `toast.tsx`, `format.ts` — smaller helpers.

#### `src/hooks/`, `src/constants/`, `src/global.css` — theming (light/dark mode), colour schemes, and phone-notification setup.

---

## PART 4 — MXS: the scoring system (the crown jewel) ⭐

**This is the single most impressive part of the project. Be ready to explain it.** It lives in `services/scoring.py` (775 lines).

### The problem it solves

There are 21,000+ concerts in the database. How do you tell the user *which ones are actually special* — a once-in-a-lifetime farewell tour vs. a cover band at a local pub? You need a score.

### The MXS ("Music Experience Score")

Every concert gets a score out of 10, built from **five ingredients**, each weighted by importance:

```
MXS = 35% Artist  +  25% Rarity  +  15% Venue  +  15% Production  +  10% Context
```

| Ingredient | Plain meaning | Where the data comes from |
|---|---|---|
| **Artist** (35%) | How big/loved is the act? | Deezer follower counts (Last.fm as backup) |
| **Rarity** (25%) | How rare is this show? (farewell tour? only UK date?) | Our own "tour map" — how many dates this tour has |
| **Venue** (15%) | How significant is the place? | Wikidata (venue capacity) |
| **Production** (15%) | Is it a big produced show? | Promoter + seating-map info |
| **Context** (10%) | Anything special? (anniversary, tour finale, festival) | Event details |

### Four clever things about it (these are your "wow" talking points)

1. **It never fakes a missing ingredient.** If we have no venue data, we don't guess — we *drop* that ingredient and re-balance the other four. An honest score from real data beats a complete-looking score built on invention.

2. **It's a ranking, not a raw measurement.** A show's score depends on *how it compares to all the other shows*. Only the top ~2% ever reach 9.0+. This has a fascinating consequence: **adding new concerts can change everyone else's score**, because the rankings shift. That's why the scoring job has to re-rank the *whole* catalogue at once — it can't score a single show in isolation.

3. **Ties are broken on a fixed rule.** Early on, two shows with identical scores kept randomly swapping places every time the job ran, making scores "drift" for no reason. The fix: when scores tie, always break the tie the same way (by the event's ID). This stopped 3,094 scores from wobbling on data that never changed.

4. **Rarity can't be trusted alone.** By itself, the rarity ingredient once ranked a *"Class of '97 Reunion Concert"* at a perfect 10.0 — above Bob Dylan — just because the word "reunion" appeared. Lesson: no single signal gets to decide; they balance each other.

**One more honest touch:** if an artist has fewer than 5,000 listeners, we don't try to rank them precisely — we just place them at the bottom. Ranking total unknowns against each other made "slightly less unknown" look like "famous," which is misleading.

**Every score keeps its receipts.** Alongside the number, we store *why* — which ingredients were used, their weights, and which were missing. The app shows all of it, so the score is never a mysterious black box.

> **If asked "how does the recommendation/scoring work?"** → Walk through the five ingredients, then hit the "it never fakes missing data" and "it's a ranking so scores shift as the catalogue grows" points. That shows you understand it deeply.

---

## PART 5 — "Plan states": knowing where a user is with a show

In `services/plan.py`. As you engage with a concert, you move through four stages:

**Interested → Planning → Confirmed → Attended**

- **Interested** — you saved it
- **Planning** — you've booked a hotel or invited a friend
- **Confirmed** — you have a ticket
- **Attended** — the show has happened *and* you had a ticket

**The clever design:** these stages are **worked out fresh every time, never stored as a manual step.** The app looks at the facts (do you have a ticket? a hotel? has the date passed?) and *calculates* your stage on the spot.

Why this matters (a genuinely good engineering point): if the stage were a stored setting that features had to remember to update, sooner or later some feature would forget — and you'd be stuck on "Interested" even though you'd booked a hotel. By *deriving* it from facts, **nothing can ever fall out of sync.**

---

## PART 6 — Background jobs: the night-shift workers

In `app/scheduler.py`. These run automatically on timers, keeping everything fresh without anyone clicking a button:

| Job | How often | What it does |
|---|---|---|
| `sweep_catalogue` | every 3 hrs | Find brand-new concerts and festivals |
| `refresh_catalogue` | every 3 hrs | Re-check shows happening within 7 days |
| `refresh_catalogue_deep` | daily | Re-check *every* show |
| `enrich_catalogue` | daily | Fill in artist photos, bios, tags |
| `reminders` | hourly | Send "on sale now" / "show is this week" alerts |
| `push_delivery` | every 2 min | Actually deliver notifications to phones |
| `archive_past_events` | daily | Delete old shows nobody saved |

**Why two refresh speeds?** A cancellation matters most for a show someone has a ticket to *this week*, so those get checked often (every 3 hrs); the rest can wait for the daily deep pass. Splitting them this way cut the daily workload by **85%**.

---

## PART 7 — The performance crisis (a great story to tell)

This shows you understand real-world engineering, not just writing code.

### What happened
Our database host (Supabase) has a free-tier limit: only 5 GB of data may *leave* the database per month. One month, our own background jobs used **13.9 GB** — and got the project cut off. Only 5 real users existed; the jobs were the culprit.

### The four fixes (all about being less wasteful)

1. **Ask only for what you need.** The code was fetching *all 29 columns* of every concert every time — including a big block of ticket small-print it never used (one show carried 581 bytes about handbag sizes at Wembley). Fetching only the 6 needed columns cut each row from ~1,255 bytes to ~458 bytes.

2. **Don't redo work that hasn't changed.** The scoring job ran ~700 times a month, almost always producing *identical* results because nothing underneath had changed. We added a **fingerprint** — a quick summary of the input data. If the fingerprint matches last time's, skip the whole job. Runs dropped from ~700 to ~20 a month.

3. **Don't accidentally re-fetch rows.** A subtle database quirk was causing 13,891 wasted extra fetches per run. Fixed by holding onto lightweight IDs instead of full records.

4. **Batch your questions.** The database was being asked 661,017 tiny separate questions (each taking 27 milliseconds — that adds up to *five hours* of waiting). Bundling them into batches turned five hours into seconds.

### The result
```
Scoring job:  37 MB → 7 MB       11 minutes → 21 seconds
Monthly data leaving DB:  ~11 GB → ~140 MB
```

> **If asked about a hard problem you solved / debugging** → this is your answer. The theme: *"the bottleneck wasn't the users, it was our own inefficient code, and the fix was about asking the database less wastefully."*

**Honest note you can add:** three other files (`festival_merge.py`, `event_merge.py`, `alerts.py`) still have the same wasteful pattern and are the next things to fix. Knowing what's *not* yet fixed shows maturity.

---

## PART 8 — Where the data comes from (external sources)

The app doesn't invent concerts — it gathers them from real services and combines them:

| Source | What we get from it |
|---|---|
| **Ticketmaster** | The core catalogue: events, venues, prices, seat maps (limit: 5,000 requests/day) |
| **Deezer** | Artist follower counts (the main popularity signal), photos |
| **Last.fm** | Listener counts (backup signal), genre tags, similar artists |
| **setlist.fm** | What songs an artist plays live; a user's past gigs |
| **Wikipedia** | Artist biographies (always stored with the source link) |
| **Wikidata** | Venue capacities |
| **Bandsintown** | Extra tour dates Ticketmaster misses |
| **OpenStreetMap** | Restaurants/bars near a venue |
| **Tripsure** | Hotels and flights |
| **Expo / Web Push** | Sending notifications to phones and browsers |

**Three lessons the team learned about outside data** (good to mention — they show carefulness):
- **Test a source before building on it.** Four services were going to supply concert reviews; on inspection, *none of them actually had concert reviews*. Better to find out first.
- **Match on IDs, not names.** Asking setlist.fm for "Coldplay" *by name* returned a tribute band's set from an Italian beer festival. Using a unique ID instead avoids that.
- **Only record a check when it actually succeeded.** If a request gets rate-limited (temporarily blocked), don't mark it "checked — nothing here," or you'll never look again.

---

## PART 9 — How it's deployed (put on the real internet)

- **Backend** runs on **Render** (a server host), in Singapore, reachable at `musicx-api.onrender.com`.
- **Web app** runs on **Vercel** at `music-x-five.vercel.app`.
- **Database + login** live on **Supabase**.

**One honest limitation:** the current hosting is on **free plans**. The free server "falls asleep" after 15 minutes of no traffic (so background jobs pause), and the free database has a 500 MB size limit we're slowly approaching. Moving to paid plans (a few dollars a month) is the main thing needed before a real public launch. *Being able to name your project's real constraints is a strength in an interview, not a weakness.*

---

## PART 10 — Honest gaps (say these calmly; they show self-awareness)

- **No automated tests yet.** Verification has been done by running the app and measuring, not by an automated test suite. This is openly acknowledged as the biggest structural gap.
- Venue-size data only covers ~13% of shows (public databases know arenas, not small clubs).
- Artist biographies cover only ~10% of artists (we're strict — we'd rather show nothing than the wrong person's bio).
- Some features have tables built but aren't finished yet (bucket list, referrals, a "year in review" feature).

> Framing tip: pair every gap with the *reason*. "We have no tests yet, but every change was verified by running the real app because a passing type-check had let real bugs through." That turns a gap into a considered trade-off.

---

## PART 11 — The rules that shaped everything (the philosophy)

Every one of these was learned by getting it wrong first. They all serve the "absence over guess" rule:

- **Never invent a value.** Show the gap instead.
- **Never turn an email into a name.** `jadhav.r@…` is not the name "Jadhav."
- **A photo needs an exact match**, or we show initials — a tribute act wearing the real star's face is a lie the user can't detect.
- **Bios are Wikipedia-only, stored with the real link** — never a guessed one.
- **A fact that vanishes from its source gets deleted**, not kept.
- **Never convert currencies** — the trip ledger shows "£309 + €240", because two correct numbers beat one confident-but-wrong converted total.
- **Dates show in the venue's timezone** — a concert happens on one specific day where it is, not where you're standing.

---

## PART 12 — Likely interview questions & how to answer

**Q: "Tell me about this project."**
> "Music X is a live-music discovery app built around trust. It pulls concerts from sources like Ticketmaster, scores each one on how special it is, and helps users plan the whole trip — ticket, hotel, travel — in one place. The core principle is 'absence over guess': every fact has a source, and where we don't know something, we say so rather than inventing a plausible value. It's a React Native app with a Python/FastAPI backend and a Postgres database on Supabase."

**Q: "What was the hardest problem?"**
> The performance crisis (Part 7). Our own background jobs blew through the data limit and got us cut off. Explain the fingerprint fix and the "only fetch the columns you need" fix.

**Q: "How does the scoring work?"**
> The five MXS ingredients (Part 4), then the "never fakes missing data" and "it's a ranking, so scores shift as the catalogue grows" points.

**Q: "What would you do next / what's not done?"**
> Add automated tests; fix the three remaining wasteful files; move off the free hosting tiers; finish the account-deletion flow needed for the App Store.

**Q: "What did you learn?"**
> That honesty in software is a technical discipline, not a slogan — deriving state from facts instead of storing it, deleting facts you can't verify, and measuring real behaviour instead of trusting that code "should" work. (Add: *"a type-check passed clean while seven real bugs shipped — so we verify by running the actual app."*)

**Q: "What does the frontend/backend split mean?"** → Restaurant analogy (Part 2).

**Q: "What's a database migration?"** → Part 3, section 2.

---

## PART 13 — Mini-glossary (say these without flinching)

- **Frontend** — the part users see and touch (the app screens).
- **Backend** — the hidden server that does the work and stores data.
- **API / endpoint** — a specific web address the app calls to get or send data.
- **Database** — organised permanent storage (like giant smart spreadsheets).
- **Model / schema** — the defined shape of one kind of record.
- **Migration** — a recorded, replayable change to the database's structure.
- **Service** — a backend file containing real logic (scoring, trust, planning).
- **Component** — a reusable visual piece of the app (a card, a button, a page).
- **Background job / scheduler** — code that runs automatically on a timer.
- **Deploy** — to put the app onto the real internet for others to use.
- **Egress** — data *leaving* the database (what got us rate-limited).
- **MXS** — Music Experience Score, our 0–10 rating of how special a concert is.
- **Provenance** — the record of where a fact came from and when it was last checked.

---

### Final confidence tip
You don't need to have written every line to speak about this project well. Interviewers care that you **understand how the pieces fit and why decisions were made.** The single strongest theme you can keep returning to is: **"We chose honesty over the appearance of completeness — and that one principle explains almost every design choice in the app."**

Good luck. 🎤
