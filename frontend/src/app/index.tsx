import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchEvents, MusicEvent } from "../lib/api";
import EventCard from "../components/event-card";
import EventDetailView from "../components/event-detail";

export default function HomeScreen() {
  const [events, setEvents] = useState<MusicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents("mxs").then(setEvents).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#e8ff47" size="large" /></View>;
  if (error) return <View style={styles.center}><Text style={styles.error}>Couldn't load events:{"\n"}{error}</Text></View>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.logo}>MUSIC<Text style={styles.accent}>X</Text></Text>
      <Text style={styles.sub}>Upcoming · {events.length} shows</Text>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => <EventCard event={item} onPress={() => setSelectedId(item.id)} />}
      />
      <Modal visible={!!selectedId} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selectedId ? <EventDetailView id={selectedId} onClose={() => setSelectedId(null)} /> : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: "#0b0b0f", alignItems: "center", justifyContent: "center", padding: 24 },
  logo: { color: "#f4f4f6", fontSize: 24, fontWeight: "800", letterSpacing: 1, marginTop: 8 },
  accent: { color: "#e8ff47" },
  sub: { color: "#9a9aa6", fontSize: 14, marginBottom: 12 },
  error: { color: "#ff6b6b", fontSize: 14, textAlign: "center" },
});
