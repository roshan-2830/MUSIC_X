import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

// A tappable "fake" search bar for the Home screen. It doesn't take input
// itself — tapping it opens the full Search screen (src/app/search.tsx).
export default function SearchBar() {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      onPress={() => router.push("/search")}
    >
      <Ionicons name="search" size={18} color={th.muted} />
      <Text style={styles.placeholder}>Search artists, concerts, festivals…</Text>
    </Pressable>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: th.panel,
    borderWidth: 1,
    borderColor: th.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  pressed: { opacity: 0.7 },
  placeholder: { color: th.muted, fontSize: 15 },
});
