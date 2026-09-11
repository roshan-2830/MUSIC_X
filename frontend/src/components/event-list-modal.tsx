import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import EventCard from "./event-card";
import { MusicEvent } from "../lib/api";
import { ToastHost } from "../lib/toast";


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
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={th.text} />
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
      {/* This screen is a Modal, which renders above the root host — so it draws its
          own. Several mounted at once is fine: only the topmost is on screen. */}
      <ToastHost />
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  title: { color: th.text, fontSize: 18, fontWeight: "800", flex: 1, textAlign: "center" },
  sub: { color: th.muted, fontSize: 13, paddingHorizontal: 16, marginTop: 2, marginBottom: 8 },
});
