import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

// A tappable "fake" search bar for the Home screen. It doesn't take input
// itself — tapping it opens the full Search screen (src/app/search.tsx).
export default function SearchBar() {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      onPress={() => router.push("/search")}
    >
      <Ionicons name="search" size={18} color="#9a9aa6" />
      <Text style={styles.placeholder}>Search artists, concerts, festivals…</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#14141b",
    borderWidth: 1,
    borderColor: "#26262f",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  pressed: { opacity: 0.7 },
  placeholder: { color: "#9a9aa6", fontSize: 15 },
});
