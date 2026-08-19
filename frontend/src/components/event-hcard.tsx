import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MusicEvent } from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function coverColor(id: string) {
  return `hsl(${hashNum(id) % 360} 42% 24%)`;
}
function fmtDay(iso: string | null) {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function EventHCard({
  event,
  onPress,
  reasonLabel,
  reasonKind,
}: {
  event: MusicEvent;
  onPress: () => void;
  reasonLabel?: string;
  reasonKind?: "artist" | "genre";
}) {
  const sub = `${fmtDay(event.starts_at)}${event.city ? ` · ${event.city}` : ""}`;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cover}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.fill} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.fill, { backgroundColor: coverColor(event.id) }]} />
        )}
        {reasonLabel ? (
          <View style={styles.reasonPill}>
            <Ionicons name={reasonKind === "genre" ? "musical-notes" : "heart"} size={10} color="#0b0b0f" />
            <Text style={styles.reasonText} numberOfLines={1}>{reasonLabel}</Text>
          </View>
        ) : null}
        {event.mxs != null ? (
          <View style={styles.mxsBadge}><Text style={styles.mxsText}>{event.mxs.toFixed(1)}</Text></View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
      <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 152, marginRight: 14 },
  cover: { width: 152, height: 152, borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  mxsBadge: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  mxsText: { color: ACCENT, fontSize: 13, fontWeight: "800" },
  reasonPill: {
    position: "absolute", top: 8, left: 8, maxWidth: 128,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  reasonText: { color: "#0b0b0f", fontSize: 11, fontWeight: "800", flexShrink: 1 },
  title: { color: "#f4f4f6", fontSize: 14, fontWeight: "700", lineHeight: 18 },
  sub: { color: MUTED, fontSize: 12, marginTop: 3 },
});
