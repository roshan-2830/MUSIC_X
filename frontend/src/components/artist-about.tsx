import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ArtistDetail } from "../lib/api";
import { coverColor } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

// "https://www.karanaujlamusic.com/" -> "karanaujlamusic.com"
export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/** One "go deeper" row: icon tile, label, where it actually goes, external-link mark. */
function LinkRow({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <View style={styles.linkIcon}>
        <Ionicons name={icon} size={20} color={ACCENT} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="open-outline" size={17} color={MUTED} />
    </Pressable>
  );
}

/** The full About page — reached from "Read more" on the artist page. */
export default function ArtistAbout({
  data,
  onClose,
}: {
  data: ArtistDetail;
  onClose: () => void;
}) {
  const paragraphs = (data.bio ?? "").split(/\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#f4f4f6" />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>About</Text>
          <Text style={styles.headerName} numberOfLines={1}>{data.name}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        <View style={styles.hero}>
          {data.image_url ? (
            <Image source={{ uri: data.image_url }} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: coverColor(data.id) }]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroName}>{data.name}</Text>
            <Text style={styles.heroSub}>
              {data.genres.slice(0, 3).join(" · ") || "Live artist"}
              {data.show_count
                ? ` · ${data.show_count} upcoming show${data.show_count === 1 ? "" : "s"}`
                : ""}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {data.bio ? (
            <>
              {data.bio_source ? (
                <View style={styles.srcPill}>
                  <View style={styles.srcDot} />
                  <Text style={styles.srcPillText}>From {data.bio_source}</Text>
                </View>
              ) : null}
              {paragraphs.map((para, i) => (
                <Text key={i} style={styles.bio}>{para}</Text>
              ))}
            </>
          ) : (
            <Text style={styles.bioNone}>
              We haven’t found a biography we can cite for {data.name} yet. We’d rather leave
              this blank than write something we can’t attribute to a source.
            </Text>
          )}

          <Text style={styles.deeperH}>Go deeper</Text>

          {data.website_url ? (
            <LinkRow
              icon="globe-outline"
              title="Official website"
              sub={hostOf(data.website_url)}
              onPress={() => openUrl(data.website_url!)}
            />
          ) : null}

          {data.wiki_url ? (
            <LinkRow
              icon="book-outline"
              title="Wikipedia"
              sub="en.wikipedia.org"
              onPress={() => openUrl(data.wiki_url!)}
            />
          ) : (
            <LinkRow
              icon="search-outline"
              title="Search Wikipedia"
              sub="we haven’t matched a page for this name"
              onPress={() =>
                openUrl(
                  `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(data.name)}`
                )
              }
            />
          )}

          <View style={styles.disc}>
            <Ionicons name="checkmark-circle-outline" size={14} color={MUTED} />
            <Text style={styles.discText}>
              {!data.bio
                ? "We only publish a biography when we can attribute it to a source. Until we can, the search link above is the honest place to start."
                : data.website_url
                ? "Biography from Wikipedia; the artist’s own site is linked above. We keep both links so you can always read the original."
                : "Biography from Wikipedia. We keep the link so you can always read the original — and we only ever link a page we actually matched to this artist."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
  },
  kicker: {
    color: MUTED, fontSize: 10.5, fontWeight: "900",
    letterSpacing: 1.3, textTransform: "uppercase",
  },
  headerName: { color: "#f4f4f6", fontSize: 18, fontWeight: "900", marginTop: 2 },

  hero: { flexDirection: "row", alignItems: "center", gap: 15, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  avatar: { width: 74, height: 74, borderRadius: 18, overflow: "hidden" },
  heroName: { color: "#f4f4f6", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  heroSub: { color: MUTED, fontSize: 13, marginTop: 5, textTransform: "capitalize" },

  body: { paddingHorizontal: 20, paddingTop: 16 },
  srcPill: {
    flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start",
    backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 14,
  },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  srcPillText: { color: MUTED, fontSize: 12, fontWeight: "700" },
  bio: { color: "#dcdce2", fontSize: 15.5, lineHeight: 26, marginBottom: 15 },
  bioNone: { color: MUTED, fontSize: 14.5, lineHeight: 22 },
  deeperH: {
    color: MUTED, fontSize: 12, fontWeight: "900", letterSpacing: 1.2,
    textTransform: "uppercase", marginTop: 26, marginBottom: 12,
  },
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 11,
  },
  linkIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#1c1c24",
    alignItems: "center", justifyContent: "center",
  },
  linkTitle: { color: "#f4f4f6", fontSize: 15, fontWeight: "800" },
  linkSub: { color: MUTED, fontSize: 12.5, marginTop: 2 },
  disc: {
    flexDirection: "row", gap: 7, marginTop: 20, paddingTop: 16,
    borderTopColor: "#26262f", borderTopWidth: 1,
  },
  discText: { color: MUTED, fontSize: 11.5, lineHeight: 17.5, flex: 1 },
});
