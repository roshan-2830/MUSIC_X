import { supabase } from "./supabase";
import { Platform } from "react-native";
import Constants from "expo-constants";

function resolveBaseUrl(): string {
  // Web runs on the Mac itself → localhost works.
  if (Platform.OS === "web") return "http://localhost:8000";
  // On a phone/emulator, use the same host Expo is served from (your Mac's LAN IP).
  const host = (Constants.expoConfig?.hostUri ?? "").split(":")[0];
  return host ? `http://${host}:8000` : "http://localhost:8000";
}

export const API_BASE_URL = resolveBaseUrl();

export type MusicEvent = {
  id: string; title: string; starts_at: string | null; timezone: string | null;
  status: string; venue_name: string | null; city: string | null; country: string | null;
  mxs: number | null; confidence: string | null;
  price_from_amount: number | null; price_from_currency: string | null;
  image_url: string | null;
};
export type ArtistOut = { name: string; is_headliner: boolean };
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

export async function fetchEvents(
  sort: "date" | "mxs" = "date",
  limit = 50,
  cityId?: string,
  country?: string
): Promise<MusicEvent[]> {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (cityId) params.set("city_id", cityId);
  if (country) params.set("country", country);
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
export async function getRecommended(): Promise<RecommendedEvent[]> {
  const res = await fetch(`${API_BASE_URL}/me/recommended`, { headers: await authHeaders() });
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

// All upcoming festivals (open browse — everyone sees the same).
export async function getFestivals(limit = 100): Promise<Festival[]> {
  const res = await fetch(`${API_BASE_URL}/festivals?limit=${limit}`);
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
