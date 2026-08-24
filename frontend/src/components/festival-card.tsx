import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Festival } from "../lib/api";
import { coverColor } from "../lib/format";
import { useSaves } from "../lib/saves";

const MUTED = "#9a9aa6";
const ACCENT = "#e8ff47";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtRange(s: string | null, e: string | null): string {
  if (!s) return "Dates TBA";
  const sd = new Date(s);
  const start = `${MONTHS[sd.getMonth()]} ${sd.getDate()}`;
  if (!e) return start;
  const ed = new Date(e);
  if (sd.getMonth() === ed.getMonth()) return `${MONTHS[sd.getMonth()]} ${sd.getDate()}–${ed.getDate()}`;
  return `${start} – ${MONTHS[ed.getMonth()]} ${ed.getDate()}`;
}

/** @param full  stretch to the container width — used by the Calendar list, where
 *               festivals sit in the same single column as concerts. The Home row
 *               keeps the fixed 260px so cards scroll horizontally. */
export default function FestivalCard({
  festival,
  onPress,
  full = false,
}: {
  festival: Festival;
  onPress?: () => void;
  full?: boolean;
}) {
  const { isFestivalSaved, toggleFestival } = useSaves();
  const saved = isFestivalSaved(festival.id);
  const meta = [fmtRange(festival.starts_on, festival.ends_on), festival.city]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable style={[styles.card, full && styles.cardFull]} onPress={onPress}>
      <View style={[styles.imageWrap, full && styles.imageWrapFull]}>
        {festival.image_url ? (
          <Image source={{ uri: festival.image_url }} style={styles.fill} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.fill, { backgroundColor: coverColor(festival.id) }]} />
        )}
        <Pressable
          style={styles.save}
          onPress={() => toggleFestival(festival)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove from calendar" : "Save to calendar"}
        >
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={18}
            color={saved ? ACCENT : "#fff"}
          />
        </Pressable>
      </View>

      <Text style={styles.name} numberOfLines={2}>{festival.name}</Text>
      <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 260, marginRight: 14 },
  cardFull: { width: "100%", marginRight: 0, marginBottom: 14 },
  imageWrapFull: { width: "100%", height: 150 },
  imageWrap: {
    width: 260,
    height: 150,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 9,
    backgroundColor: "#14141b",
  },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  save: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderRadius: 999,
    padding: 7,
  },
  name: { color: "#f4f4f6", fontSize: 16, fontWeight: "800", lineHeight: 20 },
  meta: { color: MUTED, fontSize: 13, marginTop: 3 },
});
