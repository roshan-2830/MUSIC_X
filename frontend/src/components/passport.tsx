/**
 * The Concert Passport.
 *
 * A record of shows you actually went to, presented as a travel document — because that is what
 * it is: proof of where you have been, with a stamp for every country.
 *
 * NOTHING HERE CAN ADD A SHOW, and that absence is the feature. A passport you can type into
 * records nothing; entries arrive only from ticking Attended after a show you tracked, or later
 * from an uploaded ticket. So the empty state explains how to earn the first stamp rather than
 * offering a button to fake one.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getPassport, Passport } from "../lib/api";
import { flagEmoji } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statV}>{value}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

export default function PassportView({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Passport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    getPassport().then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const initial = (data?.display_name || "?").trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero. The one place in this app that is deliberately loud — a passport cover. */}
        <LinearGradient
          colors={["#7b2ff7", "#ff2d95", "#ff8a00"]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={styles.hero}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.heroBack}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View style={styles.crest}>
            <Ionicons name="musical-notes" size={26} color="#fff" />
          </View>
          <Text style={styles.heroT}>Concert Passport</Text>
          <Text style={styles.heroS}>Every stage. Every city. All yours.</Text>
        </LinearGradient>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={ACCENT} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
            <Text style={styles.emptyT}>Couldn’t load your passport</Text>
            <Text style={styles.emptyS}>{error}</Text>
          </View>
        ) : !data ? null : (
          <View style={{ padding: 16 }}>
            {/* The document itself */}
            <LinearGradient
              colors={["#1a3a5c", "#2d1b5c"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.doc}>
              <View style={styles.docBand}>
                <Text style={styles.docBrand}>MUSIC<Text style={{ color: ACCENT }}>X</Text></Text>
                <Text style={styles.docNo}>
                  {/* Not a random number: the first six of the id would leak nothing useful,
                      and a made-up serial is decoration pretending to be data. Year of first
                      show plus show count is true and stable. */}
                  NO. {data.member_since ?? "—"}-{String(data.shows).padStart(3, "0")}
                </Text>
              </View>
              <View style={styles.docBody}>
                <View style={styles.photo}>
                  <Text style={styles.photoInitial}>{initial}</Text>
                </View>
                <View style={{ flex: 1, gap: 10 }}>
                  <View>
                    <Text style={styles.fieldL}>Name</Text>
                    <Text style={styles.fieldV}>{data.display_name || "You"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 22 }}>
                    <View>
                      <Text style={styles.fieldL}>Member since</Text>
                      <Text style={styles.fieldV}>{data.member_since ?? "—"}</Text>
                    </View>
                    <View>
                      <Text style={styles.fieldL}>Home base</Text>
                      <Text style={styles.fieldV}>{data.home_city || "—"}</Text>
                    </View>
                  </View>
                </View>
              </View>
              {data.tier ? (
                <View style={styles.tierRow}>
                  <Ionicons name="ribbon" size={14} color={ACCENT} />
                  <Text style={styles.tierT}>{data.tier}</Text>
                  {data.next_tier ? (
                    <Text style={styles.tierS}>
                      {data.shows_to_next_tier} more to {data.next_tier}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </LinearGradient>

            {data.shows === 0 ? (
              /* The empty state explains how a stamp is EARNED. There is deliberately no
                 "add a show" button — see the note at the top of this file. */
              <View style={styles.empty}>
                <Ionicons name="airplane-outline" size={40} color={MUTED} />
                <Text style={styles.emptyT}>No stamps yet</Text>
                <Text style={styles.emptyS}>
                  After a show you saved, open it and tick “Attended”. It lands here, with a
                  stamp for the country. Nothing can be typed in — that’s what makes it worth
                  having.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.stats}>
                  <Stat value={data.shows} label="Shows attended" />
                  <Stat value={data.country_count} label="Countries" />
                  <Stat value={`${data.hours_in_the_crowd}h`} label="In the crowd" />
                </View>
                {/* Named as an estimate, because it is one — nobody publishes set lengths. */}
                <Text style={styles.estimate}>Time in the crowd is an estimate.</Text>

                {data.top_artist ? (
                  <View style={styles.card}>
                    <Text style={styles.cardL}>Most-seen artist</Text>
                    <Text style={styles.cardV}>{data.top_artist}</Text>
                    <Text style={styles.cardS}>
                      {data.top_artist_count} {data.top_artist_count === 1 ? "show" : "shows"}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.section}>Stamps collected</Text>
                <Text style={styles.sectionS}>
                  A stamp for every country you’ve seen live music in.
                </Text>
                <View style={styles.wall}>
                  {data.stamps.map((s) => (
                    <View key={s.country} style={styles.stamp}>
                      <Text style={styles.stampFlag}>{flagEmoji(s.country)}</Text>
                      <Text style={styles.stampCC}>{s.country}</Text>
                      <Text style={styles.stampN}>
                        {s.shows} {s.shows === 1 ? "show" : "shows"}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.section}>Your shows</Text>
                {data.recent.map((e) => {
                  const imported = e.source === "setlist_fm";
                  return (
                    <Pressable
                      key={e.id}
                      style={styles.showRow}
                      // Only imported rows link out, and they link to the setlist itself —
                      // which is both the attribution setlist.fm requires and the evidence
                      // behind a stamp nobody confirmed inside this app.
                      disabled={!imported || !e.evidence_url}
                      onPress={() => { if (imported && e.evidence_url) Linking.openURL(e.evidence_url); }}>
                      <Text style={styles.showFlag}>{flagEmoji(e.country)}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.showT} numberOfLines={1}>
                          {e.artist_name || "Unknown artist"}
                        </Text>
                        <Text style={styles.showS} numberOfLines={1}>
                          {[e.venue_name, e.city].filter(Boolean).join(" · ") || "—"}
                        </Text>
                        {imported ? (
                          <Text style={styles.via}>via setlist.fm ↗</Text>
                        ) : null}
                      </View>
                      <Text style={styles.showD}>
                        {e.seen_on
                          ? new Date(e.seen_on).toLocaleDateString("en-GB",
                              { day: "numeric", month: "short", year: "numeric" })
                          : ""}
                      </Text>
                    </Pressable>
                  );
                })}

                {/* REQUIRED by setlist.fm's terms wherever their data appears, and shown only
                    when some of it actually does. */}
                {data.recent.some((e) => e.source === "setlist_fm") ? (
                  <Pressable
                    style={styles.attr}
                    onPress={() => Linking.openURL("https://www.setlist.fm/")}>
                    <Text style={styles.attrT}>
                      Concert history powered by{" "}
                      <Text style={styles.attrLink}>setlist.fm</Text>
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  hero: { height: 210, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  heroBack: {
    position: "absolute", top: 14, left: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.32)", alignItems: "center", justifyContent: "center",
  },
  crest: {
    width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
  },
  heroT: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  heroS: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: "600", marginTop: 6 },

  doc: { borderRadius: 18, overflow: "hidden", marginBottom: 20, borderWidth: 1,
         borderColor: "rgba(255,255,255,0.08)" },
  docBand: {
    backgroundColor: "rgba(0,0,0,0.34)", paddingVertical: 11, paddingHorizontal: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.09)",
  },
  docBrand: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  docNo: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  docBody: { flexDirection: "row", gap: 16, padding: 18, alignItems: "center" },
  photo: {
    width: 78, height: 98, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.18)",
  },
  photoInitial: { color: "#fff", fontSize: 34, fontWeight: "900" },
  fieldL: { color: "rgba(255,255,255,0.55)", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  fieldV: { color: "#fff", fontSize: 15, fontWeight: "700", marginTop: 2 },
  tierRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.09)",
  },
  tierT: { color: ACCENT, fontSize: 13, fontWeight: "800" },
  tierS: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginLeft: "auto" },

  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: "#14141b", borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: "#23232c" },
  statV: { color: "#f4f4f6", fontSize: 24, fontWeight: "900" },
  statL: { color: MUTED, fontSize: 11, marginTop: 4 },
  estimate: { color: "#6c6c78", fontSize: 11, marginTop: 8 },

  card: { backgroundColor: "#14141b", borderRadius: 14, padding: 14, marginTop: 14,
          borderWidth: 1, borderColor: "#23232c" },
  cardL: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  cardV: { color: "#f4f4f6", fontSize: 18, fontWeight: "800", marginTop: 4 },
  cardS: { color: MUTED, fontSize: 12, marginTop: 2 },

  section: { color: "#f4f4f6", fontSize: 17, fontWeight: "800", marginTop: 24 },
  sectionS: { color: MUTED, fontSize: 12, marginTop: 4, marginBottom: 12 },
  wall: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stamp: {
    width: 92, alignItems: "center", paddingVertical: 14, borderRadius: 14,
    backgroundColor: "#14141b", borderWidth: 1, borderColor: "#2b2b36",
    borderStyle: "dashed",
  },
  stampFlag: { fontSize: 30, lineHeight: 34 },
  stampCC: { color: "#f4f4f6", fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginTop: 3 },
  stampN: { color: MUTED, fontSize: 10, marginTop: 2 },

  showRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1c1c24",
  },
  showFlag: { fontSize: 22 },
  showT: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  showS: { color: MUTED, fontSize: 12, marginTop: 2 },
  showD: { color: MUTED, fontSize: 12 },
  via: { color: "#7d7d8a", fontSize: 11, marginTop: 3 },
  attr: { alignItems: "center", marginTop: 18 },
  attrT: { color: MUTED, fontSize: 12 },
  attrLink: { color: ACCENT, fontWeight: "700", textDecorationLine: "underline" },

  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  empty: { alignItems: "center", padding: 30, gap: 10 },
  emptyT: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },
  emptyS: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
