import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";

import { FestivalArtist, FestivalDetail as FestivalDetailT, getFestival, MxsComponent } from "../lib/api";
import { coverColor, flagEmoji } from "../lib/format";
import { useSaves } from "../lib/saves";
import ArtistDetail from "./artist-detail";

const ACCENT = "#e8ff47";
const COMPONENT_LABEL: Record<string, string> = {
  artist: "Line-up strength",
  context: "Size of the festival",
  rarity: "Rare occasion",
  venue: "Venue",
  production: "Production",
  reviews: "Reviews",
};

const MUTED = "#8a8a95";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** "23–25 Aug 2026", or a single date when we hold no end. Never invents a range: 169 of
 *  418 festivals have no `ends_on`, and printing "23 Aug – 23 Aug" would assert a one-day
 *  festival we have no basis for. */
function dateRange(start: string | null, end: string | null): string {
  if (!start) return "Dates to be announced";
  const s = new Date(`${start}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (!end || end === start) return `${s.toLocaleDateString("en-GB", opts)} ${s.getFullYear()}`;
  const e = new Date(`${end}T12:00:00`);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const left = sameMonth ? String(s.getDate()) : s.toLocaleDateString("en-GB", opts);
  return `${left}–${e.toLocaleDateString("en-GB", opts)} ${e.getFullYear()}`;
}

function countdown(start: string | null): string | null {
  if (!start) return null;
  const days = Math.ceil((new Date(`${start}T12:00:00`).getTime() - Date.now()) / 864e5);
  if (days < 0) return null;
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
}

/** The bill split into days, in date order, with the day-unknown acts last. */
function dayGroups(f: FestivalDetailT): { day: string | null; acts: FestivalArtist[] }[] {
  const byDay = new Map<string, FestivalArtist[]>();
  const unknown: FestivalArtist[] = [];
  for (const a of f.lineup) {
    if (a.day) {
      const list = byDay.get(a.day) ?? [];
      list.push(a);
      byDay.set(a.day, list);
    } else {
      unknown.push(a);
    }
  }
  const out: { day: string | null; acts: FestivalArtist[] }[] =
    [...byDay.keys()].sort().map((day) => ({ day, acts: byDay.get(day)! }));
  if (unknown.length) out.push({ day: null, acts: unknown });
  return out;
}

/** "Friday 28 August" — the weekday computed from the date, not read out of a title. */
function dayHeading(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function Avatar({ name, size = 44, imageUrl }: { name: string; size?: number; imageUrl?: string | null }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.avatar, box]} contentFit="cover" transition={120} />;
  }
  return (
    <View style={[styles.avatar, box, { backgroundColor: coverColor(name) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

export default function FestivalDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const [showWhy, setShowWhy] = useState(false);
  const [f, setF] = useState<FestivalDetailT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [artistName, setArtistName] = useState<string | null>(null);
  const { isFestivalSaved, toggleFestival } = useSaves();

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    getFestival(id)
      .then((d) => { if (alive) setF(d); })
      .catch((e) => { if (alive) setError(String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator color={ACCENT} size="large" /></View>
    );
  }
  if (error || !f) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
        <Text style={styles.errText}>Couldn’t load this festival.</Text>
        <Pressable style={styles.btn} onPress={onClose}><Text style={styles.btnText}>Back</Text></Pressable>
      </View>
    );
  }

  const saved = isFestivalSaved(f.id);
  const cd = countdown(f.starts_on);
  const head = f.lineup.slice(0, 3);
  const billed = f.artists_count ?? f.lineup.length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* hero */}
        <View style={styles.hero}>
          {f.image_url ? (
            <Image source={{ uri: f.image_url }} style={styles.fill} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.fill, { backgroundColor: coverColor(f.id) }]} />
          )}
          <LinearGradient
            colors={["transparent", "rgba(11,11,15,0.35)", "rgba(11,11,15,0.92)"]}
            style={styles.heroScrim}
            pointerEvents="none"
          />
          <Pressable style={[styles.heroBtn, { left: 12 }]} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          {f.days ? (
            <View style={styles.dayBadge}>
              <Ionicons name="calendar-outline" size={12} color="#0b0b0f" />
              <Text style={styles.dayBadgeText}>{f.days}-day festival</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {cd ? <View style={styles.cdPill}><Text style={styles.cdText}>{cd}</Text></View> : null}
          <Text style={styles.title}>{f.name}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={15} color={MUTED} />
            <Text style={styles.meta}>{dateRange(f.starts_on, f.ends_on)}</Text>
          </View>
          {f.city ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color={MUTED} />
              <Text style={styles.meta}>
                {flagEmoji(f.country)} {f.city}
              </Text>
            </View>
          ) : null}

          {/* rating + save. A scored festival's cell opens the breakdown; an unscored one
              says so plainly rather than borrowing a number from somewhere. */}
          <View style={styles.segRow}>
            <Pressable style={styles.segCell} onPress={() => setShowWhy((v) => !v)}>
              <View style={styles.segTopRow}>
                <Text style={styles.segTop}>{f.mxs != null ? f.mxs.toFixed(1) : "–"}</Text>
                {f.mxs != null ? (
                  <Ionicons name={showWhy ? "chevron-up" : "chevron-forward"} size={14} color={MUTED} />
                ) : null}
              </View>
              <Text style={styles.segLbl}>{f.mxs != null ? "Rating" : "No rating yet"}</Text>
            </Pressable>
            <Pressable style={[styles.segCell, styles.segBorder]} onPress={() => toggleFestival(f)}>
              <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={19} color={saved ? ACCENT : "#f4f4f6"} />
              <Text style={[styles.segLbl, saved && { color: ACCENT }]}>{saved ? "Saved" : "Save"}</Text>
            </Pressable>
            <View style={[styles.segCell, styles.segBorder]}>
              <Text style={styles.segTop}>{billed || "–"}</Text>
              <Text style={styles.segLbl}>{billed === 1 ? "Artist" : "Artists"}</Text>
            </View>
          </View>

          {/* Why this score. Every component that contributed, with what it actually read,
              and — named, not hidden — the parts of the formula this festival could not
              answer. A bare 9.4 explains nothing, and the score is meant to be arguable. */}
          {showWhy && f.mxs != null ? (
            <View style={styles.whyBox}>
              {Object.entries((f.mxs_breakdown?.components ?? {}) as Record<string, MxsComponent>).map(
                ([key, c]) => (
                  <View key={key} style={{ marginBottom: 12 }}>
                    <View style={styles.barRow}>
                      <Text style={styles.barLabel}>{COMPONENT_LABEL[key] ?? key}</Text>
                      <Text style={styles.barVal}>{c.score?.toFixed(1)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, (c.score ?? 0) * 10))}%` }]} />
                    </View>
                    <Text style={styles.whyReason}>
                      {c.reason}
                      {c.weight != null ? ` · ${Math.round(c.weight * 100)}% of the score` : ""}
                    </Text>
                  </View>
                ),
              )}
              {Object.keys(f.mxs_breakdown?.missing ?? {}).length ? (
                <Text style={styles.whyMissing}>
                  Not counted: {Object.entries(f.mxs_breakdown!.missing!)
                    .map(([k, why]) => `${COMPONENT_LABEL[k] ?? k} — ${why}`)
                    .join("; ")}
                </Text>
              ) : null}
              <Text style={styles.whyText}>
                Ranked against {f.mxs_breakdown?.cohort ?? "other festivals"}. This scores the{" "}
                <Text style={{ fontWeight: "800" }}>festival</Text>, never you — and it can never be bought.
              </Text>
            </View>
          ) : null}

          {/* line-up */}
          {f.lineup.length ? (
            <>
              <View style={styles.secHead}>
                <Text style={styles.section}>Line-up</Text>
                {f.lineup.length > 3 ? (
                  <Pressable onPress={() => setLineupOpen(true)} hitSlop={8}>
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={styles.lineupCard}
                onPress={() => (f.lineup.length > 1 ? setLineupOpen(true) : setArtistName(f.lineup[0].name))}
              >
                <View style={styles.avStack}>
                  {head.map((a, i) => (
                    <View key={`${a.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -14, zIndex: 3 - i }}>
                      <Avatar name={a.name} imageUrl={a.image_url} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineupTitle} numberOfLines={1}>
                    {f.lineup.length > 1 ? `${f.lineup[0].name} + ${f.lineup.length - 1}` : f.lineup[0].name}
                  </Text>
                  <Text style={styles.lineupSub}>
                    {f.lineup.length <= 1
                      ? "Tap for their page"
                      : f.lineup_days.length > 1
                        ? `${f.lineup.length} artists across ${f.lineup_days.length} days · tap for the bill`
                        : `${f.lineup.length} artists · tap for the full bill`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              </Pressable>
              {/* The seller has not published day splits for a single festival in this
                  catalogue — day_label is null on all 2,380 line-up rows — so the bill is
                  shown flat and we say why, rather than inventing days. */}
              {!f.lineup_complete ? (
                <View style={styles.noteRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={MUTED} />
                  <Text style={styles.note}>
                    Line-up still growing — we add acts as they’re confirmed, never guessed.
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.section}>Line-up</Text>
              <Text style={styles.empty}>No line-up published for this festival yet.</Text>
            </>
          )}

          {/* about */}
          {f.about ? (
            <>
              <Text style={[styles.section, { marginTop: 22 }]}>About</Text>
              <Text style={styles.about} numberOfLines={5}>{f.about}</Text>
              <Pressable style={styles.readMore} onPress={() => setAboutOpen(true)}>
                <Text style={styles.readMoreText}>Read more</Text>
                <Ionicons name="chevron-forward" size={14} color={ACCENT} />
              </Pressable>
            </>
          ) : null}

          <View style={styles.footRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={MUTED} />
            <Text style={styles.foot}>
              Line-up and dates come from the seller’s published listing. We show what they
              state and nothing we cannot point at.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* full bill */}
      <Modal visible={lineupOpen} transparent animationType="slide" onRequestClose={() => setLineupOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setLineupOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Line-up</Text>
            <Text style={styles.sheetSub}>
              {f.name} · {f.lineup.length} artist{f.lineup.length > 1 ? "s" : ""} · tap an artist for their page
            </Text>
            <ScrollView style={{ maxHeight: 460 }}>
              {/* Grouped by day where the seller sold days separately. The "day not
                  announced" group is last and named honestly — those acts are on the bill,
                  we just have no basis for putting them on a particular day. */}
              {dayGroups(f).map((g) => (
                <View key={g.day ?? "unknown"}>
                  <Text style={styles.dayHead}>
                    {g.day ? dayHeading(g.day) : "Day not announced"}
                    <Text style={styles.dayCount}>  ·  {g.acts.length}</Text>
                  </Text>
                  {g.acts.map((a: FestivalArtist, i: number) => (
                    <Pressable
                      key={`${a.name}-${i}`}
                      style={styles.artistRow}
                      onPress={() => { setLineupOpen(false); setArtistName(a.name); }}
                    >
                      <Avatar name={a.name} size={40} imageUrl={a.image_url} />
                      <Text style={styles.artistName} numberOfLines={1}>{a.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={MUTED} />
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* full about */}
      <Modal visible={aboutOpen} transparent animationType="slide" onRequestClose={() => setAboutOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setAboutOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>About</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.sheetAbout}>{f.about}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* an artist from the bill — same nesting the event page uses, so closing returns
          you to the festival rather than dumping you home */}
      <Modal visible={!!artistName} animationType="slide" onRequestClose={() => setArtistName(null)}>
        {artistName ? <ArtistDetail name={artistName} onClose={() => setArtistName(null)} /> : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  center: { flex: 1, backgroundColor: "#0b0b0f", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  errText: { color: "#f4f4f6", fontSize: 15, textAlign: "center" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

  hero: { width: "100%", height: 260 },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 130 },
  heroBtn: { position: "absolute", top: 44, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  dayBadge: { position: "absolute", bottom: 14, left: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: ACCENT, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dayBadgeText: { color: "#0b0b0f", fontWeight: "800", fontSize: 12 },

  body: { paddingHorizontal: 16, paddingTop: 12 },
  cdPill: { alignSelf: "flex-start", backgroundColor: "rgba(232,255,71,0.12)", borderColor: "rgba(232,255,71,0.35)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  cdText: { color: ACCENT, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#f4f4f6", fontSize: 24, fontWeight: "900", letterSpacing: -0.4, marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 },
  meta: { color: MUTED, fontSize: 14, fontWeight: "600" },

  segTopRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  whyBox: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  barRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { color: "#c8c8d0", fontSize: 13, fontWeight: "600" },
  barVal: { color: ACCENT, fontSize: 13, fontWeight: "800" },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: "#26262f", overflow: "hidden" },
  barFill: { height: 7, borderRadius: 4, backgroundColor: ACCENT },
  whyReason: { color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 17 },
  whyMissing: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 2, fontStyle: "italic" },
  whyText: { color: "#c8c8d0", fontSize: 13, lineHeight: 19, marginTop: 10 },
  segRow: { flexDirection: "row", borderColor: "#1e1e26", borderWidth: 1, borderRadius: 16, marginTop: 18, overflow: "hidden" },
  segCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 3 },
  segBorder: { borderLeftWidth: 1, borderLeftColor: "#1e1e26" },
  segTop: { color: "#f4f4f6", fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  segLbl: { color: MUTED, fontSize: 11, fontWeight: "700" },

  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24 },
  section: { color: "#f4f4f6", fontSize: 17, fontWeight: "800", marginTop: 24, marginBottom: 8 },
  seeAll: { color: ACCENT, fontSize: 13, fontWeight: "800" },
  lineupCard: { flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "#131319", borderColor: "#1e1e26", borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 2 },
  avStack: { flexDirection: "row", alignItems: "center" },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#131319" },
  avatarText: { color: "#0b0b0f", fontWeight: "900" },
  lineupTitle: { color: "#f4f4f6", fontSize: 16, fontWeight: "800" },
  lineupSub: { color: MUTED, fontSize: 13, marginTop: 2 },
  noteRow: { flexDirection: "row", gap: 7, alignItems: "flex-start", marginTop: 10 },
  note: { color: MUTED, fontSize: 12, flex: 1, lineHeight: 17 },
  empty: { color: MUTED, fontSize: 14 },

  about: { color: "#c8c8d0", fontSize: 14, lineHeight: 21 },
  readMore: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10 },
  readMoreText: { color: ACCENT, fontSize: 14, fontWeight: "800" },

  footRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#1a1a22" },
  foot: { color: MUTED, fontSize: 12, flex: 1, lineHeight: 17 },

  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: "#131319", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#2a2a34", marginBottom: 14 },
  sheetTitle: { color: "#f4f4f6", fontSize: 20, fontWeight: "900" },
  sheetSub: { color: MUTED, fontSize: 13, marginTop: 2, marginBottom: 10 },
  sheetAbout: { color: "#e2e2e8", fontSize: 15, lineHeight: 23 },
  artistRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  artistName: { color: "#f4f4f6", fontSize: 15, fontWeight: "700", flex: 1 },
  dayHead: { color: ACCENT, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 16, marginBottom: 2 },
  dayCount: { color: MUTED, fontWeight: "700", letterSpacing: 0 },

  btn: { backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  btnText: { color: "#0b0b0f", fontWeight: "800" },
});
