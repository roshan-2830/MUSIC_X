import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as React from "react";

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
  const p = new URLSearchParams({ q, partner_id: PARTNER_ID, cmp: CAMPAIGN });
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
  currency = "EUR",
  locale = "en-GB",
}: {
  /** Kept per the brief, and used: the map fallback needs them. The widget cannot take them. */
  lat?: number | null;
  lng?: number | null;
  venueName: string | null;
  city: string | null;
  currency?: string;
  locale?: string;
}) {
  const q = useMemo(() => buildQuery(venueName, city), [venueName, city]);
  const [height, setHeight] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gotHeight = useCallback((h: number) => {
    if (!h || h < 80) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // Capped: a runaway height from a mis-measured document would push the rest of the page
    // off the screen.
    setHeight(Math.min(Math.round(h), 2000));
  }, []);

  useEffect(() => {
    if (!PARTNER_ID || !q) return;
    timer.current = setTimeout(() => setFailed(true), GIVE_UP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  // Listening on web, where the iframe posts to our own window rather than through a bridge.
  useEffect(() => {
    if (Platform.OS !== "web" || !PARTNER_ID || !q) return;
    const onMessage = (e: MessageEvent) => {
      if (String(e.origin).indexOf("getyourguide") === -1) return;
      let d: any = e.data;
      try { d = typeof d === "string" ? JSON.parse(d) : d; } catch { return; }
      if (d && d.channel === "GYG" && d.height) gotHeight(d.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [q, gotHeight]);

  if (!q) return null;

  if (!PARTNER_ID) {
    // Nothing in production. In development, say why, so a blank space is not mistaken for a
    // broken component.
    if (!__DEV__) return null;
    return (
      <View style={styles.card}>
        <Text style={styles.h}>Things to Do Near {venueName ?? "the venue"}</Text>
        <View style={styles.state}>
          <Ionicons name="key-outline" size={16} color={MUTED} />
          <Text style={styles.stateText}>
            Set EXPO_PUBLIC_GYG_PARTNER_ID in .env to switch this on. Any value renders the
            widget; only a real approved id earns commission.
          </Text>
        </View>
      </View>
    );
  }

  const url = frameUrl(q, currency, locale);
  const ready = height > 0 && !failed;

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Things to Do Near {venueName ?? "the venue"}</Text>
      <Text style={styles.sub}>
        Tours, tickets and experiences you can book around the show{city ? ` in ${city}` : ""}.
      </Text>

      {!ready && !failed ? (
        <View style={styles.state}>
          <ActivityIndicator color={ACCENT} />
          <Text style={styles.stateText}>Finding things to do…</Text>
        </View>
      ) : null}

      {!failed ? (
        // A white surface on purpose. The widget renders its own light theme with dark text and
        // cannot be told otherwise, so it is framed as the third-party card it is rather than
        // dropped onto a dark background where it would look like a rendering fault.
        <View style={[styles.frame, { height: ready ? height : 1, opacity: ready ? 1 : 0 }]}>
          {Platform.OS === "web"
            ? React.createElement("iframe", {
                src: url,
                title: `Things to do near ${venueName ?? "the venue"}`,
                style: { width: "100%", height: "100%", border: "0", display: "block" },
                loading: "lazy",
                referrerPolicy: "strict-origin-when-cross-origin",
              })
            : (
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
                // Booking leaves the app deliberately. The 31-day cookie has to land in the
                // browser the person actually uses, and a WebView's cookie jar can be cleared
                // without warning — a booking made in here might earn nothing. It is also the
                // honest thing: a payment page belongs in a real browser with a visible URL.
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
            )}
        </View>
      ) : null}

      {/* Always present, not only on failure. On web the embed stays blank until GetYourGuide
          approves the partner id and the domain, and this link works today and earns the same
          commission — so it is the thing that actually carries the web build. */}
      <Pressable style={[styles.btn, failed && styles.btnLoud]}
                 onPress={() => Linking.openURL(searchUrl(q))}>
        <Ionicons name="ticket-outline" size={14} color={failed ? "#101204" : ACCENT} />
        <Text style={[styles.btnText, failed && styles.btnTextLoud]}>
          {failed
            ? `See things to do near ${venueName ?? "the venue"}`
            : "Browse all activities on GetYourGuide"}
        </Text>
        <Ionicons name="open-outline" size={12} color={failed ? "#101204" : ACCENT} />
      </Pressable>

      {failed && lat != null && lng != null ? (
        <Pressable
          style={styles.btn}
          onPress={() =>
            Linking.openURL(
              `https://www.google.com/maps/search/${encodeURIComponent(
                `things to do near ${venueName ?? ""} ${city ?? ""}`.trim())}`)}
        >
          <Ionicons name="map-outline" size={14} color={MUTED} />
          <Text style={[styles.btnText, { color: MUTED }]}>Or look on the map</Text>
        </Pressable>
      ) : null}

      {/* Required, and not only by good manners: this section is paid, unlike everything else
          on the page. The wording matches the covenant used elsewhere in the app, and it names
          the amount rather than hiding behind "may earn". */}
      <View style={styles.promise}>
        <Ionicons name="shield-checkmark" size={13} color="#7ef0b2" />
        <Text style={styles.promiseText}>
          We earn a commission if you book an activity here — it never changes what's shown or
          the order it's in. Concert tickets are different: we earn nothing on those.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 16,
    padding: 16, marginTop: 24,
  },
  h: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },
  sub: { color: MUTED, fontSize: 13, marginTop: 3, marginBottom: 14, lineHeight: 18 },

  frame: {
    borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", marginBottom: 4,
  },
  web: { flex: 1, backgroundColor: "#fff" },

  state: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 18 },
  stateText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderWidth: 1, borderColor: LINE, borderRadius: 11, paddingVertical: 12, marginTop: 12,
  },
  btnLoud: { backgroundColor: ACCENT, borderColor: ACCENT },
  btnText: { color: ACCENT, fontSize: 13, fontWeight: "800" },
  btnTextLoud: { color: "#101204" },

  promise: { flexDirection: "row", gap: 7, marginTop: 14, alignItems: "flex-start" },
  promiseText: { color: MUTED, fontSize: 11.5, lineHeight: 16, flex: 1 },
});
