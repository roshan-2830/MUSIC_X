import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchEvent, EventDetail } from "../lib/api";

export default function EventDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null); setEv(null);
    fetchEvent(id).then(setEv).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, [id]);

  return (
    <View style={styles.container}>
      <Pressable onPress={onClose} style={styles.backBtn}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      {loading && <View style={styles.center}><ActivityIndicator color="#e8ff47" size="large" /></View>}
      {error && <Text style={styles.error}>{error}</Text>}

      {ev && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {ev.status !== "scheduled" && <Text style={styles.statusBanner}>{ev.status.toUpperCase()}</Text>}
          <Text style={styles.title}>{ev.title}</Text>
          <Text style={styles.meta}>{ev.starts_at ? new Date(ev.starts_at).toDateString() : "Date TBA"}</Text>
          <Text style={styles.meta}>
            {ev.venue_name ?? "Venue TBA"}{ev.city ? `, ${ev.city}` : ""}{ev.country ? ` (${ev.country})` : ""}
          </Text>

          <View style={styles.ratingBox}>
            <Text style={styles.rating}>{ev.mxs != null ? `★ ${ev.mxs.toFixed(1)} MXS` : "No rating yet"}</Text>
            <Text style={styles.sub}>
              {ev.mxs != null
                ? `${ev.confidence ?? "unknown"} confidence`
                : "Not enough trusted info to rate this yet — we show no rating rather than a guess."}
            </Text>
          </View>

          {ev.lineup.length > 0 && (
            <View>
              <Text style={styles.section}>Line-up</Text>
              {ev.lineup.map((a, i) => (
                <Text key={i} style={styles.lineupItem}>{a.is_headliner ? "★ " : "•  "}{a.name}</Text>
              ))}
            </View>
          )}

          {ev.genres.length > 0 && (
            <View>
              <Text style={styles.section}>Genres</Text>
              <Text style={styles.meta}>{ev.genres.join("  ·  ")}</Text>
            </View>
          )}

          <Text style={styles.section}>Get tickets</Text>
          <Text style={styles.disclosure}>Official seller first — we never sell tickets or add a markup.</Text>
          {ev.offers.length ? (
            ev.offers.map((o, i) => (
              <Pressable key={i} style={styles.offer} onPress={() => o.url && Linking.openURL(o.url)}>
                <Text style={styles.offerName}>{o.is_official ? "Official · " : ""}{o.seller_name}</Text>
                <Text style={styles.offerGo}>Open ›</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.meta}>No sellers listed yet.</Text>
          )}

          {ev.price_from_amount != null && (
            <Text style={styles.price}>From {ev.price_from_currency ?? ""} {ev.price_from_amount}</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  backBtn: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 8 },
  back: { color: "#e8ff47", fontSize: 16, fontWeight: "700" },
  statusBanner: { color: "#ff6b6b", fontWeight: "800", marginBottom: 8 },
  title: { color: "#f4f4f6", fontSize: 24, fontWeight: "800", marginBottom: 8 },
  meta: { color: "#9a9aa6", fontSize: 14, marginBottom: 4 },
  ratingBox: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 14, padding: 14, marginVertical: 16 },
  rating: { color: "#e8ff47", fontSize: 18, fontWeight: "800", marginBottom: 4 },
  sub: { color: "#9a9aa6", fontSize: 13 },
  section: { color: "#f4f4f6", fontSize: 17, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  lineupItem: { color: "#d4d4da", fontSize: 15, marginBottom: 6 },
  disclosure: { color: "#7ef0b2", fontSize: 12, marginBottom: 10 },
  offer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  offerName: { color: "#f4f4f6", fontSize: 14, fontWeight: "600" },
  offerGo: { color: "#e8ff47", fontSize: 14, fontWeight: "700" },
  price: { color: "#9a9aa6", fontSize: 14, marginTop: 12 },
  error: { color: "#ff6b6b", fontSize: 14, padding: 20 },
});
