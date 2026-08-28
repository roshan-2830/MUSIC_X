import { useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { getNearbyPlaces, NearbyPlaces, Place } from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const CARD = "#14141b";

/** The mockup's numbers, kept exactly: 178px wide, 10px apart. */
const CARD_W = 178;
const CARD_GAP = 10;

type Tab = "do" | "eat";

/** The mockup's own two tabs, in its own words. */
const TABS: { key: Tab; label: string }[] = [
  { key: "do", label: "Worth doing" },
  { key: "eat", label: "Eat & drink" },
];

/** OSM's category word to something readable, and an icon for it.
 *
 *  The category is shown rather than hidden behind a generic label, because "pub" and "cafe"
 *  and "museum" are the difference between plans. Anything unmapped falls through to its own
 *  raw word with a pin — a category we have not thought of is still information.
 */
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

/** The mockup's own hash: `h = (h * 31 + charCode) % 360`.
 *
 *  Kept identical so a place lands on the same colour here as in the design, and so the same
 *  name is the same colour every time somebody opens the page — a card that changes colour on
 *  each render reads as a glitch. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Two hues 70 degrees apart over a near-black base — the mockup's stageGlow.
 *
 *  It uses two radial gradients, which React Native cannot draw without pulling in a canvas
 *  library. A diagonal linear blend of the same two hues over the same base keeps what the
 *  block is FOR: a distinct, recognisable colour per place where there is no photograph, rather
 *  than eight identical grey rectangles. */
function glow(seed: string): [string, string, string] {
  const h = hashHue(seed);
  return [
    `hsl(${h}, 70%, 45%)`,
    `hsl(${(h + 70) % 360}, 75%, 50%)`,
    "#0c0c11",
  ];
}

/** Cuisine reads better as a sentence than as a tag: "Restaurant · Japanese". */
function tidy(s: string) {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function PlaceCard({ place, venueShort }: { place: Place; venueShort: string }) {
  const l = look(place.category);
  const what = [l.word, place.cuisine ? tidy(place.cuisine) : null].filter(Boolean).join(" · ");
  const [a, b, base] = glow(place.name + place.category);
  return (
    <View style={styles.placeCard}>
      <LinearGradient
        colors={[a, b, base]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.vis}
      >
        {/* Sits where the mockup puts its rating pill. Ours holds the walk, because that is
            the number we actually have — a star we cannot source would be a decoration
            pretending to be a fact. */}
        <View style={styles.pill}>
          <Ionicons name="walk" size={10} color="#fff" />
          <Text style={styles.pillText}>{place.walk_minutes} min</Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{place.name}</Text>
        <View style={styles.meta}>
          <Ionicons name={l.icon as any} size={11} color={MUTED} />
          <Text style={styles.metaText} numberOfLines={1}>{what}</Text>
        </View>
        <View style={styles.foot}>
          <Text style={styles.dist} numberOfLines={1}>
            {place.distance_m >= 1000
              ? `${(place.distance_m / 1000).toFixed(1)} km`
              : `${place.distance_m} m`}
          </Text>
          {place.directions_url ? (
            <Pressable
              style={styles.go}
              onPress={() => Linking.openURL(place.directions_url!)}
              accessibilityRole="button"
              accessibilityLabel={`Directions to ${place.name}`}
            >
              <Ionicons name="navigate" size={10} color="#101204" />
              <Text style={styles.goText}>Go</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** "Around the venue" — what's worth an hour before doors.
 *
 *  Places come from OpenStreetMap, cached per venue on our side. Walk times are straight-line
 *  from the venue's own coordinates, which is the one claim this section makes, so the
 *  Directions link starts at the venue too rather than at the phone.
 */
export default function AroundVenue({ eventId }: { eventId: string }) {
  const [data, setData] = useState<NearbyPlaces | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("do");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getNearbyPlaces(eventId).then((d) => {
      if (!alive) return;
      setData(d);
      // Opens on whichever tab actually has something. "Worth doing" is the better lead, but a
      // venue in a high street has twenty places to eat and two murals, and an empty first tab
      // makes the whole section look broken.
      if (d && !d.do.length && d.eat.length) setTab("eat");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [eventId]);

  // Nothing at all to say, and nowhere to send them: render nothing rather than an apology.
  if (!loading && (!data || (data.status !== "ok" && !data.search_url))) return null;

  const venueShort = (data?.venue_name ?? "the venue").split(/[,(]/)[0].trim();
  const list = data ? (tab === "do" ? data.do : data.eat) : [];
  const empty = !loading && data?.status === "ok" && !list.length;

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Around the venue</Text>
      <Text style={styles.sub}>
        What's worth your afternoon, and where to eat before doors — all within reach of{" "}
        {venueShort}.
      </Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]}
                     onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator color={ACCENT} /></View>
      ) : null}

      {!loading && data?.status !== "ok" ? (
        <View style={styles.state}>
          <Ionicons name="information-circle-outline" size={16} color={MUTED} />
          <Text style={styles.stateText}>{data?.reason ?? "Nothing to show yet."}</Text>
        </View>
      ) : null}

      {/* A snapping horizontal row, not a vertical list. The mockup makes this a shelf of
          cards on purpose: eight full-width rows push the line-up and the trip card off the
          screen, and this section is a glance rather than a directory. */}
      {!loading && data?.status === "ok" && list.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_W + CARD_GAP}
          snapToAlignment="start"
          contentContainerStyle={styles.shelf}
        >
          {list.map((p, i) => (
            <PlaceCard key={`${p.name}-${i}`} place={p} venueShort={venueShort} />
          ))}
        </ScrollView>
      ) : null}

      {empty ? (
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

      {data?.search_url ? (
        <Pressable style={styles.searchBtn} onPress={() => Linking.openURL(data.search_url!)}>
          <Ionicons name="search" size={13} color={MUTED} />
          <Text style={styles.searchText}>Search around the venue on Maps</Text>
          <Ionicons name="open-outline" size={12} color={MUTED} />
        </Pressable>
      ) : null}

      {/* The honest version of the mockup's disclosure. It promised "they're close and they're
          good"; we can only vouch for close, because these come from the map rather than from
          anyone's judgement. And unlike hotels, nobody pays us for any of this. */}
      <View style={styles.promise}>
        <Ionicons name="shield-checkmark" size={13} color="#7ef0b2" />
        <Text style={styles.promiseText}>
          We earn nothing on these — they're here because they're close. Walk times are
          straight-line from {venueShort}, so allow a little more.
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

  tabs: { flexDirection: "row", backgroundColor: "#0f0f14", borderRadius: 12, padding: 3, gap: 3 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  tabOn: { backgroundColor: ACCENT },
  tabText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  tabTextOn: { color: "#101204", fontSize: 13, fontWeight: "800" },

  // The mockup's own measurements: 178px cards, 10px apart, 84px of colour on top.
  // Named placeCard because `card` is already the section's own wrapper.
  shelf: { gap: CARD_GAP, paddingVertical: 2, paddingRight: 2 },
  placeCard: {
    width: CARD_W, backgroundColor: "#17171d", borderWidth: 1, borderColor: LINE,
    borderRadius: 14, overflow: "hidden",
  },
  vis: { height: 84, justifyContent: "flex-end", padding: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "rgba(11,11,15,0.78)", borderRadius: 20,
    paddingVertical: 3, paddingHorizontal: 7,
  },
  pillText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },

  body: { flex: 1, gap: 5, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 11 },
  name: { color: "#f4f4f6", fontSize: 12.5, fontWeight: "700", lineHeight: 16.5 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: MUTED, fontSize: 11, flex: 1 },
  foot: {
    marginTop: "auto", paddingTop: 7, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", gap: 6,
  },
  dist: { color: "#f4f4f6", fontSize: 12, fontWeight: "800" },
  go: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ACCENT,
    borderRadius: 9, paddingVertical: 6, paddingHorizontal: 9,
  },
  goText: { color: "#101204", fontSize: 10.5, fontWeight: "800" },

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
