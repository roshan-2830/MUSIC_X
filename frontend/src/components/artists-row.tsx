import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FollowedArtist, getFollows } from "../lib/api";
import { coverColor } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

/** Strip accents, case and punctuation — so "A.R. Rahman" and "AR Rahman" match.
 *  Mirrors the backend's `_norm`, which is what the rest of the app dedupes on. */
function norm(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const reach = (a: FollowedArtist) =>
  Math.max(a.deezer_fans ?? 0, a.lastfm_listeners ?? 0);

/** "A.R. Rahman feat. Alka Yagnik; Udit Narayan; Sukhwinder Singh" is a credit line off
 *  a track listing, not an artist — and it becomes a tile labelled "A.R." next to the
 *  real A.R. Rahman. A semicolon never appears in a band name, and neither does "feat.",
 *  so both are safe to treat as credits. Deliberately narrow: "Florence and the Machine"
 *  and "Nick Cave and the Bad Seeds" must survive, so plain "and" is not a signal.
 *  Display-only — the manage screen still lists them so they can be unfollowed. */
function isCreditLine(name: string): boolean {
  return /;| feat\.? | featuring /i.test(name || "");
}

/** One tile per artist, not one per spelling.
 *
 *  The same act gets followed twice easily — "A.R. Rahman" from one show's line-up and
 *  "AR Rahman" from another's. In a list that is barely noticeable; in a row of faces it
 *  is four identical tiles. So we group by normalised name and keep the biggest, since
 *  the well-known spelling is the one with the audience behind it. Ties prefer whichever
 *  has a photo, then the longer name (usually the properly punctuated one). */
export function dedupe(list: FollowedArtist[]): FollowedArtist[] {
  const best = new Map<string, FollowedArtist>();
  for (const a of list) {
    if (isCreditLine(a.name)) continue;
    const key = norm(a.name);
    if (!key) continue;
    const held = best.get(key);
    if (!held) {
      best.set(key, a);
      continue;
    }
    const better =
      reach(a) !== reach(held)
        ? reach(a) > reach(held)
        : !!a.image_url !== !!held.image_url
        ? !!a.image_url
        : a.name.length > held.name.length;
    if (better) best.set(key, a);
  }
  return [...best.values()];
}

/** The artists row on Home: a "+" then everyone you follow. */
export default function ArtistsRow({
  refreshKey,
  onOpenArtist,
  onSeeAll,
  onAdd,
}: {
  refreshKey?: number;
  onOpenArtist: (name: string) => void;
  onSeeAll: () => void;
  onAdd: () => void;
}) {
  const [artists, setArtists] = useState<FollowedArtist[]>([]);

  const load = useCallback(() => {
    getFollows()
      .then((list) => setArtists(dedupe(list)))
      .catch(() => setArtists([]));
  }, []);

  useEffect(load, [load, refreshKey]);

  // Re-read on every focus. Home stays mounted while Search is pushed on top of it, so
  // an unfollow made over there left this row showing an artist the user had just
  // removed. Focus is the only reliable signal that we might be stale.
  useFocusEffect(load);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Your artists</Text>
        {artists.length ? (
          <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAllRow}>
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="arrow-forward" size={13} color={ACCENT} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.sub}>
        {artists.length
          ? "Tap one for their tour · + to add more"
          : "Follow artists and they’ll appear here — we’ll alert you when they announce a date"}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Pressable style={styles.tile} onPress={onAdd}>
          <View style={styles.addCircle}>
            <Ionicons name="add" size={26} color={ACCENT} />
          </View>
          <Text style={styles.name} numberOfLines={1}>Add</Text>
        </Pressable>

        {artists.map((a) => (
          <Pressable key={a.id} style={styles.tile} onPress={() => onOpenArtist(a.name)}>
            {a.image_url ? (
              <Image source={{ uri: a.image_url }} style={styles.circle} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.circle, { backgroundColor: coverColor(a.id) }]} />
            )}
            {/* Two short lines, not the first word: truncating gave "Cold" for Cold War
                Kids and "Major" for Major Lazer, which reads as a different act. */}
            <Text style={styles.name} numberOfLines={2}>{a.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const CIRCLE = 66;
const styles = StyleSheet.create({
  section: { marginTop: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  seeAllRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  seeAll: { color: ACCENT, fontSize: 13, fontWeight: "700" },
  sub: { color: MUTED, fontSize: 13, paddingHorizontal: 16, marginTop: 2, marginBottom: 12, lineHeight: 18 },
  scroll: { gap: 14, paddingHorizontal: 16 },
  tile: { width: CIRCLE + 8, alignItems: "center" },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, marginBottom: 7 },
  addCircle: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, marginBottom: 7,
    borderWidth: 1.5, borderColor: ACCENT, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  name: { color: "#c8c8d0", fontSize: 11.5, fontWeight: "600", textAlign: "center", lineHeight: 14 },
});
