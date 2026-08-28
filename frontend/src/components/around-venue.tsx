import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { NearbyPlaces, Place } from "../lib/api";
import CollapsibleCard from "./collapsible-card";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";

type Tab = "do" | "eat";

/** The mockup's own two tabs, in its own words. */
const TABS: { key: Tab; label: string }[] = [
  { key: "do", label: "Worth doing" },
  { key: "eat", label: "Eat & drink" },
];

/** OSM's category word made readable, with an icon.
 *
 *  The category is shown rather than hidden behind a generic label, because "pub" and "museum"
 *  and "park" are the difference between plans. An unmapped tag falls through to its own raw
 *  word with a pin — a category nobody anticipated is still information. */
const LOOK: Record<string, { icon: string; word: string }> = {
  cafe: { icon: "cafe", word: "Café" },
  restaurant: { icon: "restaurant", word: "Restaurant" },
  fast_food: { icon: "fast-food", word: "Quick bite" },
  bar: { icon: "wine", word: "Bar" },
  pub: { icon: "beer", word: "Pub" },
  biergarten: { icon: "beer", word: "Beer garden" },
  ice_cream: { icon: "ice-cream", word: "Ice cream" },
  park: { icon: "leaf", word: "Park" },
  garden: { icon: "leaf", word: "Garden" },
  museum: { icon: "business", word: "Museum" },
  gallery: { icon: "color-palette", word: "Gallery" },
  artwork: { icon: "brush", word: "Public art" },
  memorial: { icon: "flag", word: "Memorial" },
  monument: { icon: "flag", word: "Monument" },
  viewpoint: { icon: "eye", word: "Viewpoint" },
  attraction: { icon: "star", word: "Attraction" },
  theatre: { icon: "film", word: "Theatre" },
  cinema: { icon: "film", word: "Cinema" },
  zoo: { icon: "paw", word: "Zoo" },
  aquarium: { icon: "fish", word: "Aquarium" },
  castle: { icon: "shield", word: "Castle" },
  ruins: { icon: "shield", word: "Ruins" },
};

function look(category: string) {
  return LOOK[category] ?? { icon: "location", word: category.replace(/_/g, " ") };
}

function tidy(s: string) {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The mockup's own hash: h = (h * 31 + charCode) % 360.
 *
 *  Kept identical so a place lands on the same colour as in the design, and so the same name is
 *  the same colour on every open — a colour that changes per render reads as a glitch. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function hues(seed: string): [string, string] {
  const h = hashHue(seed);
  return [`hsl(${h}, 70%, 52%)`, `hsl(${(h + 70) % 360}, 75%, 55%)`];
}

function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function Row({ place }: { place: Place }) {
  const l = look(place.category);
  const [a, b] = hues(place.name + place.category);
  return (
    <View style={styles.row}>
      {/* The mockup gives each place a block of colour. A vertical list has no room for one, so
          it becomes a stripe — same idea, same hash, a fraction of the space, and it still
          makes a long list scannable rather than uniform. */}
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                      style={styles.stripe} />
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name={l.icon as any} size={11} color={MUTED} />
          <Text style={styles.meta} numberOfLines={1}>
            {[l.word, place.cuisine ? tidy(place.cuisine) : null].filter(Boolean).join(" · ")}
            {"  ·  "}{place.walk_minutes} min walk
          </Text>
        </View>
      </View>
      <Text style={styles.dist}>{metres(place.distance_m)}</Text>
      {place.directions_url ? (
        <Pressable
          style={styles.go}
          onPress={() => Linking.openURL(place.directions_url!)}
          accessibilityRole="button"
          accessibilityLabel={`Directions to ${place.name}`}
        >
          <Ionicons name="navigate" size={12} color="#101204" />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * "Around the venue" — what's worth an hour before doors.
 *
 * A dropdown holding a vertical list. It was a horizontal shelf of cards, which the mockup
 * specifies, but a shelf hides most of itself: whatever is off the right edge is only found by
 * someone who thinks to swipe. Collapsed to one line it costs nothing, and open it shows
 * everything at once.
 *
 * Places come from OpenStreetMap and nobody pays us for them. Walk times are straight-line from
 * the venue's own coordinates, so the Directions link starts at the venue too.
 */
export default function AroundVenue({
  places,
  loading,
}: {
  places: NearbyPlaces | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<Tab>("do");

  const venueShort = useMemo(
    () => (places?.venue_name ?? "the venue").split(/[,(]/)[0].trim(),
    [places?.venue_name],
  );
  const list = places ? (tab === "do" ? places.do : places.eat) : [];
  const total = (places?.do.length ?? 0) + (places?.eat.length ?? 0);

  // Nothing to say and nowhere to send them: render nothing rather than an apology.
  if (!loading && (!places || (places.status !== "ok" && !places.search_url))) return null;

  return (
    <CollapsibleCard
      title="Around the venue"
      subtitle={`What's worth your afternoon, and where to eat before doors — all within reach of ${venueShort}.`}
      count={total || null}
      icon="compass"
    >
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const n = places ? (t.key === "do" ? places.do.length : places.eat.length) : 0;
          return (
            <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]}
                       onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>
                {t.label}{n ? `  ${n}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator color={ACCENT} /></View>
      ) : null}

      {!loading && places?.status !== "ok" ? (
        <View style={styles.state}>
          <Ionicons name="information-circle-outline" size={16} color={MUTED} />
          <Text style={styles.stateText}>{places?.reason ?? "Nothing to show yet."}</Text>
        </View>
      ) : null}

      {!loading && places?.status === "ok" && list.length
        ? list.map((p, i) => <Row key={`${p.name}-${i}`} place={p} />)
        : null}

      {!loading && places?.status === "ok" && !list.length ? (
        <View style={styles.state}>
          <Ionicons name="information-circle-outline" size={16} color={MUTED} />
          {/* Said the way the mockup says it: empty rather than padded. */}
          <Text style={styles.stateText}>
            {tab === "do"
              ? `Nothing mapped around ${venueShort} yet — so this is empty rather than padded.`
              : `No places to eat mapped near ${venueShort} yet.`}
          </Text>
        </View>
      ) : null}

      {places?.search_url ? (
        <Pressable style={styles.searchBtn} onPress={() => Linking.openURL(places.search_url!)}>
          <Ionicons name="search" size={13} color={MUTED} />
          <Text style={styles.searchText}>Search around the venue on Maps</Text>
          <Ionicons name="open-outline" size={12} color={MUTED} />
        </Pressable>
      ) : null}

      <View style={styles.promise}>
        <Ionicons name="shield-checkmark" size={13} color="#7ef0b2" />
        <Text style={styles.promiseText}>
          We earn nothing on these — they're here because they're close. Walk times are
          straight-line from {venueShort}, so allow a little more.
        </Text>
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row", backgroundColor: "#0f0f14", borderRadius: 12, padding: 3, gap: 3,
    marginBottom: 4,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  tabOn: { backgroundColor: ACCENT },
  tabText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  tabTextOn: { color: "#101204", fontSize: 13, fontWeight: "800" },

  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LINE,
  },
  stripe: { width: 3, height: 34, borderRadius: 2 },
  rowBody: { flex: 1 },
  name: { color: "#f4f4f6", fontSize: 14, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  meta: { color: MUTED, fontSize: 11.5, flex: 1 },
  dist: { color: "#c9c9d2", fontSize: 12, fontWeight: "800" },
  go: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: ACCENT,
    alignItems: "center", justifyContent: "center",
  },

  state: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 18 },
  stateText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },

  searchBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: LINE, borderRadius: 11, paddingVertical: 11, marginTop: 14,
  },
  searchText: { color: MUTED, fontSize: 12.5, fontWeight: "700" },

  promise: { flexDirection: "row", gap: 7, marginTop: 14, alignItems: "flex-start" },
  promiseText: { color: MUTED, fontSize: 11.5, lineHeight: 16, flex: 1 },
});
