import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { getUnreadCount } from "../lib/api";

const ACCENT = "#e8ff47";
const DANGER = "#ff6b6b";

// The badge goes red only for the alerts that mean something you planned around has
// moved — a cancellation, a postponement, a date change. A price drop is good news
// and does not deserve an alarm colour.
export default function NotificationBell({
  onPress,
  refreshKey,
}: {
  onPress: () => void;
  refreshKey?: number;
}) {
  const [count, setCount] = useState({ unread: 0, urgent: 0 });

  const load = useCallback(() => {
    getUnreadCount().then(setCount);   // never throws — see api.ts
  }, []);

  useEffect(load, [load, refreshKey]);

  // Re-check when the user comes back to the app; alerts are written by the backend,
  // so the count can change while the phone is in someone's pocket.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") load();
    });
    return () => sub.remove();
  }, [load]);

  const { unread, urgent } = count;
  return (
    <Pressable style={styles.btn} onPress={onPress} hitSlop={8}>
      <Ionicons
        name={unread ? "notifications" : "notifications-outline"}
        size={20}
        color={urgent ? DANGER : unread ? ACCENT : "#f4f4f6"}
      />
      {unread ? (
        <View style={[styles.badge, { backgroundColor: urgent ? DANGER : ACCENT }]}>
          <Text style={[styles.badgeText, { color: urgent ? "#fff" : "#0b0b0f" }]}>
            {unread > 9 ? "9+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 6 },
  badge: {
    position: "absolute", top: 1, right: 0, minWidth: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: "#0b0b0f",
  },
  badgeText: { fontSize: 10, fontWeight: "900" },
});
