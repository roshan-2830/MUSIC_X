import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AppNotification, getNotifications, markAllNotificationsRead, markNotificationRead,
} from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const DANGER = "#ff6b6b";
const WARN = "#f0d47e";
const GOOD = "#7ee081";

// Each alert type gets an icon and a colour that matches what it means. A cancellation
// is not the same weight of news as a price drop, and shouldn't look like it.
const LOOK: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  cancellation: { icon: "close-circle", color: DANGER, label: "Cancelled" },
  postponed:    { icon: "pause-circle", color: WARN,   label: "Postponed" },
  date_change:  { icon: "calendar",     color: WARN,   label: "New date" },
  reinstated:   { icon: "checkmark-circle", color: GOOD, label: "Back on" },
  price_drop:   { icon: "pricetag",     color: GOOD,   label: "Cheaper" },
  new_show:     { icon: "musical-notes", color: ACCENT, label: "New date" },
};
const lookOf = (t: string) => LOOK[t] ?? { icon: "notifications" as const, color: MUTED, label: "Update" };

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The alert inbox. Opened from the bell on Home. */
export default function NotificationsModal({
  onClose,
  onOpenEvent,
}: {
  onClose: () => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await getNotifications(100));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const unread = items.filter((n) => !n.is_read).length;

  async function openOne(n: AppNotification) {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.event_id) {
      onClose();
      onOpenEvent(n.event_id);
    }
  }

  async function readAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#f4f4f6" />
        </Pressable>
        <Text style={styles.title}>Alerts</Text>
        {unread ? (
          <Pressable onPress={readAll} hitSlop={8}>
            <Text style={styles.readAll}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
          <Text style={styles.emptyT}>Couldn’t load your alerts</Text>
          <Text style={styles.emptyS}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={44} color={MUTED} />
          <Text style={styles.emptyT}>No alerts yet</Text>
          <Text style={styles.emptyS}>
            Save a show or follow an artist, and we’ll tell you here if a date moves, a show is
            cancelled, or tickets go on sale.{"\n\n"}
            We only send what we can verify against the source — so quiet means nothing has changed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={MUTED}
              onRefresh={() => {
                setRefreshing(true);
                load().finally(() => setRefreshing(false));
              }}
            />
          }
          renderItem={({ item }) => {
            const look = lookOf(item.type);
            return (
              <Pressable
                style={[styles.row, !item.is_read && styles.rowUnread]}
                onPress={() => openOne(item)}
              >
                <View style={[styles.iconWrap, { borderColor: look.color }]}>
                  <Ionicons name={look.icon} size={17} color={look.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.tag, { color: look.color }]}>{look.label}</Text>
                    <Text style={styles.time}>{ago(item.created_at)}</Text>
                    {!item.is_read ? <View style={styles.dot} /> : null}
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                  {item.body ? (
                    <Text style={styles.rowBody} numberOfLines={3}>{item.body}</Text>
                  ) : null}
                  {item.event_city ? (
                    <Text style={styles.rowMeta}>{item.event_city}</Text>
                  ) : null}
                </View>
                {item.event_id ? (
                  <Ionicons name="chevron-forward" size={15} color={MUTED} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
  },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  readAll: { color: ACCENT, fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  emptyT: { color: "#f4f4f6", fontSize: 17, fontWeight: "800", marginTop: 8 },
  emptyS: { color: MUTED, fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 14, padding: 13, marginBottom: 10,
  },
  rowUnread: { backgroundColor: "#191922", borderColor: "#33333f" },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
  tag: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  time: { color: MUTED, fontSize: 11 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  rowTitle: { color: "#f4f4f6", fontSize: 14.5, fontWeight: "700", lineHeight: 19 },
  rowBody: { color: "#c8c8d0", fontSize: 12.5, lineHeight: 17.5, marginTop: 3 },
  rowMeta: { color: MUTED, fontSize: 11.5, marginTop: 5 },
});
