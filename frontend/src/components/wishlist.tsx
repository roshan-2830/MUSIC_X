import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getWishlist,
  markWishlistSeen,
  removeFromWishlist,
  Wishlist,
  WishlistLine,
} from "../lib/api";
import { alpha, Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** A progress screen, not a list.
 *
 *  The count at the top is the whole point: a wishlist is the one list in this app that can
 *  be FINISHED, and the Passport is what finishes it. Without that pairing this would be a
 *  notes app with a music theme.
 */
export default function WishlistView({ onClose, onOpenEvent, onOpenArtist }: {
  onClose: () => void;
  onOpenEvent?: (id: string) => void;
  onOpenArtist?: (name: string) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [data, setData] = useState<Wishlist | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getWishlist().then(setData).catch(() => setData(null));
  }, []);
  useEffect(load, [load]);

  async function tick(line: WishlistLine, seen: boolean) {
    setBusy(line.artist_id);
    try {
      await markWishlistSeen(line.artist_id, seen);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function drop(line: WishlistLine) {
    setBusy(line.artist_id);
    try {
      await removeFromWishlist(line.artist_id);
      load();
    } finally {
      setBusy(null);
    }
  }

  function Line({ line }: { line: WishlistLine }) {
    const working = busy === line.artist_id;
    // A Passport tick is evidence and cannot be undone from here; a manual one is the
    // person's own word and can. The control disappears rather than failing silently.
    const evidenced = line.seen_via === "passport";
    return (
      <View style={styles.row}>
        <Pressable
          style={styles.tap}
          onPress={() => onOpenArtist?.(line.name)}
          disabled={!onOpenArtist}
        >
          {line.image_url ? (
            <Image source={{ uri: line.image_url }} style={styles.avatar} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{line.name[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, line.seen && styles.nameSeen]} numberOfLines={1}>
              {line.name}
            </Text>

            {line.seen ? (
              <Text style={styles.sub} numberOfLines={1}>
                {evidenced
                  ? `Seen${line.seen_on ? ` · ${shortDate(line.seen_on)}` : ""} · from your Passport`
                  : "Seen · you told us"}
              </Text>
            ) : line.next_event_id ? (
              // A want becomes a save in one tap. This line is why the list is useful
              // without notifications attached to it.
              <Pressable onPress={() => onOpenEvent?.(line.next_event_id!)} hitSlop={4}>
                <Text style={styles.playing} numberOfLines={1}>
                  Playing {line.next_event_city ?? "somewhere"} · {shortDate(line.next_event_starts_at)}
                </Text>
              </Pressable>
            ) : (
              // NOT "not touring" — we only know what we hold. Different claim, said plainly.
              <Text style={styles.sub} numberOfLines={1}>Nothing announced yet</Text>
            )}
          </View>
        </Pressable>

        {working ? (
          <ActivityIndicator color={th.accent} />
        ) : line.seen ? (
          evidenced ? (
            <Ionicons name="checkmark-circle" size={22} color={th.success} />
          ) : (
            <Pressable onPress={() => tick(line, false)} hitSlop={8} accessibilityLabel="Not seen after all">
              <Ionicons name="checkmark-circle" size={22} color={th.success} />
            </Pressable>
          )
        ) : (
          <Pressable onPress={() => tick(line, true)} hitSlop={8} accessibilityLabel="I've seen them">
            <Ionicons name="ellipse-outline" size={22} color={th.outline} />
          </Pressable>
        )}

        <Pressable onPress={() => drop(line)} hitSlop={8} accessibilityLabel={`Remove ${line.name}`}>
          <Ionicons name="close" size={17} color={th.faint} />
        </Pressable>
      </View>
    );
  }

  const total = data?.total ?? 0;
  const seenCount = data?.seen_count ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={th.text} />
        </Pressable>
        <Text style={styles.title}>Wishlist</Text>
        {total ? <Text style={styles.count}>{seenCount} of {total}</Text> : null}
      </View>

      {data === null ? (
        <ActivityIndicator color={th.accent} style={{ marginTop: 40 }} />
      ) : total === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={38} color={th.muted} style={{ opacity: 0.5 }} />
          <Text style={styles.emptyT}>Acts you want to see live</Text>
          <Text style={styles.emptyS}>
            Open any artist and add them. We&rsquo;ll tell you here when they have a date —
            and cross them off once you&rsquo;ve been.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* The lead line, and only when it is true. "0 playing" is not worth a sentence. */}
          {data.playing_count ? (
            <View style={styles.banner}>
              <Ionicons name="musical-notes" size={14} color={th.accent} />
              <Text style={styles.bannerT}>
                {data.playing_count} on your wishlist {data.playing_count === 1 ? "has" : "have"} a date
              </Text>
            </View>
          ) : null}

          {data.still_to_see.length ? (
            <>
              <Text style={styles.group}>Still to see · {data.still_to_see.length}</Text>
              {data.still_to_see.map((l) => <Line key={l.artist_id} line={l} />)}
            </>
          ) : null}

          {data.seen.length ? (
            <>
              <Text style={styles.group}>Seen · {data.seen.length}</Text>
              {data.seen.map((l) => <Line key={l.artist_id} line={l} />)}
            </>
          ) : null}

          <Text style={styles.foot}>
            Crossed off automatically when your Passport records the show — or tap the circle
            if you saw them before Music X.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  head: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  title: { color: th.text, fontSize: 24, fontWeight: "800" },
  count: {
    marginLeft: "auto", color: th.accent, fontSize: 13, fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  body: { padding: 16, paddingTop: 4, paddingBottom: 40 },

  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: alpha(th.accent, 0.10), borderWidth: 1, borderColor: alpha(th.accent, 0.28),
    borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
  },
  bannerT: { color: th.accent, fontSize: 13, fontWeight: "800", flexShrink: 1 },

  group: {
    color: th.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.9,
    textTransform: "uppercase", marginTop: 18, marginBottom: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  tap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: th.panel2 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: th.muted, fontSize: 18, fontWeight: "800" },
  name: { color: th.text, fontSize: 15, fontWeight: "700" },
  // Struck through rather than hidden: the list is a record of what you wanted, and the
  // crossed-off half is the part worth being pleased about.
  nameSeen: { color: th.text3, textDecorationLine: "line-through" },
  sub: { color: th.muted, fontSize: 12.5, marginTop: 2 },
  playing: { color: th.accent, fontSize: 12.5, fontWeight: "700", marginTop: 2 },

  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 70, gap: 8 },
  emptyT: { color: th.text, fontSize: 17, fontWeight: "800", marginTop: 10 },
  emptyS: { color: th.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
  foot: { color: th.faint, fontSize: 11.5, lineHeight: 17, marginTop: 22 },
});
