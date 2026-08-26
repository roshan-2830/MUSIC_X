import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ArtistAbout from "./artist-about";
import FestivalCard from "./festival-card";

import {
  ArtistDetail as ArtistDetailT,
  followArtist,
  getArtist,
  getFollows,
  MusicEvent,
  unfollowArtist,
} from "../lib/api";
import { coverColor, flagEmoji, formatDay, audienceLine } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

// How many tour dates to show before asking the reader if they want the rest.
const SHOWS_PREVIEW = 4;

function ShowRow({ e, onPress }: { e: MusicEvent; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.thumb}>
        {e.image_url ? (
          <Image source={{ uri: e.image_url }} style={styles.fill} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.fill, { backgroundColor: coverColor(e.id) }]} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {formatDay(e.starts_at, e.timezone)} · {flagEmoji(e.country ?? "")} {e.city ?? ""}
        </Text>
      </View>
      {e.mxs != null ? <Text style={styles.rowMxs}>{e.mxs.toFixed(1)}</Text> : null}
    </Pressable>
  );
}

export default function ArtistDetail({
  name,
  onClose,
  onSelectEvent,
  onSelectFestival,
}: {
  name: string;
  onClose: () => void;
  onSelectEvent?: (id: string) => void;
  // Handed in rather than imported, the same reason onSelectEvent is: a detail screen that
  // imports another detail screen makes a require cycle. festival-detail renders THIS
  // component for its line-up, so importing festival-detail here closed the loop —
  // "Require cycles are allowed, but can result in uninitialized values."
  onSelectFestival?: (id: string) => void;
}) {
  const [data, setData] = useState<ArtistDetailT | null>(null);
  const [loading, setLoading] = useState(true);
  const [followId, setFollowId] = useState<string | null>(null); // artist id if following, else null
  const [aboutOpen, setAboutOpen] = useState(false);
  const [peekArtist, setPeekArtist] = useState<string | null>(null);
  const [showAllDates, setShowAllDates] = useState(false);

  useEffect(() => {
    setLoading(true);
    getArtist(name)
      .then((d) => {
        setData(d);
        getFollows()
          .then((list) => {
            const m = list.find((a) => a.name.toLowerCase() === d.name.toLowerCase());
            setFollowId(m ? m.id : null);
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name]);

  const isFollowing = followId !== null;

  async function toggleFollow() {
    if (!data || followId === "pending") return;
    if (followId) {
      const id = followId;
      setFollowId(null);
      unfollowArtist(id).catch(() => {});
    } else {
      setFollowId("pending");
      try {
        const saved = await followArtist({ name: data.name, image_url: data.image_url });
        setFollowId(saved.id);
      } catch {
        setFollowId(null);
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Pressable style={styles.backPlain} onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#f4f4f6" />
        </Pressable>
        <Text style={styles.errText}>Couldn’t load this artist.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {/* Hero */}
        <View style={styles.hero}>
          {data.image_url ? (
            <Image source={{ uri: data.image_url }} style={styles.heroImg} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.heroImg, { backgroundColor: coverColor(data.id) }]} />
          )}
          <View style={styles.heroScrim} />
          <Pressable style={styles.back} onPress={onClose} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          <View style={styles.heroText}>
            <Text style={styles.name}>{data.name}</Text>
            {data.genres.length ? (
              <View style={styles.tags}>
                {data.genres.slice(0, 3).map((g) => (
                  <View key={g} style={styles.tag}><Text style={styles.tagText}>{g}</Text></View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* Real stats */}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statN}>{data.show_count}</Text>
            <Text style={styles.statL}>Upcoming shows</Text>
          </View>
          <View style={[styles.stat, styles.statBorder]}>
            <Text style={styles.statN}>{data.city_count}</Text>
            <Text style={styles.statL}>Cities</Text>
          </View>
          <View style={[styles.stat, styles.statBorder]}>
            <Text style={styles.statN}>{data.genres.length}</Text>
            <Text style={styles.statL}>Genres</Text>
          </View>
        </View>

        {/* Audience — each number labelled with the service it came from, because Deezer
            counts followers and Last.fm counts distinct listeners. Hidden entirely when we
            could not confidently identify this artist on either, rather than showing a 0. */}
        {audienceLine(data) ? (
          <View style={styles.audience}>
            <Ionicons name="people-outline" size={13} color={MUTED} />
            <Text style={styles.audienceText}>{audienceLine(data)}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={[styles.followBtn, isFollowing && styles.followingBtn]} onPress={toggleFollow}>
            {isFollowing ? (
              <>
                <View style={styles.fdot} />
                <Text style={styles.followingText}>Following</Text>
              </>
            ) : (
              <>
                <Ionicons name="add" size={18} color="#0b0b0f" />
                <Text style={styles.followText}>Follow</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => Alert.alert("Share", "Coming soon")}>
            <Ionicons name="share-outline" size={20} color="#f4f4f6" />
          </Pressable>
        </View>

        {/* Upcoming concerts */}
        <View style={styles.section}>
          <Text style={styles.secTitle}>
            Upcoming concerts{data.show_count ? ` · ${data.show_count}` : ""}
          </Text>
          {data.upcoming_shows.length ? (
            <>
              {(showAllDates ? data.upcoming_shows : data.upcoming_shows.slice(0, SHOWS_PREVIEW)).map((e) => (
                <ShowRow key={e.id} e={e} onPress={() => onSelectEvent?.(e.id)} />
              ))}
              {/* A full tour is 50+ dates — Weezer has 53 — which buries everything
                  below it. Show a handful, and let the reader ask for the rest. */}
              {data.upcoming_shows.length > SHOWS_PREVIEW ? (
                <Pressable style={styles.moreBtn} onPress={() => setShowAllDates((v) => !v)}>
                  <Text style={styles.moreBtnText}>
                    {showAllDates
                      ? "Show fewer"
                      : `View all ${data.upcoming_shows.length} shows`}
                  </Text>
                  <Ionicons
                    name={showAllDates ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={ACCENT}
                  />
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={34} color={MUTED} />
              <Text style={styles.emptyT}>No shows announced yet</Text>
              <Text style={styles.emptyS}>
                {isFollowing
                  ? "You’re following — new dates will show up here when they’re announced."
                  : `Follow ${data.name.split(" ")[0]} and their shows will appear here.`}
              </Text>
            </View>
          )}
        </View>

        {/* Festivals they're billed on. Kept separate from their own shows above: a
            festival slot is a real date, but it isn't their own ticketed headline show. */}
        {data.festivals?.length ? (
          <View style={styles.section}>
            <Text style={styles.secTitle}>
              Festival{data.festivals.length === 1 ? "" : "s"} they&rsquo;re playing
            </Text>
            <Text style={styles.secSub}>
              From the line-up each festival published
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fescroll}>
              {data.festivals.map((f) => (
                <FestivalCard key={f.id} festival={f} onPress={() => onSelectFestival?.(f.id)} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* About — a snippet; the full thing is its own page behind "Read more" */}
        <View style={styles.section}>
          <Text style={styles.secTitle}>About</Text>
          <Pressable style={styles.aboutCard} onPress={() => setAboutOpen(true)}>
            {data.bio ? (
              <>
                {data.bio_source ? (
                  <View style={styles.srcPill}>
                    <View style={styles.srcDot} />
                    <Text style={styles.srcPillText}>From {data.bio_source}</Text>
                  </View>
                ) : null}
                <Text style={styles.aboutSnippet} numberOfLines={3}>
                  {data.bio.replace(/\n+/g, " ")}
                </Text>
              </>
            ) : (
              <Text style={styles.aboutSnippet} numberOfLines={3}>
                We haven’t found a biography we can cite for {data.name} yet.
              </Text>
            )}
            <View style={styles.readMore}>
              <Text style={styles.readMoreText}>Read more</Text>
              <Ionicons name="chevron-forward" size={14} color={ACCENT} />
            </View>
          </Pressable>
        </View>

        {/* Similar artists — only ever from a link we can name. No link, no section. */}
        {data.similar?.length ? (
          <View style={styles.section}>
            <Text style={styles.secTitle}>Similar artists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.simScroll}>
              {data.similar.map((sa) => (
                <Pressable key={sa.id ?? sa.name} style={styles.simCard} onPress={() => setPeekArtist(sa.name)}>
                  {sa.image_url ? (
                    <Image source={{ uri: sa.image_url }} style={styles.simImg} contentFit="cover" transition={150} />
                  ) : (
                    <View style={[styles.simImg, { backgroundColor: coverColor(sa.id ?? sa.name) }]} />
                  )}
                  <Text style={styles.simName} numberOfLines={2}>{sa.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

      </ScrollView>

      <Modal visible={aboutOpen} animationType="slide" onRequestClose={() => setAboutOpen(false)}>
        <ArtistAbout data={data} onClose={() => setAboutOpen(false)} />
      </Modal>

      {/* tapping a similar artist opens their page on top of this one */}
      <Modal visible={!!peekArtist} animationType="slide" onRequestClose={() => setPeekArtist(null)}>
        {peekArtist ? (
          <ArtistDetail name={peekArtist} onClose={() => setPeekArtist(null)}
            onSelectEvent={onSelectEvent} onSelectFestival={onSelectFestival} />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  center: { flex: 1, backgroundColor: "#0b0b0f", alignItems: "center", justifyContent: "center" },
  backPlain: { padding: 16 },
  errText: { color: MUTED, textAlign: "center", marginTop: 40 },

  hero: { height: 300, justifyContent: "flex-end" },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" },
  back: { position: "absolute", top: 10, left: 12, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 999, padding: 6 },
  heroText: { padding: 20 },
  name: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  tagText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  stats: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 18 },
  stat: { flex: 1 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: "#26262f", paddingLeft: 16 },
  statN: { color: "#f4f4f6", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  statL: { color: MUTED, fontSize: 11, fontWeight: "700", marginTop: 3 },
  audience: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingBottom: 14, marginTop: -6 },
  audienceText: { color: MUTED, fontSize: 12, fontWeight: "600" },

  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 8 },
  followBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14, backgroundColor: ACCENT },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3a3a46" },
  fdot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ACCENT },
  followText: { color: "#0b0b0f", fontSize: 15, fontWeight: "800" },
  followingText: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  iconBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, borderColor: "#26262f", alignItems: "center", justifyContent: "center" },

  section: { paddingHorizontal: 20, paddingTop: 18 },
  moreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 10, paddingVertical: 12,
    borderColor: "#26262f", borderWidth: 1, borderRadius: 12,
  },
  moreBtnText: { color: ACCENT, fontSize: 13.5, fontWeight: "800" },
  simScroll: { gap: 12, paddingRight: 20 },
  simCard: { width: 116, alignItems: "center" },
  simImg: { width: 116, height: 116, borderRadius: 14, marginBottom: 8 },
  simName: { color: "#f4f4f6", fontSize: 13.5, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  secSub: { color: MUTED, fontSize: 13, marginTop: -8, marginBottom: 12 },
  fescroll: { gap: 12, paddingRight: 20 },
  secTitle: { color: "#f4f4f6", fontSize: 18, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  thumb: { width: 54, height: 54, borderRadius: 10, overflow: "hidden", backgroundColor: "#14141b" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  rowTitle: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  rowSub: { color: MUTED, fontSize: 13, marginTop: 2 },
  rowMxs: { color: ACCENT, fontSize: 15, fontWeight: "800", marginLeft: 8 },

  empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyT: { color: "#f4f4f6", fontSize: 16, fontWeight: "700" },
  emptyS: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 20 },

  aboutCard: {
    backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 16, padding: 15,
  },
  aboutSnippet: { color: "#dcdce2", fontSize: 14.5, lineHeight: 22 },
  readMore: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 },
  readMoreText: { color: ACCENT, fontSize: 13.5, fontWeight: "800" },
  srcPill: {
    flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start",
    backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13, marginBottom: 13,
  },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  srcPillText: { color: MUTED, fontSize: 12, fontWeight: "700" },
});
