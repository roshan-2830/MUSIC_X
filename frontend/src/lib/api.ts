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
};
export type ArtistOut = { name: string; is_headliner: boolean };
export type OfferOut = { seller_name: string; url: string | null; is_official: boolean; is_face_value_resale: boolean };
export type EventDetail = MusicEvent & { lineup: ArtistOut[]; genres: string[]; offers: OfferOut[] };

export async function fetchEvents(sort: "date" | "mxs" = "date"): Promise<MusicEvent[]> {
  const res = await fetch(`${API_BASE_URL}/events?sort=${sort}`);
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