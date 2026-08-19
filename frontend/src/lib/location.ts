import * as Location from "expo-location";

import { City, resolveCity } from "./api";

/** Ask permission, read the GPS fix, reverse-geocode it to the user's ACTUAL city
 *  (e.g. Bangalore), and store it. Returns null if permission is denied or it fails.
 *  Not restricted to cities with shows — it's the user's real location. */
export async function detectCurrentCity(): Promise<City | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const places = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const p = places[0];
    if (!p) return null;
    const name = p.city || p.subregion || p.region || p.district || null;
    const country = p.isoCountryCode || null;
    if (!name || !country) return null;
    return await resolveCity({ name, country, lat: pos.coords.latitude, lng: pos.coords.longitude });
  } catch {
    return null;
  }
}
