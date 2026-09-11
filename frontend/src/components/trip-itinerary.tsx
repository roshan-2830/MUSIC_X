/**
 * One trip, stop by stop.
 *
 * Every stop links into its own event page rather than out to a booking site: that page already
 * has real tickets, a real hotel search and a real flight search for that leg. The planner's
 * hours are an ESTIMATE and say so with a "~"; the event page is where the real numbers live.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import { TripStop } from "../lib/api";
import { flagEmoji } from "../lib/format";


export default function TripItinerary({ stops, origin, onOpenEvent }: {
  stops: TripStop[]; origin: string; onOpenEvent: (id: string) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!stops.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="map-outline" size={36} color={th.muted} />
        <Text style={styles.emptyT}>Nothing fits those dates</Text>
        <Text style={styles.emptyS}>
          Widen the range, or choose “Anywhere” to let the trip travel further.
        </Text>
      </View>
    );
  }

  let at = origin;
  return (
    <View>
      {stops.map((s, i) => {
        const from = at;
        if (!s.same_place) at = s.city;
        const when = s.starts_at
          ? new Date(s.starts_at).toLocaleDateString("en-GB", {
              weekday: "short", day: "numeric", month: "short",
              timeZone: s.timezone || "UTC",
            })
          : "";
        return (
          <View key={s.event_id} style={styles.row}>
            <View style={styles.node}>
              <View style={styles.dot}><Text style={styles.dotT}>{i + 1}</Text></View>
              {i < stops.length - 1 ? <View style={styles.stem} /> : null}
            </View>

            <Pressable style={styles.card} onPress={() => onOpenEvent(s.event_id)}>
              <View style={styles.head}>
                {s.image_url ? (
                  <Image source={{ uri: s.image_url }} style={styles.img} />
                ) : (
                  <View style={[styles.img, styles.imgFallback]}>
                    <Ionicons name="musical-notes" size={16} color={th.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.place}>
                    {flagEmoji(s.country)} {s.city}
                  </Text>
                  <Text style={styles.title} numberOfLines={2}>{s.title}</Text>
                  <Text style={styles.when}>
                    {when}{s.venue_name ? ` · ${s.venue_name}` : ""}
                  </Text>
                </View>
                {s.mxs != null ? (
                  <Text style={styles.mxs}>{s.mxs.toFixed(1)}</Text>
                ) : null}
              </View>

              <View style={styles.travel}>
                <Ionicons
                  name={s.same_place ? "walk-outline" : "airplane-outline"}
                  size={13} color={th.muted}
                />
                <Text style={styles.travelT}>
                  {s.same_place
                    ? `In ${s.city} — no travel`
                    : `~${s.travel_hours}h from ${from}`}
                </Text>
              </View>

              {/* One way in, not three ways out. Tickets, stay and getting there all live on
                  the event page, with real prices instead of this page's estimate. */}
              <View style={styles.cta}>
                <Ionicons name="ticket-outline" size={14} color={th.accent} />
                <Text style={styles.ctaT}>Tickets, stay & getting there</Text>
                <Ionicons name="chevron-forward" size={14} color={th.accent} />
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  node: { width: 26, alignItems: "center" },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: th.accentFill,
         alignItems: "center", justifyContent: "center" },
  dotT: { color: th.accentInk, fontSize: 12, fontWeight: "900" },
  stem: { flex: 1, width: 2, backgroundColor: th.panel3, marginVertical: 4 },

  card: { flex: 1, backgroundColor: th.panel, borderRadius: 14, padding: 12,
          marginBottom: 14, borderWidth: 1, borderColor: th.panel3 },
  head: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  img: { width: 52, height: 52, borderRadius: 10, backgroundColor: th.panel2 },
  imgFallback: { alignItems: "center", justifyContent: "center" },
  place: { color: th.muted, fontSize: 11, fontWeight: "700" },
  title: { color: th.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
  when: { color: th.muted, fontSize: 12, marginTop: 2 },
  mxs: { color: th.accent, fontSize: 14, fontWeight: "900" },

  travel: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  travelT: { color: th.muted, fontSize: 12 },

  cta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
         paddingTop: 10, borderTopWidth: 1, borderTopColor: th.panel3 },
  ctaT: { color: th.accent, fontSize: 12, fontWeight: "700", flex: 1 },

  empty: { alignItems: "center", padding: 30, gap: 8 },
  emptyT: { color: th.text, fontSize: 16, fontWeight: "800" },
  emptyS: { color: th.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
