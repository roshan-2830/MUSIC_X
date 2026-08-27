import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  clearStayBase, Flight, getFlights, getStayBase, getStays, setStayBase, Stay, StayBase,
  TravelOptions,
} from "../lib/api";
import StayMap from "./stay-map";
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

/** Where they said they're staying, with the walk to the doors.
 *
 *  Everything on this card came from the property's own record — Tripsure's /api/hotel/details
 *  — rather than from the search row that was tapped, so the address and the check-in time are
 *  the hotel's own. It is deliberately not styled as a confirmed reservation, because it isn't
 *  one: nothing has been paid for, and saying otherwise would be the kind of claim this app
 *  exists not to make.
 */
function BaseCard({
  base,
  venueName,
  onDirections,
  onClear,
}: {
  base: StayBase;
  venueName: string | null;
  onDirections: () => void;
  onClear: () => void;
}) {
  const km = base.metres_to_venue != null
    ? base.metres_to_venue >= 1000
      ? `${(base.metres_to_venue / 1000).toFixed(1)} km`
      : `${base.metres_to_venue} m`
    : null;
  return (
    <View style={styles.base}>
      <View style={styles.baseHead}>
        <Ionicons name="bed" size={14} color={ACCENT} />
        <Text style={styles.baseLabel}>YOUR BASE</Text>
        <Pressable onPress={onClear} hitSlop={10} accessibilityLabel="Remove your base">
          <Text style={styles.baseClear}>Change</Text>
        </Pressable>
      </View>
      <Text style={styles.baseName} numberOfLines={2}>{base.name}</Text>
      {base.address ? (
        <Text style={styles.baseAddr} numberOfLines={2}>
          {base.address}{base.postal_code ? `, ${base.postal_code}` : ""}
        </Text>
      ) : null}
      {km ? (
        <Text style={styles.baseMeta}>
          {km} from {venueName ?? "the venue"}
          {base.walk_minutes != null ? ` · ${base.walk_minutes} min walk` : ""}
        </Text>
      ) : null}
      {base.check_in_time ? (
        <Text style={styles.baseMeta}>Check-in {base.check_in_time}
          {base.check_out_time ? ` · out ${base.check_out_time}` : ""}</Text>
      ) : null}
      {base.directions_url ? (
        <Pressable style={styles.dirBtn} onPress={onDirections}>
          <Ionicons name="navigate" size={14} color="#101204" />
          <Text style={styles.dirBtnText}>Directions to the venue</Text>
          <Ionicons name="open-outline" size={12} color="#101204" />
        </Pressable>
      ) : null}
      {/* Said plainly, once. A card this confident could easily be read as a reservation. */}
      <Text style={styles.baseNote}>Saved by you — not a booking.</Text>
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

/** How long, in the form a traveller reads: 11h45, not 705 minutes. */
function duration(mins: number | null): string | null {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}m`;
}

function FlightRow({ flight }: { flight: Flight }) {
  const price = money(flight.price_amount, flight.price_currency);
  const stops = flight.stops == null ? null
    : flight.stops === 0 ? "Direct"
    : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  return (
    <View style={styles.row}>
      <View style={styles.thumb}><Ionicons name="airplane" size={18} color={MUTED} /></View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {hhmm(flight.departs_at)} → {hhmm(flight.arrives_at)}
          {flight.origin ? `  ${flight.origin}–${flight.destination}` : ""}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[flight.airline, duration(flight.duration_minutes), stops].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {price ? <Text style={styles.price}>{price}</Text> : null}
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
  const [base, setBase] = useState<StayBase | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

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

  // Loaded once on mount, not with the tab: a base that has already been chosen is the answer
  // to "where am I staying", and waiting for a supplier call to show it would hide a fact we
  // already hold. Cheap — our own database, no supplier involved.
  useEffect(() => {
    let alive = true;
    getStayBase(eventId).then((b) => { if (alive) setBase(b); });
    return () => { alive = false; };
  }, [eventId]);

  const pick = async (s: Stay) => {
    if (!s.hotel_id) return;
    setPicking(true);
    setPickError(null);
    try {
      setBase(await setStayBase(
        eventId,
        { hotel_id: s.hotel_id, provider: s.supplier_provider, image_url: s.image_url },
        { doc_key: stays?.doc_key ?? null, search_token: stays?.search_token ?? null },
      ));
    } catch {
      // Named as ours, not theirs. The tap succeeded; the lookup behind it did not, and their
      // preprod fails often enough that a traveller must not read this as their own mistake.
      setPickError("We couldn't save that just now — try again in a moment.");
    } finally {
      setPicking(false);
    }
  };

  const drop = async () => {
    setBase(null);
    setPickError(null);
    await clearStayBase(eventId);
  };

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
            {/* A map, not a list. Twenty rows of hotel names answer a question nobody asked;
                the question is "is there anywhere near the venue", and a pin per hotel around
                a marked venue answers it at a glance. Prices ride on the pins. Booking
                happens on Tripsure's own page, so there is nothing here to tap through. */}
            {hasMap ? (
              <StayMap
                lat={lat!} lng={lng!} venue={venueName} stays={stays.stays}
                onPick={pick} pickedHotelId={base?.hotel_id ?? null} picking={picking}
              />
            ) : null}
            {picking ? (
              <View style={styles.empty}><ActivityIndicator color={ACCENT} /></View>
            ) : null}
            {pickError ? (
              <View style={styles.empty}>
                <Ionicons name="alert-circle-outline" size={16} color={MUTED} />
                <Text style={styles.emptyText}>{pickError}</Text>
              </View>
            ) : null}
            {base ? (
              <BaseCard
                base={base} venueName={venueName}
                onDirections={() => Linking.openURL(base.directions_url!)}
                onClear={drop}
              />
            ) : null}
            {stays.booking_url ? <BookButton url={stays.booking_url} /> : null}
          </>
        ) : (
          <>
            {/* The base comes first when there are no pins to show. Their listing 500s often,
                and a traveller who has already chosen a hotel must not be told there is
                nowhere to stay — we know exactly where they are sleeping. */}
            {base ? (
              <BaseCard
                base={base} venueName={venueName}
                onDirections={() => Linking.openURL(base.directions_url!)}
                onClear={drop}
              />
            ) : null}
            <Empty options={stays} kind="Stay" />
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
          <>
            <Text style={styles.dates}>
              Arriving the day before · cheapest first
            </Text>
            {flights.flights.map((f, i) => <FlightRow key={`${f.flight_number}-${i}`} flight={f} />)}
            {/* No Book button, deliberately. Their consumer site is hotels only — /flights
                serves the hotel homepage and every results route 404s — so there is nowhere
                to hand a traveller over to. Booking flights would mean taking passenger
                details and payment ourselves, which is a decision, not a missing button. */}
            <Text style={styles.footnote}>
              Prices for planning. Booking flights isn't connected yet.
            </Text>
          </>
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
  empty: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 22 },
  emptyText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },
  footnote: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 12, fontStyle: "italic" },
  promise: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 14 },
  // The base card. Bordered in the accent rather than filled with it: it is a fact the
  // traveller told us, worth finding at a glance, but not a call to action.
  base: {
    marginTop: 14, padding: 14, borderRadius: 14, borderWidth: 1,
    borderColor: "rgba(232,255,71,0.35)", backgroundColor: "#101014",
  },
  baseHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  baseLabel: {
    color: ACCENT, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, flex: 1,
  },
  baseClear: { color: MUTED, fontSize: 12, fontWeight: "700" },
  baseName: { color: "#f4f4f6", fontSize: 15, fontWeight: "800" },
  baseAddr: { color: MUTED, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  baseMeta: { color: "#c9c9d2", fontSize: 12.5, marginTop: 5, fontWeight: "600" },
  dirBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: ACCENT, borderRadius: 11, paddingVertical: 11, marginTop: 12,
  },
  dirBtnText: { color: "#101204", fontSize: 13.5, fontWeight: "800" },
  baseNote: { color: MUTED, fontSize: 11, marginTop: 9, textAlign: "center" },

  promiseText: { color: MUTED, fontSize: 11, lineHeight: 16, flex: 1 },
});
