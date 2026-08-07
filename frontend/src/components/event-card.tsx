import { Pressable, StyleSheet, Text, View } from "react-native";
import { MusicEvent } from "../lib/api";
import { coverColor, flagEmoji, formatDay } from "../lib/format";

const CONF: Record<string, string> = {
  high: "checked & confirmed",
  medium: "mostly confirmed",
  low: "not confirmed yet",
};
const confColor = (c: string) => (c === "high" ? "#7ef0b2" : c === "medium" ? "#f0d47e" : "#8a8a96");

export default function EventCard({ event, onPress }: { event: MusicEvent; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.cover, { backgroundColor: coverColor(event.id + (event.city ?? "")) }]}>
        <Text style={styles.flag}>{flagEmoji(event.country)} {event.city ?? ""}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.when}>{formatDay(event.starts_at, event.timezone)}</Text>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.where}>📍 {event.venue_name ?? "Venue TBA"}</Text>

        <View style={styles.foot}>
          {event.mxs != null ? (
            <View style={styles.mxsPill}><Text style={styles.mxsText}>{event.mxs.toFixed(1)}/10</Text></View>
          ) : (
            <View style={styles.noscorePill}><Text style={styles.noscoreText}>No rating yet</Text></View>
          )}
          {event.confidence ? (
            <View style={styles.confPill}>
              <View style={[styles.dot, { backgroundColor: confColor(event.confidence) }]} />
              <Text style={styles.confText}>{CONF[event.confidence] ?? event.confidence}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 16, overflow: "hidden", marginBottom: 14 },
  cover: { height: 120, justifyContent: "flex-end", padding: 12 },
  flag: { color: "#fff", fontWeight: "800", fontSize: 14, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  body: { padding: 14 },
  when: { color: "#9a9aa6", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 },
  title: { color: "#f4f4f6", fontSize: 20, fontWeight: "800", marginVertical: 3 },
  where: { color: "#9a9aa6", fontSize: 13 },
  foot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
  mxsPill: { backgroundColor: "#e8ff47", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 },
  mxsText: { color: "#101204", fontWeight: "800", fontSize: 13 },
  noscorePill: { borderWidth: 1, borderColor: "#26262f", borderStyle: "dashed", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: "#1b1b24" },
  noscoreText: { color: "#9a9aa6", fontSize: 12 },
  confPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1b1b24", borderColor: "#26262f", borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  confText: { color: "#9a9aa6", fontSize: 12 },
});
