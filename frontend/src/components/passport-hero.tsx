/**
 * The Passport hero: a skyline that is also an equaliser.
 *
 * The bars along the bottom read two ways at once, which is exactly what this page is about —
 * a row of buildings if you are thinking about cities, a row of levels if you are thinking about
 * music. They breathe, so the page has a pulse without anything flashing at you.
 *
 * Behind them, two soft blooms drift like stage lights through haze. Above, the countries you
 * have collected, tilted like ink stamps on a worn page.
 *
 * Everything animates on the UI thread through reanimated, so it costs nothing on the JS side
 * while somebody is scrolling. Motion is slow and looping by design: this is a background, and
 * a background that demands attention has stopped being one.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";

import { flagEmoji } from "../lib/format";

const ACCENT = "#e8ff47";

// A real passport's name line is a serif; the machine strip is a monospace. Android has no
// Georgia, so the generic family is the fallback rather than a silent substitution.
export const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });
export const MONO = Platform.select({ ios: "Menlo", android: "monospace",
                                      default: "ui-monospace, Menlo, monospace" });

/** Stable pseudo-random from a string, so nothing reshuffles between renders. */
function seeded(s: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

const BAR_COUNT = 22;

function Bar({ index }: { index: number }) {
  const t = useSharedValue(0);
  // Heights chosen from the index, not at random: a skyline should keep its shape, and only
  // the levels should move.
  const base = 22 + seeded(`b${index}`, 5) * 58;
  const swing = 10 + seeded(`s${index}`, 11) * 26;

  useEffect(() => {
    const dur = 1500 + seeded(`d${index}`, 17) * 1800;
    t.value = withRepeat(
      withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [index, t]);

  const style = useAnimatedStyle(() => ({ height: base + t.value * swing }));
  return <Animated.View style={[styles.bar, style, { opacity: 0.22 + (index % 5) * 0.07 }]} />;
}

/** A slow drifting bloom — stage light through haze. */
function Bloom({ color, size, from, to, duration, style }: {
  color: string; size: number; from: number; to: number; duration: number; style: any;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [duration, t]);
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: from + t.value * (to - from) },
                { scale: 0.9 + t.value * 0.25 }],
    opacity: 0.10 + t.value * 0.07,
  }));
  return (
    <Animated.View pointerEvents="none" style={[
      { position: "absolute", width: size, height: size, borderRadius: size / 2,
        backgroundColor: color }, style, a]} />
  );
}

const SLOTS = [
  { top: 16, left: 18 }, { top: 10, right: 24 },
  { top: 74, left: 6 },  { top: 66, right: 8 },
  { top: 30, left: "38%" as const }, { top: 96, right: "34%" as const },
];

export default function PassportHero({ stamps, onBack }:
  { stamps: { country: string; shows: number }[]; onBack: () => void }) {
  const shown = stamps.slice(0, SLOTS.length);

  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={["#12122a", "#1b1338", "#0b0b14"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Bloom color={ACCENT} size={240} from={-60} to={80} duration={9000}
             style={{ top: -90, left: 0 }} />
      <Bloom color="#7b5cff" size={260} from={60} to={-70} duration={11000}
             style={{ top: -40, right: 0 }} />

      {/* Skyline / equaliser. Anchored to the bottom edge so the bars grow upward. */}
      <View style={styles.bars} pointerEvents="none">
        {Array.from({ length: BAR_COUNT }, (_, i) => <Bar key={i} index={i} />)}
      </View>
      {/* Fades the bars into the page rather than cutting them off. */}
      <LinearGradient
        colors={["transparent", "rgba(11,11,15,0.75)"]}
        style={styles.barFade} pointerEvents="none"
      />

      {shown.map((s, i) => {
        const rot = (seeded(s.country, 7) * 30 - 15).toFixed(1);
        return (
          <View key={s.country} pointerEvents="none"
                style={[styles.stamp, SLOTS[i] as any,
                        { opacity: 0.20 + seeded(s.country, 13) * 0.12,
                          transform: [{ rotate: `${rot}deg` }] }]}>
            <Text style={styles.stampFlag}>{flagEmoji(s.country)}</Text>
            <Text style={styles.stampCC}>{s.country}</Text>
          </View>
        );
      })}

      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </Pressable>

      <View style={styles.middle} pointerEvents="none">
        <View style={styles.crest}>
          <Ionicons name="musical-notes" size={24} color={ACCENT} />
        </View>
        <Text style={styles.title}>Concert Passport</Text>
        <Text style={styles.sub}>Every stage. Every city. All yours.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 230, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  middle: { alignItems: "center", paddingBottom: 26 },
  back: { position: "absolute", top: 14, left: 16, width: 36, height: 36, borderRadius: 18,
          backgroundColor: "rgba(0,0,0,0.32)", alignItems: "center", justifyContent: "center",
          zIndex: 3 },
  crest: { width: 52, height: 52, borderRadius: 15, backgroundColor: "rgba(232,255,71,0.10)",
           alignItems: "center", justifyContent: "center", marginBottom: 12,
           borderWidth: 1, borderColor: "rgba(232,255,71,0.30)" },
  title: { color: "#fff", fontSize: 27, fontWeight: "900", letterSpacing: -0.6 },
  sub: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600", marginTop: 6 },

  bars: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120,
          flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
          paddingHorizontal: 8, gap: 3 },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: ACCENT },
  barFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },

  stamp: { position: "absolute", alignItems: "center", justifyContent: "center",
           width: 54, height: 54, borderRadius: 11,
           borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", borderStyle: "dashed" },
  stampFlag: { fontSize: 20, lineHeight: 24 },
  stampCC: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
});
