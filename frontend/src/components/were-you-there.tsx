/**
 * "Were you there?" — the question that fills the Concert Passport.
 *
 * The passport cannot fill itself, because a show being in your calendar and the date passing
 * does not mean you went: people fall ill, sell tickets, and change their minds. A passport that
 * assumed would record intentions and call them memories.
 *
 * But leaving the tick on the event page meant the honest record stayed empty for the least
 * honest reason — nobody remembered to go and find it. So the question comes to you instead:
 * automatic asking, manual answering, which is the only combination that is both effortless and
 * true.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { AttendanceAsk, answerAttended, answerMissed, getUnansweredShows } from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

export default function WereYouThere({ onAnswered }: { onAnswered?: () => void }) {
  const [asks, setAsks] = useState<AttendanceAsk[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { getUnansweredShows().then(setAsks).catch(() => setAsks([])); }, []);

  const answer = useCallback(async (a: AttendanceAsk, went: boolean) => {
    setBusy(a.event_id);
    try {
      await (went ? answerAttended(a.event_id) : answerMissed(a.event_id));
      // Removed locally rather than re-fetched: the answer is already known, and a round trip
      // would leave the card sitting there looking unresponsive on a slow connection.
      setAsks((prev) => prev.filter((x) => x.event_id !== a.event_id));
      onAnswered?.();
    } catch {
      setBusy(null);
      return;
    }
    setBusy(null);
  }, [onAnswered]);

  if (!asks.length) return null;

  // One at a time. A stack of these is an interrogation, and the rest keep until tomorrow.
  const a = asks[0];
  const when = a.starts_at
    ? new Date(a.starts_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition} style={styles.card}>
      <View style={styles.row}>
        {a.image_url ? (
          <Image source={{ uri: a.image_url }} style={styles.img} />
        ) : (
          <View style={[styles.img, styles.imgFallback]}>
            <Ionicons name="musical-notes" size={18} color={MUTED} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.q}>
            {a.had_ticket ? "You had tickets. Were you there?" : "Did you make it?"}
          </Text>
          <Text style={styles.t} numberOfLines={1}>{a.title}</Text>
          <Text style={styles.s} numberOfLines={1}>
            {[when, a.city].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.no]}
          disabled={!!busy}
          onPress={() => answer(a, false)}>
          <Text style={styles.noT}>I didn’t go</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.yes]}
          disabled={!!busy}
          onPress={() => answer(a, true)}>
          {busy === a.event_id ? (
            <ActivityIndicator color="#101204" size="small" />
          ) : (
            <Text style={styles.yesT}>I was there</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.foot}>
        <Ionicons name="musical-notes-outline" size={11} color={MUTED} /> Yes adds it to your
        Concert Passport{asks.length > 1 ? ` · ${asks.length - 1} more to confirm` : ""}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginBottom: 18, padding: 14, borderRadius: 16,
    backgroundColor: "#14141b", borderWidth: 1, borderColor: "#2b2b36",
  },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  img: { width: 52, height: 52, borderRadius: 10, backgroundColor: "#1b1b24" },
  imgFallback: { alignItems: "center", justifyContent: "center" },
  q: { color: ACCENT, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  t: { color: "#f4f4f6", fontSize: 15, fontWeight: "700", marginTop: 3 },
  s: { color: MUTED, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: "center" },
  no: { backgroundColor: "#1b1b24", borderWidth: 1, borderColor: "#2b2b36" },
  noT: { color: "#c9c9d2", fontSize: 14, fontWeight: "700" },
  yes: { backgroundColor: ACCENT },
  yesT: { color: "#101204", fontSize: 14, fontWeight: "800" },
  foot: { color: MUTED, fontSize: 11, marginTop: 10, textAlign: "center" },
});
