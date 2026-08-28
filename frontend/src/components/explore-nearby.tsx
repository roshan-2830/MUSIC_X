import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as React from "react";

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

const ITEMS = 3;
/** Measured: three items at 360 px wide report 1144 px. Used only until the widget tells us its
 *  real height, which it does within a second or two. */
const FALLBACK_HEIGHT = 1144;
/** If the widget has not reported a height by now, treat it as failed and show the link. */
const GIVE_UP_MS = 9000;

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

function frameUrl(q: string, currency: string, locale: string): string {
  const p = new URLSearchParams({
    widget: "activities",
    number_of_items: String(ITEMS),
    partner_id: PARTNER_ID,
    cmp: CAMPAIGN,
    currency,
    locale_code: locale,
    q,
  });
  return `https://widget.getyourguide.com/default/activities.frame?${p.toString()}`;
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

/** Forwards the widget's own height out of the WebView.
 *
 *  The frame posts {"channel":"GYG","height":1144,...} to its parent as it lays out — observed
 *  44 times in ten seconds as images settle. A WebView has no intrinsic height in React Native,
 *  so without this it would need a hardcoded one and would either clip the third card or leave
 *  a gap under it.
 */
const BRIDGE = `
(function () {
  function send(o) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    if (String(e.origin).indexOf('getyourguide') === -1) return;
    var d = e.data;
    try { d = typeof d === 'string' ? JSON.parse(d) : d; } catch (err) { return; }
    if (d && d.channel === 'GYG' && d.height) send({ height: d.height });
  });
  // The frame is this document's own body when loaded top-level, so its scroll height is a
  // usable answer too, and it arrives sooner than the first postMessage.
  function measure() {
    var h = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0);
    if (h > 80) send({ height: h });
  }
  setTimeout(measure, 700);
  setTimeout(measure, 2500);
  true;
})();
`;

/**
 * "Things to Do Near {venue}" — GetYourGuide activities around the show.
 *
 * THE ONE THING TO KNOW BEFORE TRUSTING THIS: the frame renders when it is the top-level
 * document and rendered BLANK every time it was put in an iframe from an unapproved origin —
 * tested at both full width and phone width, on light and dark pages, with and without a
 * partner id. It still reported a height of 1144 while showing nothing, so a height alone is
 * not proof of content.
 *
 * That asymmetry decides the two platforms. On iOS and Android a WebView loads the frame as a
 * top-level document, which is the case that works and is verified working. On web it has to be
 * an iframe, so it will stay blank until GetYourGuide approves this partner id AND this domain
 * — which cannot be tested from here. The fallback link below is what carries the web build in
 * the meantime, and it earns commission just the same.
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
  const [height, setHeight] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // THE EMBED IS NATIVE-ONLY, and this is the second correction. A WebView loads the frame as
  // a top-level document, which is the case verified to render. In a web iframe it came back
  // blank every time from an unapproved origin — while still posting height messages, 44 of
  // them, so the height that drives `ready` is not evidence of anything. Trusting it on web
  // meant a blank white box that never fell back to the link, because the failure timer was
  // cancelled by the very message that proved nothing.
  //
  // So web shows the link, which works today and earns the same commission. When GetYourGuide
  // approves this partner id and this domain, the iframe can come back by deleting one line.
  const canEmbed = Platform.OS !== "web" && !!PARTNER_ID;

  const gotHeight = useCallback((h: number) => {
    if (!h || h < 80) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // Capped: a runaway height from a mis-measured document would push the rest of the page
    // off the screen.
    setHeight(Math.min(Math.round(h), 2000));
  }, []);

  useEffect(() => {
    if (!canEmbed || !q) return;
    timer.current = setTimeout(() => setFailed(true), GIVE_UP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, canEmbed]);

  if (!q) return null;

  // The link is shown WHETHER OR NOT there is a partner id, and that is a correction. Gating
  // the whole section meant that with no id configured there was no way to reach GetYourGuide
  // at all — the feature was invisible rather than merely unattributed. A plain outbound link
  // earns nothing without an id, which is a reason to get the id, not a reason to hide the
  // only route to tours near the venue.
  const url = frameUrl(q, currency, locale);
  const ready = canEmbed && height > 0 && !failed;

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

      {canEmbed && !ready && !failed ? (
        <View style={styles.state}>
          <ActivityIndicator color={ACCENT} />
          <Text style={styles.stateText}>Finding things to do…</Text>
        </View>
      ) : null}

      {canEmbed && !failed ? (
        // A white surface on purpose. The widget renders its own light theme with dark text and
        // cannot be told otherwise, so it is framed as the third-party card it is rather than
        // dropped onto a dark background where it would look like a rendering fault.
        <View style={[styles.frame, { height: ready ? height : 1, opacity: ready ? 1 : 0 }]}>
          <WebView
            source={{ uri: url }}
            style={styles.web}
            injectedJavaScript={BRIDGE}
            onMessage={(e) => {
              try {
                const d = JSON.parse(e.nativeEvent.data);
                if (d?.height) gotHeight(d.height);
              } catch { /* a message we did not send */ }
            }}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            // Booking leaves the app deliberately. The 31-day cookie has to land in the browser
            // the person actually uses, and a WebView's cookie jar can be cleared without
            // warning — a booking made in here might earn nothing. It is also the honest thing:
            // a payment page belongs in a real browser with a visible URL.
            onShouldStartLoadWithRequest={(req) => {
              if (req.url === url || req.url.startsWith("about:")) return true;
              if (/^https?:\/\//.test(req.url)) {
                Linking.openURL(req.url);
                return false;
              }
              return false;
            }}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            nestedScrollEnabled={false}
            setSupportMultipleWindows={false}
            originWhitelist={["https://*.getyourguide.com"]}
          />
        </View>
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
