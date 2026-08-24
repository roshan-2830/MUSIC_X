import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CalendarEvent, Festival } from "../lib/api";
import { coverColor, flagEmoji, zonedTime } from "../lib/format";
import { useSaves } from "../lib/saves";

const ACCENT = "#e8ff47";
const ACCENT_INK = "#101204";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const PANEL = "#14141b";
const PANEL2 = "#1b1b24";
const DANGER = "#ff6b6b";
const FEST = "#ffb200";

/** One label per card, strongest claim first — a cancellation outranks everything,
 *  because it is the thing the person most needs to see. Mirrors the backend's
 *  tag_kind, which is resolved where the saves and follows actually live. */
const TAGS: Record<string, { text: string; bg: string; fg: string }> = {
  cancelled: { text: "Cancelled", bg: "rgba(255,107,107,0.16)", fg: DANGER },
  postponed: { text: "Postponed", bg: "rgba(255,107,107,0.16)", fg: DANGER },
  ticket: { text: "Ticket saved", bg: ACCENT, fg: ACCENT_INK },
  plan: { text: "In your plan", bg: "rgba(232,255,71,0.14)", fg: ACCENT },
  following: { text: "Following", bg: "rgba(255,255,255,0.07)", fg: MUTED },
};

function Tag({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Money({ amount, currency }: { amount: number | null; currency: string | null }) {
  if (amount == null) return <Text style={styles.priceDash}>—</Text>;
  return (
    <Text style={styles.price}>
      <Text style={styles.priceFrom}>FROM </Text>
      {currency ? `${currency} ` : ""}{Math.round(amount)}
    </Text>
  );
}

/** A saved-state bookmark that never opens the card underneath it. */
function SaveButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.save, on && styles.saveOn]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={on ? "Remove from your calendar" : "Save to your calendar"}
    >
      <Ionicons name={on ? "bookmark" : "bookmark-outline"} size={14} color={on ? ACCENT : MUTED} />
    </Pressable>
  );
}

export function CalendarEventCard({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const { isSaved, toggle } = useSaves();
  // The server said what it knew when the page loaded; the context knows what the user
  // has tapped since. The context wins so the icon reacts instantly.
  const saved = isSaved(event.id) || event.saved;
  const off = event.status !== "scheduled";
  const tag = event.tag_kind ? TAGS[event.tag_kind] : null;
  const cityTag = event.tag_kind === "city" && event.city
    ? { text: `In ${event.city}`, bg: "rgba(255,255,255,0.07)", fg: MUTED }
    : null;
  const time = event.starts_at ? zonedTime(event.starts_at, event.timezone) : "TBA";

  return (
    <Pressable style={[styles.card, saved && styles.cardMine, off && styles.cardOff]} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.art}>
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={styles.fill} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.fill, { backgroundColor: coverColor(event.id + (event.city ?? "")) }]} />
          )}
        </View>
        <View style={styles.mid}>
          {tag ? <Tag {...tag} /> : cityTag ? <Tag {...cityTag} /> : null}
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {event.venue_name ?? "Venue TBA"}
            {event.city ? `, ${flagEmoji(event.country)} ${event.city}` : ""}
          </Text>
        </View>
      </View>

      <SaveButton on={saved} onPress={() => toggle(event)} />

      <View style={styles.foot}>
        <Text style={[styles.time, off && styles.timeMute]}>{time}</Text>
        <View style={styles.sep} />
        <Text style={styles.genre} numberOfLines={1}>{event.genres.join(" · ")}</Text>
        <Money amount={event.price_from_amount} currency={event.price_from_currency} />
      </View>
    </Pressable>
  );
}

export function CalendarFestivalCard({ festival, onPress }: { festival: Festival; onPress?: () => void }) {
  const { isFestivalSaved, toggleFestival } = useSaves();
  const saved = isFestivalSaved(festival.id) || !!festival.saved;
  const days = festival.days ?? 1;

  return (
    <Pressable style={[styles.card, saved && styles.cardMine]} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.art}>
          {festival.image_url ? (
            <Image source={{ uri: festival.image_url }} style={styles.fill} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.fill, { backgroundColor: coverColor(festival.id) }]} />
          )}
          <Text style={styles.artTag}>{days} {days === 1 ? "DAY" : "DAYS"}</Text>
        </View>
        <View style={styles.mid}>
          <Tag text={days === 1 ? "Festival" : `${days}-day festival`} bg="rgba(255,178,0,0.16)" fg={FEST} />
          <Text style={styles.title} numberOfLines={1}>{festival.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {flagEmoji(festival.country)} {festival.city ?? "Location TBA"}
          </Text>
        </View>
      </View>

      <SaveButton on={saved} onPress={() => toggleFestival(festival)} />

      <View style={styles.foot}>
        <Text style={styles.time}>ALL DAY</Text>
        <View style={styles.sep} />
        <Text style={styles.genre} numberOfLines={1}>
          {festival.artists_count ? `${festival.artists_count} artists` : ""}
        </Text>
        <Money amount={festival.price_from_amount} currency={festival.price_from_currency} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PANEL, borderColor: LINE, borderWidth: 1, borderRadius: 16,
    padding: 11, marginBottom: 9, position: "relative",
  },
  cardMine: { borderColor: "rgba(232,255,71,0.32)" },
  cardOff: { opacity: 0.7 },
  top: { flexDirection: "row", gap: 12 },
  art: { width: 62, height: 62, borderRadius: 12, overflow: "hidden", backgroundColor: PANEL2 },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  artTag: {
    position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center",
    fontSize: 8.5, fontWeight: "900", letterSpacing: 0.6, paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.5)", color: "#fff",
  },
  mid: { flex: 1, minWidth: 0, paddingRight: 28 },
  tag: { alignSelf: "flex-start", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 6 },
  tagText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.9, textTransform: "uppercase" },
  title: { color: "#f4f4f6", fontSize: 15.5, fontWeight: "800", lineHeight: 19 },
  sub: { color: MUTED, fontSize: 12.5, marginTop: 3 },
  save: {
    position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 9,
    backgroundColor: PANEL2, borderColor: LINE, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  saveOn: { backgroundColor: "rgba(232,255,71,0.13)", borderColor: "rgba(232,255,71,0.45)" },
  foot: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: LINE,
  },
  time: { color: ACCENT, fontSize: 12.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  timeMute: { color: MUTED },
  sep: { width: 3, height: 3, borderRadius: 2, backgroundColor: MUTED, opacity: 0.7 },
  genre: { color: MUTED, fontSize: 11.5, fontWeight: "600", flex: 1 },
  price: { color: "#f4f4f6", fontSize: 14, fontWeight: "800" },
  priceFrom: { color: MUTED, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  priceDash: { color: MUTED, fontSize: 14, fontWeight: "800" },
});
