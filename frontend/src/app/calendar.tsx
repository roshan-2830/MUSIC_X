import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import EventCard from "../components/event-card";
import EventDetailView from "../components/event-detail";
import { useSaves } from "../lib/saves";

export default function CalendarScreen() {
  const { saves } = useSaves();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.sub}>
          {saves.length} saved show{saves.length === 1 ? "" : "s"} · soonest first
        </Text>
      </View>

      {saves.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={46} color="#9a9aa6" />
          <Text style={styles.emptyT}>No saved shows yet</Text>
          <Text style={styles.emptyS}>Tap “Save to Calendar” on any event and it’ll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={saves}
          keyExtractor={(e) => e.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => <EventCard event={item} onPress={() => setSelectedId(item.id)} />}
        />
      )}

      <Modal visible={!!selectedId} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selectedId ? <EventDetailView id={selectedId} onClose={() => setSelectedId(null)} /> : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { color: "#f4f4f6", fontSize: 24, fontWeight: "800" },
  sub: { color: "#9a9aa6", fontSize: 14, marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  emptyT: { color: "#f4f4f6", fontSize: 17, fontWeight: "800", marginTop: 8 },
  emptyS: { color: "#9a9aa6", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
