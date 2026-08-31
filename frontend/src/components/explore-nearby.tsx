import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { NearbyPlaces } from "../lib/api";
import CollapsibleCard from "./collapsible-card";
import PlacesMap from "./places-map";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const CARD = "#14141b";

/** Set once the GetYourGuide affiliate account is approved. Not hardcoded, and not committed:
 *  it lives in .env as EXPO_PUBLIC_GYG_PARTNER_ID. */
const PARTNER_ID = process.env.EXPO_PUBLIC_GYG_PARTNER_ID ?? "";

/** Optional campaign tag, so bookings from this surface can be told apart from any other
 *  placement later. GetYourGuide reports on it. */
const CAMPAIGN = process.env.EXPO_PUBLIC_GYG_CAMPAIGN ?? "event-page";


/** The search term the widget is asked for.
 *
 *  IT DOES NOT TAKE COORDINATES. This was checked against the live endpoint rather than
 *  assumed: `?latitude=..&longitude=..` returns their "Fallback Widget" with zero activities,
 *  byte-identical to passing no parameters at all — the values are ignored. The `geo_location`
 *  field inside their analytics script is telemetry the frame REPORTS after geocoding the
 *  query itself, not an input.
 *
 *  So the lever is `q`, and what goes in it matters enormously. Measured on the live widget:
 *    "Tablao Flamenco 1911 Madrid" -> Flamenco Show & Drink at Tablao 1911, Teatro Flamenco
 *                                     Madrid 4.8 (15,062) — the venue's own programme
 *    "Alexandra Palace London"     -> Madame Tussauds, Tower of London, an airport lounge
 *    "London"                      -> generic city tours
 *  Venue-and-city is therefore the right query: it finds the venue's own activities where they
 *  exist and degrades to city tourism where they do not. Coordinates are still accepted as
 *  props — they are what the fallback map link uses, and they are what a future switch to the
 *  Partner API would key on.
 */
function buildQuery(venueName: string | null, city: string | null): string | null {
  const parts = [venueName, city].filter(Boolean) as string[];
  if (!parts.length) return null;
  // De-duplicated: "Brixton Academy" in "Brixton" would otherwise ask for "Brixton" twice and
  // narrow the search to nothing.
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of parts.join(" ").split(/\s+/)) {
    const k = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    words.push(w);
  }
  return words.join(" ").slice(0, 90);
}

/** Where we send people when the widget will not load: a real GetYourGuide search, carrying the
 *  partner id so a booking still counts. */
function searchUrl(q: string): string {
  // Empty attribution params are left OUT rather than sent blank. `partner_id=` with nothing
  // after it is not a partner id, and a URL that carries one looks like a broken integration
  // to whoever reads it — including GetYourGuide.
  const p = new URLSearchParams({ q });
  if (PARTNER_ID) {
    p.set("partner_id", PARTNER_ID);
    if (CAMPAIGN) p.set("cmp", CAMPAIGN);
  }
  return `https://www.getyourguide.com/s/?${p.toString()}`;
}


/**
 * "Things to do near {venue}" — GetYourGuide activities around the show.
 *
 * THIS HANDS OFF; IT DOES NOT EMBED. There was an embedded widget here and it is gone. It
 * rendered BLANK every time it was placed in an iframe from an origin GetYourGuide has not
 * approved — tested at full width and phone width, light and dark, with and without a partner
 * id — while still reporting a height of 1144px, so the height that drove its "loaded" check
 * was never evidence of anything. Keeping it meant carrying a WebView, an injected height
 * bridge, a failure timer and a native-module probe, all to show nothing.
 *
 * The link earns exactly the same commission: the affiliate cookie is set on the click, not by
 * the widget. So the whole of what was lost is browsing inside the app instead of on theirs,
 * and the whole of what was gained is 157 lines that could not fail.
 *
 * Renders nothing without a partner id. An unattributed widget sends GetYourGuide free traffic
 * and earns nothing, and an affiliate surface should not ship before the affiliate terms are
 * agreed.
 */
export default function ExploreNearby({
  lat,
  lng,
  venueName,
  city,
  places,
  currency = "EUR",
  locale = "en-GB",
}: {
  /** The venue. Used for the map and the map fallback — the widget itself cannot take
   *  coordinates, which is why the query is built from names instead. */
  lat?: number | null;
  lng?: number | null;
  venueName: string | null;
  city: string | null;
  /** The same nearby places section one shows, passed in rather than fetched again: one request
   *  serves both, and the map is the other half of that list. GetYourGuide gives us no
   *  coordinates for its tours — the widget renders them itself and never hands over the data —
   *  so what can be mapped is what OpenStreetMap knows is there. */
  places?: NearbyPlaces | null;
  currency?: string;
  locale?: string;
}) {
  const q = useMemo(() => buildQuery(venueName, city), [venueName, city]);

  if (!q) return null;

  // The link is shown WHETHER OR NOT there is a partner id, and that is a correction. Gating
  // the whole section meant that with no id configured there was no way to reach GetYourGuide
  // at all — the feature was invisible rather than merely unattributed. A plain outbound link
  // earns nothing without an id, which is a reason to get the id, not a reason to hide the
  // only route to tours near the venue.

  const mapPlaces = places?.status === "ok"
    ? [...places.do, ...places.eat]
    : [];
  const hasMap = lat != null && lng != null && !(lat === 0 && lng === 0) && mapPlaces.length > 0;

  return (
    <CollapsibleCard
      title={`Things to do near ${venueName ?? "the venue"}`}
      subtitle={`Tours, tickets and experiences you can book around the show${city ? ` in ${city}` : ""}.`}
      count={mapPlaces.length || null}
      icon="ticket"
    >
      {/* The map first, for the same reason the Stay tab opens on one: a list says what is
          nearby, a map says whether it is all in one direction. The pins are what
          OpenStreetMap knows is around the venue — GetYourGuide never hands us coordinates for
          its tours, the widget draws those itself, so mapping them is not possible at this
          tier. */}
      {hasMap ? (
        <PlacesMap lat={lat!} lng={lng!} venue={venueName} places={mapPlaces} />
      ) : null}


      {/* The button that does the actual handing over. Loud, because on web it is the whole
          mechanism and on a phone it is still the way to everything the three cards omit. */}
      <Pressable style={styles.book} onPress={() => Linking.openURL(searchUrl(q))}>
        <Ionicons name="ticket" size={15} color="#101204" />
        <Text style={styles.bookText}>Book tours on GetYourGuide</Text>
        <Ionicons name="open-outline" size={13} color="#101204" />
      </Pressable>

      {!hasMap && lat != null && lng != null ? (
        <Pressable
          style={styles.alt}
          onPress={() =>
            Linking.openURL(
              `https://www.google.com/maps/search/${encodeURIComponent(
                `things to do near ${venueName ?? ""} ${city ?? ""}`.trim())}`)}
        >
          <Ionicons name="map-outline" size={14} color={MUTED} />
          <Text style={styles.altText}>Or look on the map</Text>
        </Pressable>
      ) : null}

      {/* Required, and not only by good manners: this section is paid, unlike everything else on
          the page. It names the amount rather than hiding behind "may earn", and it adapts —
          without a partner id there is no commission to claim. */}
      <View style={styles.promise}>
        <Ionicons name="shield-checkmark" size={13} color="#7ef0b2" />
        <Text style={styles.promiseText}>
          {PARTNER_ID
            ? "We earn a commission if you book an activity here — it never changes what's shown or the order it's in. Concert tickets are different: we earn nothing on those."
            : "Activities open on GetYourGuide. We earn nothing from them yet, and concert tickets never earn us anything."}
        </Text>
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  // No card/h/sub here any more: CollapsibleCard is the shell, and duplicating its padding and
  // border produced a box inside a box.
  frame: { borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", marginTop: 12 },
  web: { flex: 1, backgroundColor: "#fff" },

  state: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 18 },
  stateText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },

  // The primary action of the section, so it is filled rather than outlined.
  book: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, marginTop: 14,
  },
  bookText: { color: "#101204", fontSize: 14.5, fontWeight: "800" },

  alt: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderWidth: 1, borderColor: LINE, borderRadius: 11, paddingVertical: 11, marginTop: 10,
  },
  altText: { color: MUTED, fontSize: 12.5, fontWeight: "700" },

  promise: { flexDirection: "row", gap: 7, marginTop: 14, alignItems: "flex-start" },
  promiseText: { color: MUTED, fontSize: 11.5, lineHeight: 16, flex: 1 },
});
