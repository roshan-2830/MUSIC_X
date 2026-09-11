import { supabase } from "./supabase";
import { Platform } from "react-native";
import Constants from "expo-constants";

function resolveBaseUrl(): string {
  // A deployed build has no route to the machine that built it, so the URL has to be baked in
  // at export time. EXPO_PUBLIC_ vars are substituted into the bundle by Metro, which is why
  // this is read here and not fetched at runtime.
  //
  // MUST be https in production: the web app is served over TLS, and a browser refuses an
  // http:// call from an https:// page as mixed content — silently, in the network tab.
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  // Trailing slash stripped because every call site below appends its own "/path".
  if (configured) return configured.replace(/\/+$/, "");

  // Unset → local development, where the API is on this same machine.
  // Web runs on the Mac itself → localhost works.
  if (Platform.OS === "web") return "http://localhost:8000";
  // On a phone/emulator, use the same host Expo is served from (your Mac's LAN IP).
  // hostUri only exists while the Expo dev server is serving the app; in a production
  // build it is empty, which is exactly why the override above has to come first.
  const host = (Constants.expoConfig?.hostUri ?? "").split(":")[0];
  return host ? `http://${host}:8000` : "http://localhost:8000";
}

export const API_BASE_URL = resolveBaseUrl();

export type MusicEvent = {
  id: string; title: string; starts_at: string | null; timezone: string | null;
  // The resolved headliner, so a list can be grouped or varied by ARTIST rather than by
  // parsing the title. Ticketmaster bills one tour inconsistently ("Foo Fighters: TAKE
  // COVER TOUR 2026" and "FOO FIGHTERS - TAKE COVER TOUR 2026" are the same run), so the
  // id is the only reliable key. Null when the headliner is TBA.
  headliner: string | null; headliner_artist_id: string | null;
  status: string; venue_name: string | null; city: string | null; country: string | null;
  mxs: number | null; confidence: string | null;
  price_from_amount: number | null; price_from_currency: string | null;
  image_url: string | null;
};
export type ArtistOut = { name: string; is_headliner: boolean; image_url: string | null };
export type OfferOut = { seller_name: string; url: string | null; is_official: boolean; is_face_value_resale: boolean };
export type EventFact = {
  key: string;
  label: string;
  value: string;      // verbatim, exactly as the source wrote it
  display: string;    // the same fact, rendered for a human
  source_name: string | null;
  source_url: string | null;
  trust_tier: string | null;
  last_verified: string | null;
  derived: boolean;   // true = read out of the listing text, not a structured field
  snapshot: string | null;
};
export type MissingFact = { key: string; label: string };
export type EventDetail = MusicEvent & {
  /** Where the venue is. Null when Ticketmaster gave us no coordinates (36 of 2,024
   *  venues) — the screen then shows no map rather than one centred on a guess. */
  venue_lat?: number | null;
  venue_lng?: number | null;
  description: string | null;
  mxs_breakdown: Record<string, any> | null;
  last_verified: string | null;
  artist_bio: string | null;
  artist_bio_source: string | null;
  lineup: ArtistOut[];
  genres: string[];
  offers: OfferOut[];
  facts: EventFact[];
  missing_facts: MissingFact[];
};

// ---- search & browse filters ----
// One shape, one serialiser, four endpoints. The server holds the matching definition in
// services/search_filters.py; if these two ever disagree the funnel means different things
// on different screens, which is the bug this arrangement exists to prevent.
export type SearchFilters = {
  when?: "today" | "tomorrow" | "weekend" | "d7" | "month" | "m3" | "custom" | null;
  from?: string | null;          // YYYY-MM-DD, only with when: "custom"
  to?: string | null;
  country?: string | null;
  cityId?: string | null;
  onsale?: "now" | "coming" | null;
  rating?: number | null;        // 8 or 7
  following?: boolean;
  hideOff?: boolean;             // hide cancelled & postponed
  sort?: "soonest" | "rating";
  kinds?: ("concerts" | "festivals" | "artists")[] | null;
};

export const NO_FILTERS: SearchFilters = {};

// How many the user actually set — the number on the funnel badge. Sort is excluded: it is
// always set to something, so counting it would leave the badge permanently on.
export function countFilters(f: SearchFilters): number {
  return [f.when, f.country, f.cityId, f.onsale, f.rating, f.following || null,
          f.hideOff || null, f.kinds && f.kinds.length ? true : null]
    .filter(Boolean).length;
}

// The device's own zone, so "today" means the user's today rather than the server's.
// Wrapped because Intl can throw in odd runtimes, and a search must not die over a label.
function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function applyFilters(params: URLSearchParams, f: SearchFilters = {}) {
  if (f.when) params.set("when", f.when);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.country) params.set("country", f.country);
  if (f.cityId) params.set("city_id", f.cityId);
  if (f.onsale) params.set("onsale", f.onsale);
  if (f.rating) params.set("rating", String(f.rating));
  if (f.following) params.set("following", "true");
  if (f.hideOff) params.set("hide_off", "true");
  if (f.sort) params.set("sort", f.sort);
  (f.kinds ?? []).forEach((k) => params.append("kind", k));
  params.set("tz", deviceTz());
  return params;
}

export async function fetchEvents(
  sort: "date" | "mxs" = "date",
  limit = 50,
  cityId?: string,
  country?: string,
  filters: SearchFilters = {}
): Promise<MusicEvent[]> {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (cityId) params.set("city_id", cityId);
  if (country) params.set("country", country);
  applyFilters(params, { ...filters, sort: undefined });   // browse has its own sort param
  const res = await fetch(`${API_BASE_URL}/events?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
export async function fetchEvent(id: string): Promise<EventDetail> {
  const res = await fetch(`${API_BASE_URL}/events/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function searchEvents(q: string): Promise<MusicEvent[]> {
  const res = await fetch(`${API_BASE_URL}/events/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Instant search of events ALREADY in our database — no live Ticketmaster call.
export async function searchEventsLocal(q: string): Promise<MusicEvent[]> {
  const res = await fetch(`${API_BASE_URL}/events/search-local?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json();
}

// ---- auth-aware helpers ----
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  home_city_id: string | null;
  home_city_name: string | null;
  home_city_country: string | null;
};
export type City = { id: string; name: string; country: string };

export async function getMe(): Promise<Profile> {
  const res = await fetch(`${API_BASE_URL}/me`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function updateProfile(
  body: { display_name?: string | null; home_city_id?: string | null }
): Promise<Profile> {
  const res = await fetch(`${API_BASE_URL}/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getCities(q = "", limit = 100): Promise<City[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("limit", String(limit));
  const res = await fetch(`${API_BASE_URL}/cities?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getNearestCity(lat: number, lng: number): Promise<City> {
  const res = await fetch(`${API_BASE_URL}/cities/nearest?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export type CitySuggestion = { name: string; country: string; lat: number | null; lng: number | null };

// Search ALL world cities (OpenStreetMap) — any city, not just ones with shows.
export async function searchGlobalCities(q: string): Promise<CitySuggestion[]> {
  const res = await fetch(`${API_BASE_URL}/cities/search-global?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json();
}

// Our own cities that actually have upcoming shows, ranked by how many. Shown first
// in the picker so users pick the real "London" (with concerts), not an empty look-alike.
export type CityWithShows = { id: string; name: string; country: string; show_count: number };
export async function searchCitiesWithShows(q: string): Promise<CityWithShows[]> {
  const res = await fetch(`${API_BASE_URL}/cities/search-with-shows?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json();
}

// Turn a picked/detected place into a stored City (get-or-create), return it.
export async function resolveCity(input: CitySuggestion): Promise<City> {
  const res = await fetch(`${API_BASE_URL}/cities/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ---- saved shows ----
export async function getSaves(): Promise<MusicEvent[]> {
  const res = await fetch(`${API_BASE_URL}/me/saves`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
export async function saveEvent(eventId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/saves/${eventId}`, { method: "POST", headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}
export async function unsaveEvent(eventId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/saves/${eventId}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

// Saved festivals. Same table and same promise as a saved show, so the Calendar tab
// merges the two into one list — see lib/saves.tsx.
export async function getSavedFestivals(): Promise<Festival[]> {
  const res = await fetch(`${API_BASE_URL}/me/saves/festivals`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
export async function saveFestival(festivalId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/saves/festivals/${festivalId}`, { method: "POST", headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}
// ---- the Calendar page ----
// One window of time in one of two scopes. The grid, the strip and the agenda all read
// this same payload, so a dot and the card under it can never disagree.
export type CalendarEvent = MusicEvent & {
  saved: boolean;
  booked: boolean;
  // cancelled | postponed | ticket | plan | following | city
  tag_kind: string | null;
  genres: string[];
};
export type CalendarPayload = { events: CalendarEvent[]; festivals: Festival[] };

export async function getCalendar(
  mode: "mine" | "city",
  start: string,   // YYYY-MM-DD, inclusive
  end: string      // YYYY-MM-DD, inclusive
): Promise<CalendarPayload> {
  const res = await fetch(
    `${API_BASE_URL}/me/calendar?mode=${mode}&start=${start}&end=${end}`,
    { headers: await authHeaders() }
  );
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function unsaveFestival(festivalId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/saves/festivals/${festivalId}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

// ---- genre-led onboarding (for people with no Last.fm account) ----
export type GenreOption = { name: string; artist_count: number };
export type GenreArtist = {
  name: string;
  image_url: string | null;
  deezer_fans: number | null;
  lastfm_listeners: number | null;
  genres: string[];
  upcoming_shows: number;
};

// Genres worth offering, most-played first. Counted over artists who have an upcoming
// show, so picking one always leads somewhere.
export async function getGenres(limit = 30): Promise<GenreOption[]> {
  const res = await fetch(`${API_BASE_URL}/genres?limit=${limit}`);
  if (!res.ok) throw new Error(`Genres ${res.status}`);
  return res.json();
}

// Artists to follow for the genres someone picked.
export async function getGenreArtists(names: string[], limit = 30): Promise<GenreArtist[]> {
  const q = encodeURIComponent(names.join(","));
  const res = await fetch(`${API_BASE_URL}/genres/artists?genres=${q}&limit=${limit}`);
  if (!res.ok) throw new Error(`Genre artists ${res.status}`);
  return res.json();
}

// ---- taste / followed artists ----
// A real artist from the global (Deezer) catalogue — what the follow screen shows.
export type ArtistSearchResult = {
  name: string;
  image_url: string | null;
  deezer_id: number | null;
  fans: number | null;
};
// A followed artist, as stored in our own DB (has a stable local id).
export type FollowedArtist = {
  id: string;
  name: string;
  image_url: string | null;
  // Cached popularity — lets the artists row pick the biggest when the same act has
  // been followed under two spellings ("A.R. Rahman" and "AR Rahman").
  deezer_fans: number | null;
  lastfm_listeners: number | null;
};
// An upcoming event matched to the user's taste. The match is by a followed/listened
// artist ("artist") or by a genre the user loves ("genre").
export type RecommendedEvent = MusicEvent & {
  reason: string;
  reason_label: string;
  reason_kind: "artist" | "genre";
};

// Search any real artist to follow (no login needed).
export async function searchArtists(q: string, limit = 20): Promise<ArtistSearchResult[]> {
  const url = `${API_BASE_URL}/artists/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  try {
    const res = await fetch(url);
    console.log(`[artist-search] ${res.status} ${url}`);
    if (!res.ok) return [];
    const data = await res.json();
    console.log(`[artist-search] ${data.length} results`);
    return data;
  } catch (e) {
    console.warn(`[artist-search] FAILED ${url} — ${String(e)}`);
    return [];
  }
}

// Full artist page — real photo (Deezer), cited bio (Wikipedia), their shows, genres.
export type ArtistDetail = {
  id: string;
  name: string;
  image_url: string | null;
  bio: string | null;
  bio_source: string | null;
  wiki_url: string | null;      // the exact page the bio came from, or null
  website_url: string | null;   // the artist's own site, or null
  genres: string[];
  // Audience size from two services that measure different things — Deezer counts
  // followers, Last.fm counts distinct listeners. Never combined into one number.
  deezer_fans: number | null;
  lastfm_listeners: number | null;
  show_count: number;
  city_count: number;
  upcoming_shows: MusicEvent[];
  festivals: Festival[];   // festivals they're billed on, from the published line-up
  similar: SimilarArtist[]; // empty when no link is strong enough — section hides
}

export type SimilarArtist = {
  id: string | null;   // null when Last.fm suggested an artist we haven't ingested
  name: string;
  image_url: string | null;
  reason: string;   // e.g. "Also on the bill at Lowlands 2026"
  shared: number;
};;
export async function getArtist(name: string): Promise<ArtistDetail> {
  const res = await fetch(`${API_BASE_URL}/artists/detail?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getFollows(): Promise<FollowedArtist[]> {
  const res = await fetch(`${API_BASE_URL}/me/follows`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function followArtist(
  a: { name: string; deezer_id?: number | null; image_url?: string | null }
): Promise<FollowedArtist> {
  const res = await fetch(`${API_BASE_URL}/me/follows`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(a),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Follow many artists at once (e.g. imported from Spotify), with genres for the
// taste profile. Idempotent.
export async function bulkFollow(
  artists: { name: string; image_url?: string | null; genres?: string[] }[]
): Promise<FollowedArtist[]> {
  const res = await fetch(`${API_BASE_URL}/me/follows/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ artists }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function unfollowArtist(artistId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/follows/${artistId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

// Events matching the artists you follow, soonest first, each with a reason line.
export async function getRecommended(limit?: number,
                                    filters: SearchFilters = {}): Promise<RecommendedEvent[]> {
  // The home row shows twelve. Asking for everything cost 1.87 MB an app launch and put the
  // database over its monthly allowance three times over; the browse screen asks for more.
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  applyFilters(params, { ...filters, sort: undefined, following: false });
  const q = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE_URL}/me/recommended${q}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ---- festivals ----
export type Festival = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  image_url: string | null;
  starts_on: string | null;
  ends_on: string | null;
  days: number | null;
  artists_count: number | null;
  price_from_amount: number | null;
  price_from_currency: string | null;
  mxs: number | null;
  confidence: string | null;
  saved?: boolean;                    // calendar endpoint only: already in your calendar
  match_count?: number | null;        // "for you" only: followed artists on the bill
  matched_artists?: string[] | null;  // their names
};

export type FestivalArtist = {
  name: string;
  image_url: string | null;
  // The day they play, when the seller sold that day as its own listing. Null means "on
  // the bill, day not announced" — a different claim, and shown as one.
  day: string | null;
};

// One festival, with its published bill. Extends Festival so the card and the page can
// never disagree about the same festival.
/** One component of a Music Experience Score, as the scorer wrote it. */
export type MxsComponent = {
  score: number;
  weight: number;
  confidence: string;
  reason: string;
  ranked_against?: string;
};

/** The score taken apart. `missing` names the components that could NOT be used and why —
 *  the score is meant to be arguable, so it carries its own gaps. */
export type MxsBreakdown = {
  scored?: boolean;
  final?: number;
  percentile?: number;
  cohort?: string;
  confidence?: string;
  reasons?: string[];
  components?: Record<string, MxsComponent>;
  /** Components that could NOT be used. The events scorer writes a list of names;
   *  the festival scorer writes name -> reason. Both shapes occur. */
  missing?: string[] | Record<string, string>;
};

export type FestivalDetail = Festival & {
  mxs_breakdown?: MxsBreakdown | null;
  about: string | null;
  lineup: FestivalArtist[];
  // Days we actually know a bill for, earliest first. Empty when never split by day.
  lineup_days: string[];
  lineup_complete: boolean;
  last_verified: string | null;
};

// Search festivals we hold, ranked server-side. The screen used to filter the first 100
// festivals it had fetched — of 500-odd — so four in five were unreachable.
export async function searchFestivals(q: string, limit = 40): Promise<Festival[]> {
  const res = await fetch(`${API_BASE_URL}/festivals/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Festival search ${res.status}`);
  return res.json();
}

// Ask Ticketmaster for festivals matching this term and store them — the mirror of
// searchEvents. Without it a festival the periodic sweep missed is unfindable however
// precisely you type its name.
export async function searchFestivalsLive(q: string): Promise<Festival[]> {
  const res = await fetch(`${API_BASE_URL}/festivals/search-live?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Festival live search ${res.status}`);
  return res.json();
}

// One festival by id, with its line-up.
export async function getFestival(id: string): Promise<FestivalDetail> {
  const res = await fetch(`${API_BASE_URL}/festivals/${id}`);
  if (!res.ok) throw new Error(`Festival ${res.status}`);
  return res.json();
}

// All upcoming festivals (open browse — everyone sees the same).
export async function getFestivals(limit = 100,
                                  filters: SearchFilters = {}): Promise<Festival[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  applyFilters(params, { ...filters, sort: undefined });
  const res = await fetch(`${API_BASE_URL}/festivals?${params.toString()}`);
  if (!res.ok) return [];
  return res.json();
}

// Festivals whose line-up includes artists you follow, ranked by match count.
export async function getFestivalsForYou(): Promise<Festival[]> {
  const res = await fetch(`${API_BASE_URL}/festivals/for-you`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

// ---- Notifications inbox (Step 5 backend) ----
export type NotificationType =
  | "cancellation" | "postponed" | "date_change" | "reinstated" | "price_drop" | "new_show";

export type AppNotification = {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  priority: "normal" | "high" | string;
  is_read: boolean;
  created_at: string;
  event_id: string | null;
  artist_id: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  event_city: string | null;
  artist_name: string | null;
};

// `urgent` = cancellations / postponements / date moves only — what earns a red dot.
export type UnreadCount = { unread: number; urgent: number };

export type NotificationPrefs = {
  on_sale: boolean;
  new_show: boolean;
  reminder: boolean;
  price_drop: boolean;
  bucket_list_live: boolean;
  trip_cancellation: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
};

export async function getNotifications(limit = 50, unreadOnly = false): Promise<AppNotification[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) params.set("unread_only", "true");
  const res = await fetch(`${API_BASE_URL}/me/notifications?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Never throws — a failed badge check should not break the Home screen.
export async function getUnreadCount(): Promise<UnreadCount> {
  try {
    const res = await fetch(`${API_BASE_URL}/me/notifications/unread-count`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return { unread: 0, urgent: 0 };
    return res.json();
  } catch {
    return { unread: 0, urgent: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/me/notifications/${id}/read`, {
    method: "POST",
    headers: await authHeaders(),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE_URL}/me/notifications/read-all`, {
    method: "POST",
    headers: await authHeaders(),
  });
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const res = await fetch(`${API_BASE_URL}/me/notification-prefs`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function updateNotificationPrefs(
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const res = await fetch(`${API_BASE_URL}/me/notification-prefs`, {
    method: "PUT",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ---- Last.fm: connecting a listening history ----
export type LastfmStatus = {
  connected: boolean;
  username?: string;
  realname?: string | null;
  image_url?: string | null;
  playcount?: number | null;
  last_synced_at?: string | null;
  core_artists?: number;
  total_artists?: number;
  genres?: string[];
};

export type LastfmConnectResult = {
  ok: boolean;
  username: string;
  realname: string | null;
  playcount: number | null;
  artists_imported: number;
  core_artists: number;
  genres: string[];
  // strongest first — what the confirmation screen shows
  artists: { name: string; image_url: string | null; playcount: number }[];
};

export async function getLastfmStatus(): Promise<LastfmStatus> {
  try {
    const res = await fetch(`${API_BASE_URL}/me/lastfm`, { headers: await authHeaders() });
    if (!res.ok) return { connected: false };
    return res.json();
  } catch {
    return { connected: false };
  }
}

/** Throws with the server's own message ("no such user", "couldn't reach Last.fm") so the
 *  screen can show the real reason rather than a generic failure. */
export async function connectLastfm(username: string): Promise<LastfmConnectResult> {
  const res = await fetch(`${API_BASE_URL}/me/lastfm`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || "Couldn’t connect that account");
  return body;
}

export async function disconnectLastfm(): Promise<void> {
  await fetch(`${API_BASE_URL}/me/lastfm`, { method: "DELETE", headers: await authHeaders() });
}

/* ---------------------------------------------------------------- trip options */

/** A place to sleep near the show. Normalised by our backend, never a supplier's shape —
 *  the screen must not care which provider answered. */
export type Stay = {
  name: string;
  image_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  rating: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** "0 kms", "2.76 kms" — how far from the search point. */
  distance: string | null;
  refundability: string | null;
  board_basis: string | null;
  /** Who holds the inventory. The live response says Makemytrip for some, Tripsure for
   *  others — a traveller is entitled to know who they are buying from. */
  supplier: string | null;
  deep_link: string | null;
  provider: string;
  /** Supplier identity, sent back when someone marks this one as their base so the server can
   *  fetch the property's own record. Opaque handles — they authenticate nothing. */
  hotel_id: string | null;
  supplier_provider: string | null;
};

export type Flight = {
  airline: string | null;
  flight_number: string | null;
  origin: string | null;
  destination: string | null;
  departs_at: string | null;
  arrives_at: string | null;
  stops: number | null;
  duration_minutes: number | null;
  price_amount: number | null;
  price_currency: string | null;
  deep_link: string | null;
  provider: string;
  /** Minutes between landing and the show starting, both on the destination city's own clock.
   *  Negative means you have missed it. Null when the show's start time isn't published — a
   *  margin nobody can compute must not be shown as a comfortable one. */
  minutes_before_show: number | null;
};

/** `status` matters as much as the list. "no stays here" and "we could not ask" are
 *  different claims and the screen says which — never the first when it means the second. */
export type TravelOptions = {
  status: "ok" | "not_configured" | "unavailable" | "no_location";
  reason: string | null;
  check_in: string | null;
  check_out: string | null;
  /** Where "Book a hotel" goes — Tripsure's own results page, pre-filled with this city and
   *  these dates. Built from the autosuggest result, so it survives a listing outage. */
  booking_url: string | null;
  stays: Stay[];
  flights: Flight[];
  /** The search these stays came out of. Passed back verbatim when picking a base, because a
   *  property's details can only be asked for inside the search that found it. */
  doc_key: string | null;
  search_token: string | null;
  /** When the show starts, on the clock of the city it's in — so the screen can say "lands the
   *  day before" by comparing dates rather than inferring it from a number of hours. */
  show_local_start: string | null;
};

/** Where this person is sleeping for this show, as they told us.
 *
 *  Not a booking, and `source` keeps that honest: 'picked' means they pointed at it. Tripsure's
 *  booking flow would require Music X to take the payment and a PAN number, so nothing here
 *  has been paid for and it must never be shown as a reservation. */
export type StayBase = {
  name: string;
  hotel_id: string | null;
  provider: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  check_in: string | null;
  check_out: string | null;
  /** The supplier's own strings — "12:00 PM", sometimes prose. Shown, never parsed. */
  check_in_time: string | null;
  check_out_time: string | null;
  star_rating: number | null;
  image_url: string | null;
  source: "picked" | "booked";
  metres_to_venue: number | null;
  /** Null beyond 3 km: "157 min walk" is true and useless, and reads as a broken sum. */
  walk_minutes: number | null;
  directions_url: string | null;
};

const NO_TRAVEL: TravelOptions = {
  status: "unavailable", reason: null, check_in: null, check_out: null,
  booking_url: null, stays: [], flights: [], doc_key: null, search_token: null,
  show_local_start: null,
};

/** Somewhere to stay for the night of the show. Dates come from the event, not the user. */
export async function getStays(eventId: string, nights = 1): Promise<TravelOptions> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/stays?nights=${nights}`);
  if (!res.ok) return { ...NO_TRAVEL, reason: "Could not load stays." };
  return res.json();
}

/** Flights. `origin` is a city name or an IATA code. */
export async function getFlights(eventId: string, origin: string): Promise<TravelOptions> {
  const res = await fetch(
    `${API_BASE_URL}/events/${eventId}/flights?origin=${encodeURIComponent(origin)}`,
  );
  if (!res.ok) return { ...NO_TRAVEL, reason: "Could not load flights." };
  return res.json();
}


/** "This is where I'm staying." The server fetches the property's own address, coordinates and
 *  check-in time rather than trusting what this screen happens to hold, so the record is the
 *  hotel's rather than a search row's. PUT, so tapping twice leaves one base. */
export async function setStayBase(
  eventId: string,
  hotel: { hotel_id: string; provider: string | null; image_url: string | null },
  ctx: { doc_key: string | null; search_token: string | null },
): Promise<StayBase> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/stay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      hotel_id: hotel.hotel_id,
      provider: hotel.provider,
      image_url: hotel.image_url,
      doc_key: ctx.doc_key,
      search_token: ctx.search_token,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

/** The base they already chose, or null. */
export async function getStayBase(eventId: string): Promise<StayBase | null> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/stay`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function clearStayBase(eventId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/events/${eventId}/stay`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
}


/** Whether this person has to travel to this show at all.
 *
 *  Decided by the server: the phone only holds city names, and a name cannot tell "Newcastle"
 *  from "Newcastle Upon Tyne" or produce the 40 km rule that keeps a Brooklyn user from being
 *  sold a flight to Manhattan. */
export type TravelContext = {
  /** local — already there. regional — a drive or train. far — a flight. unknown — we can't tell. */
  kind: "local" | "regional" | "far" | "unknown";
  reason: string | null;
  distance_km: number | null;
  origin_city: string | null;
  venue_name: string | null;
  event_city: string | null;
  /** Directions with no origin, so the map app starts from wherever the phone is. */
  directions_url: string | null;
  /** When the show starts, on the clock of the city it's in. Present here as well as on the
   *  flight search, because a local never triggers a flight search and the journey card still
   *  needs to say what time the doors are. */
  show_local_start: string | null;
};

export async function getTravelContext(eventId: string): Promise<TravelContext | null> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/travel-context`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}


/** Somewhere near the venue. Observed, not scored.
 *
 *  No rating and no price band: OpenStreetMap carries neither, and the mockup's "4.6" and "££"
 *  would have to be invented. Real ones mean paying Google Places, which is a decision rather
 *  than a gap to paper over. */
export type Place = {
  name: string;
  /** The OSM word, shown as-is: "cafe", "museum", "park". */
  category: string;
  cuisine: string | null;
  website: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  walk_minutes: number;
  /** Route from the VENUE to here — that is the claim this section makes. */
  directions_url: string | null;
};

export type NearbyPlaces = {
  status: "ok" | "no_location" | "unavailable";
  reason: string | null;
  venue_name: string | null;
  city: string | null;
  eat: Place[];
  do: Place[];
  /** A real search, for when we hold little or nothing. Better than a padded list. */
  search_url: string | null;
};

export async function getNearbyPlaces(eventId: string): Promise<NearbyPlaces | null> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/nearby`);
  if (!res.ok) return null;
  return res.json();
}


/* ------------------------------------------------------------------ people */

/** Someone else on Music X. */
export type Person = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  home_city: string | null;
  home_country: string | null;
  following: boolean;
  follows_you: boolean;
};

/** Someone you follow who is going to a show.
 *
 *  `booked` means they told us they have a ticket. We cannot learn that from Ticketmaster — the
 *  purchase happens on their site and is never reported back — so it is their word, not ours. */
export type Goer = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  booked: boolean;
};

/** Only ever counts people YOU follow. Not a public headcount.
 *
 *  `people` is EVERYONE, not just the faces that fit on the line — the sheet behind the line
 *  groups them, and the list is small enough that a second request would be a round trip for
 *  data already in hand. */
/** Who invited you to this show, and what they said. */
export type Inviter = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  when: string | null;
  // The message they sent with the invitation — a different thing entirely from the private
  // plan note, which was removed on 2026-09-10.
  note: string | null;
};

export type Going = {
  people: Goer[];
  total: number;
  /** Has a ticket. */
  going_count: number;
  /** Saved the show, no ticket claimed. */
  interested_count: number;
  /** Written by the server so the phrasing lives in one place. */
  summary: string | null;
  /** Anyone who invited you. Usually empty; several if two friends both thought of it. */
  invited_by: Inviter[];
};

export type InviteResult = { invited: number; already: number; skipped: number };

export type ReceivedInvite = {
  id: string;
  event_id: string;
  event_title: string | null;
  starts_at: string | null;
  city: string | null;
  venue_name: string | null;
  image_url: string | null;
  from_name: string | null;
  from_avatar: string | null;
  // What they wrote with the invitation — the invite's own message, not the plan note.
  note: string | null;
  created_at: string | null;
};

/** Find people by the name they display. An empty query returns the people you already
 *  follow, so the invite sheet opens on your friends rather than a blank box. */
export async function searchPeople(q = ""): Promise<Person[]> {
  const res = await fetch(`${API_BASE_URL}/people/search?q=${encodeURIComponent(q)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function followPerson(personId: string): Promise<Person | null> {
  const res = await fetch(`${API_BASE_URL}/people/${personId}/follow`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function unfollowPerson(personId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/people/${personId}/follow`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
}

export async function getMyPeople(): Promise<Person[]> {
  const res = await fetch(`${API_BASE_URL}/me/people`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

/** Who, among the people you follow, is going to this show. */
export async function getGoing(eventId: string): Promise<Going | null> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/going`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Already invited by you to this show — so the sheet says Invited rather than offering twice. */
export async function getInvitesSent(eventId: string): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/invites/sent`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function sendInvites(
  eventId: string,
  userIds: string[],
  note?: string,
): Promise<InviteResult> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ user_ids: userIds, note: note || null }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getMyInvites(): Promise<ReceivedInvite[]> {
  const res = await fetch(`${API_BASE_URL}/me/invites`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}


/* ------------------------------------------------------------- your plan */

export type PlanStep = {
  key: "interested" | "planning" | "confirmed" | "attended";
  label: string;
  reached: boolean;
  current: boolean;
  /** Only "Attended" is ever locked, and only before the show. */
  locked: boolean;
};

export type PlanTicket = {
  provider: string | null;
  reference: string | null;
  /** 'pasted' | 'photo' | 'declared' — not equally strong, so not blurred into one. */
  source: string | null;
  at: string | null;
};

/** The plan card. `state` is derived on the server from the hotel, invites, note and ticket, so
 *  it can never drift out of step with them. */
export type Plan = {
  saved: boolean;
  state: "" | "interested" | "planning" | "confirmed" | "attended";
  steps: PlanStep[];
  headline: string | null;
  hint: string | null;
  past: boolean;
  has_base: boolean;
  has_invited: boolean;
  reminder_level: "minimal" | "normal" | "high";
  ticket: PlanTicket | null;
};

/** What the parser made of a pasted confirmation. `confident: false` is not an error — it is
 *  "we could not tell", which is the honest answer when we cannot. */
export type PasteResult = {
  confident: boolean;
  provider: string | null;
  reference: string | null;
  matched: string[];
  missing: string[];
  message: string | null;
  plan: Plan | null;
};

export async function getPlan(eventId: string): Promise<Plan | null> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/plan`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

async function planWrite(path: string, method: string, body?: unknown): Promise<Plan | null> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export const setPlanReminder = (eventId: string, level: string) =>
  planWrite(`/events/${eventId}/plan/reminder`, "PUT", { level });


export const markMissed = (eventId: string) =>
  planWrite(`/events/${eventId}/plan/missed`, "POST");

export const declareTicket = (eventId: string) =>
  planWrite(`/events/${eventId}/plan/ticket/declare`, "POST");

export const clearTicket = (eventId: string) =>
  planWrite(`/events/${eventId}/plan/ticket`, "DELETE");

export const markAttended = (eventId: string) =>
  planWrite(`/events/${eventId}/plan/attended`, "POST");

export async function pasteTicket(eventId: string, text: string): Promise<PasteResult | null> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/plan/ticket/paste`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------- push devices

export async function registerPushToken(token: string, platform: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) throw new Error(`register push token failed: ${res.status}`);
}

export async function unregisterPushToken(token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/me/push-token?token=${encodeURIComponent(token)}`,
    { method: "DELETE", headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(`unregister push token failed: ${res.status}`);
}

export async function getPushPublicKey(): Promise<{ key: string; enabled: boolean }> {
  const res = await fetch(`${API_BASE_URL}/me/push-key`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`push key failed: ${res.status}`);
  return res.json();
}

export async function registerWebPush(sub: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth },
      platform: "web",
    }),
  });
  if (!res.ok) throw new Error(`register web push failed: ${res.status}`);
}

// ---------------------------------------------------------------- concert passport

export type PassportShow = {
  id: string; event_id: string | null; artist_name: string | null;
  venue_name: string | null; city: string | null; country: string | null;
  seen_on: string | null; source: string; evidence_url: string | null;
};
export type PassportStamp = {
  country: string; shows: number; first_seen_on: string | null; since_year: number | null;
};
export type GenreShare = { name: string; shows: number };
export type Passport = {
  display_name: string | null; avatar_url: string | null; home_city: string | null;
  member_since: number | null;
  shows: number; country_count: number; city_count: number;
  hours_in_the_crowd: number;
  top_artist: string | null; top_artist_count: number;
  tier: string; next_tier: string | null; shows_to_next_tier: number | null;
  milestones: {
    rungs: { at: number; label: string; reached: boolean }[];
    progress: number; next_label: string | null; next_at: number | null;
  };
  genres: GenreShare[];
  stamps: PassportStamp[];
  recent: PassportShow[];
};

export async function getPassport(): Promise<Passport> {
  const res = await fetch(`${API_BASE_URL}/me/passport`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- "were you there?"

export type AttendanceAsk = {
  event_id: string; title: string; venue_name: string | null; city: string | null;
  starts_at: string | null; timezone: string | null;
  image_url: string | null; had_ticket: boolean;
};

export async function getUnansweredShows(): Promise<AttendanceAsk[]> {
  const res = await fetch(`${API_BASE_URL}/events/plan/unanswered`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function answerAttended(eventId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/plan/attended`,
    { method: "POST", headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function answerMissed(eventId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/plan/missed`,
    { method: "POST", headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export type SetlistfmLink = {
  username: string | null; profile_url: string | null;
  last_synced_at: string | null; last_import_count: number | null; available: boolean;
};

export async function getSetlistfmLink(): Promise<SetlistfmLink> {
  const res = await fetch(`${API_BASE_URL}/me/passport/setlistfm`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function linkSetlistfm(username: string): Promise<{ added: number; skipped: number; total: number }> {
  const res = await fetch(`${API_BASE_URL}/me/passport/setlistfm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ username }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `API error ${res.status}`);
  return body;
}

export async function unlinkSetlistfm(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/me/passport/setlistfm`, {
    method: "DELETE", headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

// ---------------------------------------------------------------- trip planner

export type TripStop = {
  event_id: string; title: string; starts_at: string | null; timezone: string | null;
  image_url: string | null; venue_name: string | null; city: string; country: string | null;
  mxs: number | null; travel_hours: number; same_place: boolean;
};
export type TripPlan = {
  origin_city_id: string; origin: string; origin_country: string | null;
  mode: string; starts_on: string; ends_on: string;
  budget_hours: number; used_hours: number; cities: number; stops: TripStop[];
};
export type SavedTrip = {
  id: string; origin: string | null; state: string;
  total_travel_hours: number | null; created_at: string; stops: TripStop[];
};

export async function planTrip(
  originCityId: string, start: string, end: string, mode: string,
): Promise<TripPlan> {
  const q = new URLSearchParams({ origin_city_id: originCityId, start, end, mode });
  const res = await fetch(`${API_BASE_URL}/trips/plan?${q}`, { headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `API error ${res.status}`);
  return body;
}

export async function saveTrip(plan: TripPlan): Promise<SavedTrip> {
  const res = await fetch(`${API_BASE_URL}/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      origin_city_id: plan.origin_city_id, mode: plan.mode,
      event_ids: plan.stops.map((s) => s.event_id),
      travel_hours: plan.stops.map((s) => s.travel_hours),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `API error ${res.status}`);
  return body;
}

export async function getSavedTrips(): Promise<SavedTrip[]> {
  const res = await fetch(`${API_BASE_URL}/trips`, { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteTrip(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/trips/${id}`, {
    method: "DELETE", headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

// ---- reviews ----
// Written only by people who attended, read by people deciding whether to go. Stored
// against the night, shown against the artist — a review of one date is only readable
// after that date, when nobody needs it. See backend routes/reviews.py.

export type ReviewItem = {
  id: string;
  rating: number;
  body: string | null;
  likes_count: number;
  liked_by_me: boolean;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
  /** Which show this was written about, e.g. "O2 Academy Brixton · Oct 2025". */
  show_label: string | null;
  is_this_event: boolean;
};

/** What the artist actually played last time. Stands in for reviews before any exist —
 *  there is nowhere to import concert reviews from, so this is the honest opening. */
export type LiveFacts = {
  songs: number;
  encores: number;
  opener: string | null;
  closer: string | null;
  venue_name: string | null;
  city: string | null;
  seen_on: string | null;
  tour: string | null;
  url: string | null;
};

export type ReviewsPage = {
  artist_name: string | null;
  /** How many people in Music X have been to one of this artist's shows. */
  seen_by: number;
  summary: { average: number | null; count: number; histogram: Record<string, number> };
  reviews: ReviewItem[];
  live_facts: LiveFacts | null;
  can_review: boolean;
  cannot_review_reason: string | null;
  my_review_id: string | null;
};

export async function getReviews(eventId: string): Promise<ReviewsPage> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/reviews`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Reviews ${res.status}`);
  return res.json();
}

export async function postReview(
  eventId: string, rating: number, body: string | null
): Promise<ReviewItem> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ rating, body }),
  });
  if (!res.ok) {
    // The server owns the gate, so its wording is the wording to show.
    let detail = `Review ${res.status}`;
    try { detail = (await res.json())?.detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function deleteReview(reviewId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/reviews/${reviewId}`, {
    method: "DELETE", headers: await authHeaders(),
  });
}

export async function setReviewHelpful(reviewId: string, on: boolean): Promise<void> {
  await fetch(`${API_BASE_URL}/reviews/${reviewId}/like`, {
    method: on ? "POST" : "DELETE", headers: await authHeaders(),
  });
}

/* ------------------------------------------------- My shows & My bookings (Me tab) */

/** A saved concert, with the plan state DERIVED on the server — see routes/bookings.py.
 *  `state` can also be "missed": an answer, not a stage, and rendered as its own tag. */
export type MyShow = MusicEvent & {
  state: "interested" | "planning" | "confirmed" | "attended" | "missed";
  booked: boolean;
  is_suggestion: boolean;
};

export type MyShows = {
  shows: MyShow[];
  festivals: Festival[];
  counts: Record<string, number>;
};

/** One currency's worth of spend. A trip can hold several of these and they are never
 *  added together — see the note at the top of routes/bookings.py. */
export type Money = { amount: number; currency: string };

export type TicketLine = {
  booked: boolean;
  provider: string | null;
  reference: string | null;
  source: string | null;
  at: string | null;
  cost: number | null;
  currency: string | null;
};

export type StayLine = {
  name: string;
  check_in: string | null;
  check_out: string | null;
  cost: number | null;
  currency: string | null;
  booking_ref: string | null;
  free_cancel_until: string | null;
  /** Is that deadline inside the warning week? The server decides, so the rule lives in
   *  one place rather than being re-implemented against the phone's clock. */
  cancel_soon: boolean;
  address: string | null;
  /** 'picked' = pointed at in our hotel search, nothing paid. 'recorded' = a booking they
   *  made themselves and typed in here. Only one of the two is a reservation. */
  source: "picked" | "recorded" | "booked";
};

export type TravelMode = "plane" | "train" | "bus" | "car";

export type TravelLine = {
  id: string;
  mode: TravelMode;
  from_label: string | null;
  to_label: string | null;
  travel_on: string | null;
  cost: number | null;
  currency: string | null;
  booking_ref: string | null;
  free_cancel_until: string | null;
  cancel_soon: boolean;
};

export type Trip = {
  event: MusicEvent;
  ticket: TicketLine;
  stay: StayLine | null;
  travel: TravelLine[];
  stages_done: number;
  stages_total: number;
  spend: Money[];
  /** Negative once the show has happened; null when it has no date, so the card can say
   *  "Date TBA" instead of counting down to nothing. */
  days_until: number | null;
  /** How many lines on this trip have a window closing this week. Drives the card banner;
   *  the dates themselves live on the lines, so no deadline is printed twice. */
  cancel_soon: number;
};

export type Bookings = {
  upcoming: Trip[];
  past: Trip[];
  spend: Money[];
  trips: number;
  cancel_windows: number;
};

export async function getMyShows(): Promise<MyShows> {
  const res = await fetch(`${API_BASE_URL}/me/shows`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`My shows ${res.status}`);
  return res.json();
}

export async function getBookings(): Promise<Bookings> {
  const res = await fetch(`${API_BASE_URL}/me/bookings`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Bookings ${res.status}`);
  return res.json();
}

/** The server's own wording for a rejection, so the rule is stated in one place. */
async function detailOf(res: Response, fallback: string): Promise<string> {
  try { return (await res.json())?.detail ?? fallback; } catch { return fallback; }
}

export type StayIn = {
  name: string;
  check_in?: string | null;
  check_out?: string | null;
  cost?: number | null;
  currency?: string | null;
  booking_ref?: string | null;
  free_cancel_until?: string | null;
};

/** "Here is the hotel I booked myself." PUT — one stay per show, so saving twice leaves one. */
export async function recordStay(eventId: string, body: StayIn): Promise<StayLine> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/stay/record`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await detailOf(res, `Stay ${res.status}`));
  return res.json();
}

export type TravelIn = {
  mode: TravelMode;
  from_label: string;
  to_label: string;
  travel_on?: string | null;
  cost?: number | null;
  currency?: string | null;
  booking_ref?: string | null;
  free_cancel_until?: string | null;
};

/** POST, not PUT: a return trip is two legs and a festival run is often four. */
export async function addTravelLeg(eventId: string, body: TravelIn): Promise<TravelLine> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await detailOf(res, `Travel ${res.status}`));
  return res.json();
}

export async function removeTravelLeg(eventId: string, legId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/events/${eventId}/travel/${legId}`, {
    method: "DELETE", headers: await authHeaders(),
  });
}

/** What the ticket actually cost. Nulls clear it. Rejected with the server's own message
 *  when there is no ticket yet — a price on a ticket nobody has is a number with nothing
 *  behind it, and it would still be summed into the trip total. */
export async function setTicketCost(
  eventId: string, cost: number | null, currency: string | null
): Promise<TicketLine> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/ticket-cost`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ cost, currency }),
  });
  if (!res.ok) throw new Error(await detailOf(res, `Ticket cost ${res.status}`));
  return res.json();
}

// ---- one search box, three kinds of answer ----
// Artists here come from OUR catalogue, not Deezer, which is what lets a result carry
// "3 concerts · 1 festival". `via` says why the act is listed: "name" = the term matched
// their name; "lineup" = they were found on a bill the term matched, so searching a venue
// or a festival returns the acts actually playing it.
export type SearchArtistResult = {
  id: string;
  name: string;
  image_url: string | null;
  deezer_fans: number | null;
  lastfm_listeners: number | null;
  upcoming_events: number;
  upcoming_festivals: number;
  via: "name" | "lineup";
};
// How many matching CONCERTS each option would leave. Concerts only — festival dates are a
// range rather than a moment and two filters have no festival answer at all, so one merged
// number would be true of neither.
export type SearchCounts = {
  total: number; today: number; tomorrow: number; weekend: number;
  d7: number; month: number; m3: number;
  onsale_now: number; onsale_coming: number;
  rating_8: number; rating_7: number; not_scheduled: number;
};
export type SearchAllResults = {
  artists: SearchArtistResult[];
  events: MusicEvent[];
  festivals: Festival[];
  counts?: SearchCounts | null;
  // What the server actually applied. "Only acts I follow" does nothing when signed out,
  // and the chip row shows the truth rather than what it thinks it asked for.
  applied?: string[];
};
const EMPTY_RESULTS: SearchAllResults = { artists: [], events: [], festivals: [], applied: [] };

export async function searchAll(q: string,
                                filters: SearchFilters = {}): Promise<SearchAllResults> {
  const params = applyFilters(new URLSearchParams({ q }), filters);
  // Signed when there is a session: /search is public, but "only acts I follow" cannot be
  // answered without knowing who is asking. Signed out, the server drops that one filter
  // and says so in `applied`.
  const res = await fetch(`${API_BASE_URL}/search?${params.toString()}`,
                          { headers: await authHeaders() });
  if (!res.ok) return EMPTY_RESULTS;
  return res.json();
}

// The countries we actually hold upcoming shows in, biggest first. Fetched rather than
// hardcoded: the old filter offered a fixed list of fifteen including four we have almost
// nothing in, so tapping them looked like a broken filter.
export type CountryCount = { code: string; n: number };
export async function getEventCountries(): Promise<CountryCount[]> {
  const res = await fetch(`${API_BASE_URL}/events/countries`);
  if (!res.ok) return [];
  return res.json();
}

// ---- wishlist ----
// Acts you have not seen and mean to. NOT the same as a save (an event on a date) and NOT
// the same as a follow (a notification subscription) — the one list of the three that can
// be finished, which is why every line carries whether it has been crossed off and how.
// The table behind it is still called `bucket_list`; only the word changed.
export type WishlistLine = {
  artist_id: string;
  name: string;
  image_url: string | null;
  deezer_fans: number | null;
  lastfm_listeners: number | null;
  added_on: string;
  seen: boolean;
  // "passport" = we hold evidence you were there. "manual" = you told us about a gig from
  // before the app existed. The screen says which, because they are different claims.
  seen_via: "passport" | "manual" | null;
  seen_on: string | null;
  next_event_id: string | null;
  next_event_title: string | null;
  next_event_starts_at: string | null;
  next_event_city: string | null;
  next_event_country: string | null;
};
export type Wishlist = {
  still_to_see: WishlistLine[];
  seen: WishlistLine[];
  total: number;
  seen_count: number;
  playing_count: number;
};

const EMPTY_WISHLIST: Wishlist = {
  still_to_see: [], seen: [], total: 0, seen_count: 0, playing_count: 0,
};

export async function getWishlist(): Promise<Wishlist> {
  const res = await fetch(`${API_BASE_URL}/me/wishlist`, { headers: await authHeaders() });
  if (!res.ok) return EMPTY_WISHLIST;
  return res.json();
}

export async function addToWishlist(a: { name: string; deezer_id?: number | null; image_url?: string | null }) {
  const res = await fetch(`${API_BASE_URL}/me/wishlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ name: a.name, deezer_id: a.deezer_id ?? null, image_url: a.image_url ?? null }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<WishlistLine>;
}

export async function removeFromWishlist(artistId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/me/wishlist/${artistId}`, {
    method: "DELETE", headers: await authHeaders(),
  });
}

// The manual "I've seen them". Cannot undo a Passport tick — that one is evidence, and the
// server ignores an attempt to clear it.
export async function markWishlistSeen(artistId: string, seen: boolean): Promise<void> {
  await fetch(`${API_BASE_URL}/me/wishlist/${artistId}/seen`, {
    method: seen ? "POST" : "DELETE", headers: await authHeaders(),
  });
}
