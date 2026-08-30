/**
 * The Passport hero — your own stamps, scattered like ink on a worn page.
 *
 * The mockup's pink-to-orange gradient belongs to nothing else in this product; it was a
 * placeholder for "make this bit feel special". This is the same intent using the one thing
 * that is genuinely special about the page: the countries YOU have collected. It grows as you
 * travel, and two people's passports never look alike.
 *
 * Built from plain Views and transforms rather than SVG, so it adds no dependency. Positions are
 * derived from the country code, not random, so a stamp does not jump about between renders —
 * a passport page that reshuffles itself every time you open it would read as broken.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { flagEmoji } from "../lib/format";

const ACCENT = "#e8ff47";

/** A stable pseudo-random from the country code, so each stamp keeps its place. */
function seeded(cc: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < cc.length; i++) h = (h * 31 + cc.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

// Slots around the edges, kept clear of the middle where the title sits. A stamp behind the
// words would make both harder to read, which is the usual way this kind of decoration fails.
const SLOTS = [
  { top: 14, left: 22 }, { top: 8, left: "58%" as const }, { top: 30, right: 18 },
  { top: 96, left: 10 }, { top: 104, right: 12 }, { top: 62, left: "44%" as const },
  { top: 140, left: 30 }, { top: 148, right: 34 },
];

export default function PassportHero({ stamps, onBack }:
  { stamps: { country: string; shows: number }[]; onBack: () => void }) {
  const shown = stamps.slice(0, SLOTS.length);

  return (
    <LinearGradient
      // Deep ink, the app's own darkness rather than a colour borrowed from nothing.
      colors={["#141428", "#1d1636", "#0f0f18"]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.hero}>
      {/* A wash of the brand accent, so the page still feels lit rather than flat. */}
      <View style={styles.glow} pointerEvents="none" />

      {shown.map((s, i) => {
        const slot = SLOTS[i];
        const rot = (seeded(s.country, 7) * 36 - 18).toFixed(1);   // -18°…+18°
        const op = 0.16 + seeded(s.country, 13) * 0.14;            // faded, like old ink
        return (
          <View
            key={s.country}
            pointerEvents="none"
            style={[styles.stamp, slot as any,
                    { opacity: op, transform: [{ rotate: `${rot}deg` }] }]}>
            <Text style={styles.stampFlag}>{flagEmoji(s.country)}</Text>
            <Text style={styles.stampCC}>{s.country}</Text>
          </View>
        );
      })}

      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </Pressable>

      <View style={styles.crest}>
        <Ionicons name="musical-notes" size={24} color={ACCENT} />
      </View>
      <Text style={styles.title}>Concert Passport</Text>
      <Text style={styles.sub}>Every stage. Every city. All yours.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { height: 210, alignItems: "center", justifyContent: "center",
          paddingHorizontal: 30, paddingBottom: 30, overflow: "hidden" },
  glow: {
    position: "absolute", top: -110, right: -70, width: 260, height: 260, borderRadius: 130,
    backgroundColor: ACCENT, opacity: 0.07,
  },
  back: { position: "absolute", top: 14, left: 16, width: 36, height: 36, borderRadius: 18,
          backgroundColor: "rgba(0,0,0,0.32)", alignItems: "center", justifyContent: "center" },
  crest: { width: 52, height: 52, borderRadius: 15, backgroundColor: "rgba(232,255,71,0.10)",
           alignItems: "center", justifyContent: "center", marginBottom: 12,
           borderWidth: 1, borderColor: "rgba(232,255,71,0.28)" },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "600", marginTop: 6 },

  stamp: {
    position: "absolute", alignItems: "center", justifyContent: "center",
    width: 58, height: 58, borderRadius: 12,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", borderStyle: "dashed",
  },
  stampFlag: { fontSize: 22, lineHeight: 26 },
  stampCC: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
});
