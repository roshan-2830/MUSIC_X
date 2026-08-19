import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import EventCard from "./event-card";
import { MusicEvent } from "../lib/api";

const MUTED = "#9a9aa6";

// Accepts plain events or recommended events (which carry a reason to show as a pill).
type ListEvent = MusicEvent & { reason_label?: string; reason_kind?: "artist" | "genre" };

/** A full-screen vertical list of a section's shows — opened from any "See all" link. */
export default function EventListModal({
  title,
  sub,
  events,
  onClose,
  onSelect,
}: {
  title: string;
  sub?: string;
  events: ListEvent[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#f4f4f6" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <Text style={styles.sub}>
        {events.length} show{events.length === 1 ? "" : "s"}{sub ? ` · ${sub}` : ""}
      </Text>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            reasonLabel={item.reason_label}
            reasonKind={item.reason_kind}
            onPress={() => onSelect(item.id)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800", flex: 1, textAlign: "center" },
  sub: { color: MUTED, fontSize: 13, paddingHorizontal: 16, marginTop: 2, marginBottom: 8 },
});
