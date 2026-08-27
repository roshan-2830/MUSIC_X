import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { Flight, getFlights, getStays, Stay, TravelOptions } from "../lib/api";
import VenueMap from "./venue-map";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const CARD = "#14141b";

type Tab = "getting" | "stay" | "map";

const TABS: { key: Tab; label: string }[] = [
  { key: "getting", label: "Getting there" },
  { key: "stay", label: "Stay" },
  { key: "map", label: "Venue map" },
];

function money(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null;
  const sym = currency === "INR" ? "₹" : currency === "GBP" ? "£" : currency === "EUR" ? "€"
    : currency === "USD" ? "$" : "";
  return sym ? `${sym}${Math.round(amount).toLocaleString()}` : `${Math.round(amount).toLocaleString()} ${currency ?? ""}`;
}

function hhmm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toTimeString().slice(0, 5);
}

/** The honest empty state. A travel section that says nothing at all reads as broken; one
 *  that says "no hotels here" when the truth is "we could not ask" is worse than broken. */
function Empty({ options, kind }: { options: TravelOptions | null; kind: string }) {
  if (!options) return null;
  const line =
    options.status === "not_configured"
      ? `${kind} search isn't connected yet — it's coming.`
      : options.reason ?? `No ${kind.toLowerCase()} to show right now.`;
  return (
    <View style={styles.empty}>
      <Ionicons name="information-circle-outline" size={16} color={MUTED} />
      <Text style={styles.emptyText}>{line}</Text>
    </View>
  );
}

/** One button for the tab, not one per hotel: Tripsure has no per-property URL — every
 *  /stays/hotel/{key} variant 404s — so the hand-over is at city level, pre-filled with the
 *  show's dates. */
function BookButton({ url }: { url: string }) {
  return (
    <Pressable style={styles.bookWide} onPress={() => Linking.openURL(url)}>
      <Ionicons name="bed-outline" size={16} color="#101204" />
      <Text style={styles.bookWideText}>Book a hotel</Text>
      <Ionicons name="open-outline" size={13} color="#101204" />
    </Pressable>
  );
}

function StayRow({ stay }: { stay: Stay }) {
  const price = money(stay.price_amount, stay.price_currency);
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        {stay.image_url ? (
          <Image source={{ uri: stay.image_url }} style={styles.fill} contentFit="cover" transition={120} />
        ) : (
          <Ionicons name="bed-outline" size={20} color={MUTED} />
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{stay.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[stay.distance, stay.board_basis, stay.refundability].filter(Boolean).join(" · ")}
        </Text>
        {stay.supplier ? <Text style={styles.supplier}>via {stay.supplier}</Text> : null}
      </View>
      <View style={styles.rowEnd}>
        {price ? <Text style={styles.price}>{price}</Text> : null}
        {price ? <Text style={styles.perNight}>per night</Text> : null}
      </View>
    </View>
  );
}

function FlightRow({ flight }: { flight: Flight }) {
  const price = money(flight.price_amount, flight.price_currency);
  const stops = flight.stops == null ? "" : flight.stops === 0 ? "Direct" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  return (
    <View style={styles.row}>
      <View style={styles.thumb}><Ionicons name="airplane" size={18} color={MUTED} /></View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {hhmm(flight.departs_at)} → {hhmm(flight.arrives_at)}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[flight.airline, flight.flight_number, stops].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {price ? <Text style={styles.price}>{price}</Text> : null}
        {flight.deep_link ? (
          <Pressable style={styles.book} onPress={() => Linking.openURL(flight.deep_link!)}>
            <Text style={styles.bookText}>Book</Text>
            <Ionicons name="open-outline" size={11} color="#101204" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function PlanTrip({
  eventId,
  venueName,
  city,
  lat,
  lng,
  homeCity,
}: {
  eventId: string;
  venueName: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  /** Where this person is travelling from. Flights cannot be searched without it. */
  homeCity: string | null;
}) {
  // The map opens first, deliberately: it is the one tab that always has an answer, so the
  // card is never introduced by an apology.
  const [tab, setTab] = useState<Tab>("map");
  const [stays, setStays] = useState<TravelOptions | null>(null);
  const [flights, setFlights] = useState<TravelOptions | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetched on first visit to a tab, not on mount. Two supplier calls for a section nobody
  // opened would be paid for by every event page view.
  useEffect(() => {
    let alive = true;
    if (tab === "stay" && stays === null) {
      setLoading(true);
      getStays(eventId).then((r) => { if (alive) { setStays(r); setLoading(false); } });
    }
    if (tab === "getting" && flights === null && homeCity) {
      setLoading(true);
      getFlights(eventId, homeCity).then((r) => { if (alive) { setFlights(r); setLoading(false); } });
    }
    return () => { alive = false; };
  }, [tab, eventId, homeCity, stays, flights]);

  const hasMap = lat != null && lng != null && !(lat === 0 && lng === 0);

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Plan your trip</Text>
      <Text style={styles.sub}>Getting there, a room near the venue, and the way in.</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabOn]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.empty}><ActivityIndicator color={ACCENT} /></View>
      ) : null}

      {!loading && tab === "map" ? (
        hasMap ? (
          <VenueMap lat={lat!} lng={lng!} venue={venueName || "the venue"} city={city} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="information-circle-outline" size={16} color={MUTED} />
            <Text style={styles.emptyText}>We don't know where this venue is yet.</Text>
          </View>
        )
      ) : null}

      {!loading && tab === "stay" ? (
        stays?.stays?.length ? (
          <>
            {stays.check_in ? (
              <Text style={styles.dates}>
                {stays.check_in} → {stays.check_out} · near {venueName ?? city}
              </Text>
            ) : null}
            {stays.stays.map((s, i) => <StayRow key={`${s.name}-${i}`} stay={s} />)}
            {stays.booking_url ? <BookButton url={stays.booking_url} /> : null}
          </>
        ) : (
          <>
            <Empty options={stays} kind="Stay" />
            {/* The link needs no API call, so it still works when the listing endpoint does
                not — which is exactly what happened on the day this was built. */}
            {stays?.booking_url ? <BookButton url={stays.booking_url} /> : null}
          </>
        )
      ) : null}

      {!loading && tab === "getting" ? (
        !homeCity ? (
          <View style={styles.empty}>
            <Ionicons name="information-circle-outline" size={16} color={MUTED} />
            <Text style={styles.emptyText}>Set your city in your profile and we'll find flights.</Text>
          </View>
        ) : flights?.flights?.length ? (
          flights.flights.map((f, i) => <FlightRow key={`${f.flight_number}-${i}`} flight={f} />)
        ) : (
          <Empty options={flights} kind="Flight" />
        )
      ) : null}

      {/* Required by the covenant, not decoration: the fee is disclosed on the surface where
          the booking happens, and it states plainly that it buys no placement. */}
      {tab !== "map" ? (
        <View style={styles.promise}>
          <Ionicons name="shield-checkmark" size={13} color="#7ef0b2" />
          <Text style={styles.promiseText}>
            We may earn a referral fee if you book — it never changes what's listed here, or the
            order it's in.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 16,
    padding: 16, marginTop: 24,
  },
  h: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },
  sub: { color: MUTED, fontSize: 13, marginTop: 3, marginBottom: 14 },
  tabs: { flexDirection: "row", backgroundColor: "#0f0f14", borderRadius: 12, padding: 3, gap: 3 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  tabOn: { backgroundColor: ACCENT },
  tabText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  tabTextOn: { color: "#101204" },
  dates: { color: MUTED, fontSize: 12, marginTop: 12, marginBottom: 2 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: "#1e1e26",
  },
  thumb: {
    width: 46, height: 46, borderRadius: 10, backgroundColor: "#1b1b24",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  rowBody: { flex: 1 },
  rowTitle: { color: "#f4f4f6", fontSize: 14, fontWeight: "700" },
  rowSub: { color: MUTED, fontSize: 12, marginTop: 2 },
  rowEnd: { alignItems: "flex-end", gap: 5 },
  price: { color: "#f4f4f6", fontSize: 14, fontWeight: "800" },
  book: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ACCENT,
    borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10,
  },
  bookText: { color: "#101204", fontSize: 12, fontWeight: "800" },
  bookWide: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 13, marginTop: 14,
  },
  bookWideText: { color: "#101204", fontSize: 15, fontWeight: "800" },
  perNight: { color: MUTED, fontSize: 10 },
  supplier: { color: MUTED, fontSize: 11, marginTop: 2 },
  empty: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 22 },
  emptyText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },
  promise: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 14 },
  promiseText: { color: MUTED, fontSize: 11, lineHeight: 16, flex: 1 },
});
