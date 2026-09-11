import { Ionicons } from "@expo/vector-icons";
import { enablePush, pushStatus, type PushState } from "@/hooks/use-push";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import {
  AppNotification, getNotifications, markAllNotificationsRead, markNotificationRead,
} from "../lib/api";


// Each alert type gets an icon and a colour that matches what it means. A cancellation
// is not the same weight of news as a price drop, and shouldn't look like it.
// A function of the theme, not a constant: a colour table fixed at import time cannot
// answer which theme is live, and a hook cannot be called out here to ask.
const lookTable = (th: Theme): Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> => ({
  cancellation: { icon: "close-circle", color: th.danger, label: "Cancelled" },
  postponed:    { icon: "pause-circle", color: th.warn,   label: "Postponed" },
  date_change:  { icon: "calendar",     color: th.warn,   label: "New date" },
  reinstated:   { icon: "checkmark-circle", color: th.success, label: "Back on" },
  price_drop:   { icon: "pricetag",     color: th.success,   label: "Cheaper" },
  new_show:     { icon: "musical-notes", color: th.accent, label: "New date" },
  // Somebody asked you to come. Without these two an invitation arrived as a grey bell
  // labelled "Update" — the generic fallback — which is how the most personal alert in the
  // app ended up looking like the least important one.
  // The three time-driven reminders. Without these they arrived as the generic grey bell
  // labelled "Update" — the same fallback the invite alerts fell into — which is how a day-of
  // reminder ends up looking less urgent than a price change.
  on_sale:         { icon: "pricetags",   color: th.accent, label: "On sale" },
  reminder_week:   { icon: "time",        color: th.warn,   label: "One week" },
  reminder_day:    { icon: "flash",       color: th.accent, label: "Tonight" },
  invite:          { icon: "person-add",  color: th.accent, label: "Invited" },
  invite_accepted: { icon: "people",      color: th.success, label: "Coming" },
});
const lookOf = (t: string, th: Theme) =>
  lookTable(th)[t] ?? { icon: "notifications" as const, color: th.muted, label: "Update" };

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
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether this device is set up to be told about alerts while the app is closed.
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [asking, setAsking] = useState(false);

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

  // Read once when the screen opens, so the banner reflects the real permission rather than
  // whatever it was when the app started.
  useEffect(() => { pushStatus().then(setPushState); }, []);

  async function turnOnPush() {
    setAsking(true);
    // Called straight from a tap on purpose — the permission prompt is refused by Safari and
    // penalised by Chrome when it is not tied to a user gesture.
    const { state } = await enablePush();
    setPushState(state);
    setAsking(false);
  }

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
          <Ionicons name="chevron-back" size={26} color={th.text} />
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

      {pushState && pushState !== 'registered' && pushState !== 'unsupported' ? (
        <Pressable
          style={styles.pushBanner}
          onPress={pushState === 'denied' ? undefined : turnOnPush}
          disabled={asking || pushState === 'denied'}>
          <Ionicons
            name={pushState === 'denied' ? 'notifications-off' : 'notifications'}
            size={18}
            color={pushState === 'denied' ? th.muted : th.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.pushT}>
              {pushState === 'denied'
                ? 'Notifications are blocked'
                : asking
                  ? 'Asking your browser…'
                  : 'Get told when something changes'}
            </Text>
            <Text style={styles.pushS}>
              {pushState === 'denied'
                ? 'Turn them back on in your browser’s site settings for this page.'
                : pushState === 'needs-dev-build'
                  ? 'Not available in this build of the app.'
                  : pushState === 'error'
                    ? 'Something went wrong setting this up — tap to try again.'
                    : 'A cancelled show should reach you before you leave the house.'}
            </Text>
          </View>
          {pushState === 'denied' ? null : (
            <Ionicons name="chevron-forward" size={18} color={th.muted} />
          )}
        </Pressable>
      ) : null}


      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={th.muted} />
          <Text style={styles.emptyT}>Couldn’t load your alerts</Text>
          <Text style={styles.emptyS}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={44} color={th.muted} />
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
              tintColor={th.muted}
              onRefresh={() => {
                setRefreshing(true);
                load().finally(() => setRefreshing(false));
              }}
            />
          }
          renderItem={({ item }) => {
            const look = lookOf(item.type, th);
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
                  <Ionicons name="chevron-forward" size={15} color={th.muted} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  pushBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginBottom: 8, padding: 14,
    borderRadius: 14, backgroundColor: th.panel,
    borderWidth: 1, borderColor: th.panel3,
  },
  pushT: { color: th.text, fontSize: 14, fontWeight: "700" },
  pushS: { color: th.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  root: { flex: 1, backgroundColor: th.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
  },
  title: { color: th.text, fontSize: 18, fontWeight: "800" },
  readAll: { color: th.accent, fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  emptyT: { color: th.text, fontSize: 17, fontWeight: "800", marginTop: 8 },
  emptyS: { color: th.muted, fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: th.panel, borderColor: th.line, borderWidth: 1,
    borderRadius: 14, padding: 13, marginBottom: 10,
  },
  rowUnread: { backgroundColor: th.panel, borderColor: th.outline },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
  tag: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  time: { color: th.muted, fontSize: 11 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: th.accentFill },
  rowTitle: { color: th.text, fontSize: 14.5, fontWeight: "700", lineHeight: 19 },
  rowBody: { color: th.text3, fontSize: 12.5, lineHeight: 17.5, marginTop: 3 },
  rowMeta: { color: th.muted, fontSize: 11.5, marginTop: 5 },
});
