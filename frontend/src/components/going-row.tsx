import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Going } from "../lib/api";
import { Avatar } from "./invite-sheet";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const CARD = "#14141b";
const LINE = "#26262f";

/**
 * "Rahul, Priya and 3 others you follow are going."
 *
 * Instagram's "followed by" line, applied to a night out: not a headcount of strangers, which
 * is a number nobody can act on, but the specific people whose plans are a reason to go.
 *
 * Faces are not tappable yet — there is no profile screen to land on, and a name that looks
 * like a link and does nothing is worse than one that does not.
 */
export default function GoingRow({
  going,
  onPress,
}: {
  going: Going | null;
  /** Opens the sheet that splits them into ticket-holders and interested. */
  onPress?: () => void;
}) {
  if (!going || !going.total || !going.summary) return null;
  const withTickets = going.going_count;
  const interested = going.interested_count;
  return (
    <Pressable
      style={styles.wrap}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${going.summary}. See who.`}
    >
      <View style={styles.faces}>
        {going.people.map((p, i) => (
          // Overlapped deliberately: a cluster reads as "a few people", where a neat row of
          // separate circles reads as a list to be counted.
          <View key={p.id} style={[styles.face, i > 0 && styles.overlap]}>
            <Avatar name={p.display_name} size={28} />
            {p.booked ? (
              <View style={styles.ticket}>
                <Ionicons name="ticket" size={8} color="#101204" />
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.text} numberOfLines={2}>{going.summary}</Text>
        {/* The two counts side by side, because they are different claims. Saving a show is an
            intention; having a ticket is a fact, and only the person can tell us it. */}
        <Text style={styles.sub} numberOfLines={1}>
          {[
            withTickets ? `${withTickets} with tickets` : null,
            interested ? `${interested} interested` : null,
          ].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={MUTED} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 11,
    backgroundColor: CARD, borderColor: LINE, borderWidth: 1, borderRadius: 14,
    paddingVertical: 11, paddingHorizontal: 13, marginTop: 12,
  },
  faces: { flexDirection: "row", alignItems: "center" },
  face: { position: "relative" },
  overlap: { marginLeft: -10 },
  ticket: {
    position: "absolute", right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7,
    backgroundColor: ACCENT, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: CARD,
  },
  text: { color: "#f4f4f6", fontSize: 13.5, fontWeight: "600", lineHeight: 18 },
  sub: { color: MUTED, fontSize: 12, marginTop: 2 },
});
