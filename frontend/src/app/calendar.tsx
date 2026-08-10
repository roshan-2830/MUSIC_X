import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Placeholder for now — the full calendar (saved shows, month/agenda views)
// is a later feature. This just gives the Calendar tab something to show.
export default function CalendarScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={48} color="#e8ff47" />
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.sub}>Your saved shows and plans will live here.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  title: { color: "#f4f4f6", fontSize: 22, fontWeight: "800" },
  sub: { color: "#9a9aa6", fontSize: 14, textAlign: "center" },
});
