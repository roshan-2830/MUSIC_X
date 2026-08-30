/**
 * The Concert Passport, laid out as the mockup draws it.
 *
 * A record of shows you actually went to, presented as a travel document — because that is what
 * it is: proof of where you have been, with a stamp for every country.
 *
 * NOTHING HERE CAN ADD A SHOW, and that absence is the feature. A passport you can type into
 * records nothing. Stamps arrive from a ticket you had, a show you confirmed, or an import that
 * says on its face where it came from.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PassportHero from "./passport-hero";
import { getPassport, Passport, PassportShow } from "../lib/api";
import { flagEmoji } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const SETLISTFM = "https://www.setlist.fm/";

function Stat({ icon, value, label, big }: {
  icon: keyof typeof Ionicons.glyphMap; value: string | number; label: string; big?: boolean;
}) {
  return (
    <View style={[styles.stat, big && styles.statBig]}>
      <Ionicons name={icon} size={15} color={big ? "#101204" : ACCENT} />
      <Text style={[styles.statV, big && styles.statVBig]}>{value}</Text>
      <Text style={[styles.statL, big && styles.statLBig]}>{label}</Text>
    </View>
  );
}

/** Shows grouped by the year they happened — the mockup's "Your journey". */
function byYear(shows: PassportShow[]) {
  const out = new Map<string, PassportShow[]>();
  for (const s of shows) {
    const y = s.seen_on ? s.seen_on.slice(0, 4) : "—";
    (out.get(y) ?? out.set(y, []).get(y)!).push(s);
  }
  return [...out.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function PassportView({ onClose, onImport }:
  { onClose: () => void; onImport?: () => void }) {
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
  const years = useMemo(() => byYear(data?.recent ?? []), [data]);
  const genreTotal = (data?.genres ?? []).reduce((n, g) => n + g.shows, 0) || 1;
  const anyImported = (data?.recent ?? []).some((e) => e.source === "setlist_fm");

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 44 }}>
        <PassportHero stamps={data?.stamps ?? []} onBack={onClose} />

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={ACCENT} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
            <Text style={styles.emptyT}>Couldn’t load your passport</Text>
            <Text style={styles.emptyS}>{error}</Text>
          </View>
        ) : !data ? null : (
          // Pulled up over the hero, as the mockup has it.
          <View style={{ paddingHorizontal: 16, marginTop: -28 }}>
            <LinearGradient
              colors={["#1a3a5c", "#2d1b5c"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.doc}>
              <View style={styles.docBand}>
                <Text style={styles.docBrand}>
                  MUSIC<Text style={{ color: ACCENT }}>X</Text> · CONCERT PASSPORT
                </Text>
                <Text style={styles.docNo}>MX·{String(data.shows).padStart(4, "0")}</Text>
              </View>
              <View style={styles.docBody}>
                <View style={styles.photo}>
                  <Text style={styles.photoInitial}>{initial}</Text>
                  <View style={styles.verified}>
                    <Ionicons name="checkmark" size={11} color="#101204" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={1}>
                    {data.display_name || "You"}
                  </Text>
                  {[["Member since", data.member_since ?? "—"],
                    ["Home base", data.home_city || "—"],
                    ["Live shows", data.shows]].map(([l, v]) => (
                    <View key={String(l)} style={styles.docRow}>
                      <Text style={styles.docRowL}>{l}</Text>
                      <Text style={styles.docRowV}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {/* The machine-readable strip along the bottom of a real passport. Every field is
                  a number this document already shows, so it decorates without inventing. */}
              <Text style={styles.mrz} numberOfLines={1}>
                {`<MX<${data.shows}<${data.country_count}<${data.city_count}<`}
                {(data.top_artist || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10).padEnd(10, "<")}
                {"<<<<"}
              </Text>
            </LinearGradient>

            {/* The whole ladder, not just the current rung — that is what makes a rank read as
                progress rather than a label. */}
            <View style={styles.ms}>
              <View style={styles.msHead}>
                <View style={styles.msTitleRow}>
                  <Ionicons name="ribbon" size={14} color={ACCENT} />
                  <Text style={styles.msTitle}>
                    {data.milestones.next_label
                      ? `${data.milestones.next_label} · ${data.milestones.next_at} shows`
                      : "Legend"}
                  </Text>
                </View>
                <Text style={styles.msSub}>
                  {data.milestones.next_at
                    ? `${data.milestones.next_at - data.shows} more to unlock`
                    : "You’ve done it all"}
                </Text>
              </View>
              <View style={styles.msTrack}>
                <View style={[styles.msFill,
                              { width: `${Math.round(data.milestones.progress * 100)}%` }]} />
              </View>
              <View style={styles.msLabels}>
                {data.milestones.rungs.map((r) => (
                  <Text key={r.at} style={[styles.msLabel, r.reached && styles.msLabelOn]}>
                    {r.at}
                  </Text>
                ))}
              </View>
            </View>

            <View style={styles.statGrid}>
              <Stat icon="star" value={data.shows} label="Shows attended" big />
              <Stat icon="earth" value={data.country_count} label="Countries" />
              <Stat icon="location" value={data.city_count} label="Cities" />
              <Stat icon="time" value={`${data.hours_in_the_crowd}h`} label="In the crowd" />
            </View>
            <Text style={styles.estimate}>Time in the crowd is an estimate.</Text>

            <View style={styles.tiles}>
              {data.top_artist ? (
                <View style={styles.tile}>
                  <Text style={styles.tileL}>Most-seen artist</Text>
                  <Text style={styles.tileV} numberOfLines={2}>{data.top_artist}</Text>
                  <Text style={styles.tileS}>
                    {data.top_artist_count} {data.top_artist_count === 1 ? "show" : "shows"}
                  </Text>
                </View>
              ) : null}
              {data.genres.length ? (
                <View style={styles.tile}>
                  <Text style={styles.tileL}>Your sound</Text>
                  <Text style={styles.tileV} numberOfLines={1}>{data.genres[0].name}</Text>
                  <View style={{ gap: 5, marginTop: 6 }}>
                    {data.genres.map((g) => (
                      <View key={g.name} style={styles.gbar}>
                        <Text style={styles.gbarL} numberOfLines={1}>{g.name}</Text>
                        <View style={styles.gbarTrack}>
                          <View style={[styles.gbarFill,
                                        { width: `${Math.round((g.shows / genreTotal) * 100)}%` }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            {data.stamps.length ? (
              <>
                <View style={styles.secHead}>
                  <Text style={styles.section}>Stamps collected</Text>
                  <Text style={styles.secCount}>
                    {data.country_count} {data.country_count === 1 ? "country" : "countries"}
                  </Text>
                </View>
                <Text style={styles.sectionS}>
                  One stamp for every country you’ve seen live music in.
                </Text>
                <View style={styles.wall}>
                  {data.stamps.map((s) => (
                    <View key={s.country} style={styles.stamp}>
                      <Text style={styles.stampFlag}>{flagEmoji(s.country)}</Text>
                      <Text style={styles.stampCC}>{s.country}</Text>
                      {s.shows > 1 ? <Text style={styles.stampX}>×{s.shows}</Text> : null}
                      {s.since_year ? (
                        <Text style={styles.stampYr}>Since {s.since_year}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* The mockup puts the import here, on the page it affects, rather than buried in a
                settings list. */}
            {onImport ? (
              <Pressable style={styles.import} onPress={onImport}>
                <View style={styles.importIcon}>
                  <Ionicons name="cloud-download-outline" size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.importT}>Been to shows before Music X?</Text>
                  <Text style={styles.importS}>
                    Bring your history in from setlist.fm — every show counts towards your
                    passport. We mark them as imported, never as verified.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              </Pressable>
            ) : null}

            {data.shows === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="airplane-outline" size={40} color={MUTED} />
                <Text style={styles.emptyT}>No stamps yet</Text>
                <Text style={styles.emptyS}>
                  Tell a show you saved that you had a ticket, and once it’s over it lands here
                  with a stamp for the country. Nothing can be typed in — that’s what makes it
                  worth having.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.secHead}>
                  <Text style={styles.section}>Your journey</Text>
                  <Text style={styles.secCount}>{data.shows} shows</Text>
                </View>
                {years.map(([year, shows]) => {
                  const cities = new Set(shows.map((s) => s.city).filter(Boolean)).size;
                  return (
                    <View key={year} style={{ marginTop: 14 }}>
                      <View style={styles.yearHead}>
                        <Text style={styles.yearNum}>{year}</Text>
                        <Text style={styles.yearMeta}>
                          {shows.length} {shows.length === 1 ? "show" : "shows"} ·{" "}
                          {cities} {cities === 1 ? "city" : "cities"}
                        </Text>
                      </View>
                      {shows.map((e) => {
                        const imported = e.source === "setlist_fm";
                        return (
                          <Pressable
                            key={e.id}
                            style={styles.tl}
                            disabled={!imported || !e.evidence_url}
                            onPress={() => e.evidence_url && Linking.openURL(e.evidence_url)}>
                            <View style={styles.tlNode}>
                              <View style={[styles.tlDot, imported && styles.tlDotImported]} />
                              <View style={styles.tlStem} />
                            </View>
                            <View style={styles.tlCard}>
                              <Text style={styles.tlDate}>
                                {e.seen_on
                                  ? new Date(e.seen_on).toLocaleDateString("en-GB",
                                      { day: "numeric", month: "short" }).toUpperCase()
                                  : ""}
                              </Text>
                              <Text style={styles.tlArtist} numberOfLines={1}>
                                {e.artist_name || "Unknown artist"}
                              </Text>
                              <Text style={styles.tlLoc} numberOfLines={1}>
                                {flagEmoji(e.country)} {[e.venue_name, e.city].filter(Boolean).join(" · ")}
                              </Text>
                              <Text style={[styles.tag, imported ? styles.tagImported : styles.tagOn]}>
                                {imported ? "via setlist.fm ↗" : "On Music X"}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </>
            )}

            {/* REQUIRED by setlist.fm's terms wherever their data appears, and shown only when
                some of it actually does. */}
            {anyImported ? (
              <Pressable style={styles.attr} onPress={() => Linking.openURL(SETLISTFM)}>
                <Text style={styles.attrT}>
                  Concert history powered by <Text style={styles.attrLink}>setlist.fm</Text>
                </Text>
              </Pressable>
            ) : null}

            <Text style={styles.promise}>
              <Ionicons name="shield-checkmark" size={11} color={MUTED} /> Every show here points
              to something real — a ticket, a confirmation, or an imported record. We don’t take
              anyone’s word for it, including yours.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  hero: { height: 210, alignItems: "center", justifyContent: "center", paddingHorizontal: 30,
          paddingBottom: 30 },
  heroBack: { position: "absolute", top: 14, left: 16, width: 36, height: 36, borderRadius: 18,
              backgroundColor: "rgba(0,0,0,0.32)", alignItems: "center", justifyContent: "center" },
  crest: { width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)",
           alignItems: "center", justifyContent: "center", marginBottom: 12,
           borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  heroT: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  heroS: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: "600", marginTop: 6 },

  doc: { borderRadius: 18, overflow: "hidden", borderWidth: 1,
         borderColor: "rgba(255,255,255,0.08)" },
  docBand: { backgroundColor: "rgba(0,0,0,0.34)", paddingVertical: 10, paddingHorizontal: 14,
             flexDirection: "row", justifyContent: "space-between", alignItems: "center",
             borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.09)" },
  docBrand: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  docNo: { color: "rgba(255,255,255,0.9)", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  docBody: { flexDirection: "row", gap: 14, padding: 16, alignItems: "center" },
  photo: { width: 74, height: 94, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.14)",
           alignItems: "center", justifyContent: "center",
           borderWidth: 2, borderColor: "rgba(255,255,255,0.18)" },
  photoInitial: { color: "#fff", fontSize: 32, fontWeight: "900" },
  verified: { position: "absolute", bottom: -6, right: -6, width: 22, height: 22,
              borderRadius: 11, backgroundColor: ACCENT, alignItems: "center",
              justifyContent: "center", borderWidth: 2, borderColor: "#20204a" },
  docName: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  docRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
            paddingVertical: 3 },
  docRowL: { color: "rgba(255,255,255,0.55)", fontSize: 11 },
  docRowV: { color: "#fff", fontSize: 13, fontWeight: "700" },
  mrz: { color: "rgba(255,255,255,0.42)", fontSize: 11, letterSpacing: 1.4,
         paddingHorizontal: 14, paddingBottom: 12,
         fontFamily: "Courier", fontVariant: ["tabular-nums"] },

  ms: { backgroundColor: "#14141b", borderRadius: 14, padding: 14, marginTop: 14,
        borderWidth: 1, borderColor: "#23232c" },
  msHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  msTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  msTitle: { color: "#f4f4f6", fontSize: 13, fontWeight: "800" },
  msSub: { color: MUTED, fontSize: 11 },
  msTrack: { height: 6, borderRadius: 3, backgroundColor: "#23232c", marginTop: 12,
             overflow: "hidden" },
  msFill: { height: 6, borderRadius: 3, backgroundColor: ACCENT },
  msLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  msLabel: { color: "#4a4a55", fontSize: 10, fontWeight: "700" },
  msLabelOn: { color: ACCENT },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  stat: { flexBasis: "31%", flexGrow: 1, backgroundColor: "#14141b", borderRadius: 14,
          padding: 12, borderWidth: 1, borderColor: "#23232c", gap: 4 },
  statBig: { flexBasis: "100%", backgroundColor: ACCENT, borderColor: ACCENT },
  statV: { color: "#f4f4f6", fontSize: 22, fontWeight: "900" },
  statVBig: { color: "#101204", fontSize: 30 },
  statL: { color: MUTED, fontSize: 11 },
  statLBig: { color: "rgba(16,18,4,0.72)", fontWeight: "700" },
  estimate: { color: "#5a5a66", fontSize: 11, marginTop: 8 },

  tiles: { flexDirection: "row", gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: "#14141b", borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: "#23232c" },
  tileL: { color: MUTED, fontSize: 10, fontWeight: "800", letterSpacing: 0.8,
           textTransform: "uppercase" },
  tileV: { color: "#f4f4f6", fontSize: 16, fontWeight: "800", marginTop: 4 },
  tileS: { color: MUTED, fontSize: 11, marginTop: 2 },
  gbar: { flexDirection: "row", alignItems: "center", gap: 6 },
  gbarL: { color: MUTED, fontSize: 10, width: 74 },
  gbarTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#23232c" },
  gbarFill: { height: 4, borderRadius: 2, backgroundColor: ACCENT },

  secHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
             marginTop: 26 },
  section: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },
  secCount: { color: MUTED, fontSize: 12 },
  sectionS: { color: MUTED, fontSize: 12, marginTop: 4, marginBottom: 12 },
  wall: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stamp: { width: 92, alignItems: "center", paddingVertical: 12, borderRadius: 14,
           backgroundColor: "#14141b", borderWidth: 1, borderColor: "#2b2b36",
           borderStyle: "dashed" },
  stampFlag: { fontSize: 28, lineHeight: 32 },
  stampCC: { color: "#f4f4f6", fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginTop: 2 },
  stampX: { color: ACCENT, fontSize: 10, fontWeight: "800", marginTop: 1 },
  stampYr: { color: MUTED, fontSize: 9, marginTop: 2 },

  import: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20, padding: 14,
            borderRadius: 14, backgroundColor: "#14141b", borderWidth: 1, borderColor: "#2b2b36" },
  importIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#1b1b24",
                alignItems: "center", justifyContent: "center" },
  importT: { color: "#f4f4f6", fontSize: 14, fontWeight: "800" },
  importS: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 3 },

  yearHead: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 8 },
  yearNum: { color: ACCENT, fontSize: 20, fontWeight: "900" },
  yearMeta: { color: MUTED, fontSize: 12 },
  tl: { flexDirection: "row", gap: 12 },
  tlNode: { alignItems: "center", width: 12 },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT, marginTop: 6 },
  tlDotImported: { backgroundColor: "#5a5a66" },
  tlStem: { flex: 1, width: 2, backgroundColor: "#23232c", marginTop: 2 },
  tlCard: { flex: 1, paddingBottom: 16 },
  tlDate: { color: MUTED, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  tlArtist: { color: "#f4f4f6", fontSize: 15, fontWeight: "700", marginTop: 2 },
  tlLoc: { color: MUTED, fontSize: 12, marginTop: 2 },
  tag: { fontSize: 10, fontWeight: "700", marginTop: 6, alignSelf: "flex-start",
         paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  tagOn: { color: "#101204", backgroundColor: ACCENT },
  tagImported: { color: "#c9c9d2", backgroundColor: "#23232c" },

  attr: { alignItems: "center", marginTop: 18 },
  attrT: { color: MUTED, fontSize: 12 },
  attrLink: { color: ACCENT, fontWeight: "700", textDecorationLine: "underline" },
  promise: { color: MUTED, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 20 },

  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  empty: { alignItems: "center", padding: 30, gap: 10 },
  emptyT: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },
  emptyS: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
