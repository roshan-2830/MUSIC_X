import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ArtistSearchResult,
  followArtist,
  getFollows,
  searchArtists,
  unfollowArtist,
} from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

/**
 * The "follow your artists" screen. Reusable: pass `onDone` to show the onboarding
 * footer (Continue / Skip); omit it to use as a plain manage-follows screen.
 */
export default function FollowArtists({
  onDone,
  title = "Who do you love?",
}: {
  onDone?: () => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ArtistSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // lowercased artist name -> local follow id ("pending" while the POST is in flight)
  const [followed, setFollowed] = useState<Record<string, string>>({});
  const followCount = Object.keys(followed).length;

  // Load who they already follow, so those show as "Following".
  const loadFollows = useCallback(async () => {
    try {
      const list = await getFollows();
      const m: Record<string, string> = {};
      list.forEach((a) => (m[a.name.toLowerCase()] = a.id));
      setFollowed(m);
    } catch {}
  }, []);

  useEffect(() => {
    loadFollows();
  }, [loadFollows]);

  // Debounced global artist search.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchArtists(q.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function toggle(a: ArtistSearchResult) {
    const key = a.name.toLowerCase();
    const existingId = followed[key];
    if (existingId) {
      // Unfollow — optimistic remove.
      setFollowed((m) => {
        const n = { ...m };
        delete n[key];
        return n;
      });
      if (existingId !== "pending") unfollowArtist(existingId).catch(() => {});
    } else {
      // Follow — optimistic add, then reconcile with the real id.
      setFollowed((m) => ({ ...m, [key]: "pending" }));
      try {
        const saved = await followArtist({
          name: a.name,
          deezer_id: a.deezer_id,
          image_url: a.image_url,
        });
        setFollowed((m) => ({ ...m, [key]: saved.id }));
      } catch {
        setFollowed((m) => {
          const n = { ...m };
          delete n[key];
          return n;
        });
      }
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          MUSIC<Text style={styles.accent}>X</Text>
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>
          Follow your artists — we’ll track their shows worldwide and tell you the moment
          they announce one.
        </Text>
      </View>

      <View style={styles.searchbar}>
        <Ionicons name="search" size={18} color={MUTED} />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Search artists — Coldplay, Arijit Singh…"
          placeholderTextColor={MUTED}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
      ) : q.trim().length < 2 ? (
        <Text style={styles.hint}>Search for an artist to get started.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(a) => `${a.name}-${a.deezer_id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.hint}>No artists match “{q.trim()}”.</Text>}
          renderItem={({ item }) => {
            const isFollowing = !!followed[item.name.toLowerCase()];
            return (
              <View style={styles.row}>
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={120}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>{item.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Pressable
                  style={[styles.followBtn, isFollowing && styles.followingBtn]}
                  onPress={() => toggle(item)}
                  hitSlop={6}
                >
                  <Text style={isFollowing ? styles.followingText : styles.followText}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {onDone ? (
        <View style={styles.footer}>
          <Pressable style={styles.cta} onPress={onDone}>
            <Text style={styles.ctaText}>
              {followCount > 0
                ? `Continue with ${followCount} artist${followCount > 1 ? "s" : ""}`
                : "Continue"}
            </Text>
          </Pressable>
          <Pressable onPress={onDone} hitSlop={8}>
            <Text style={styles.skip}>Skip for now</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f", paddingHorizontal: 20 },
  header: { paddingTop: 8, paddingBottom: 14 },
  logo: { color: "#f4f4f6", fontSize: 20, fontWeight: "800", letterSpacing: 1, marginBottom: 14 },
  accent: { color: ACCENT },
  title: { color: "#f4f4f6", fontSize: 27, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: MUTED, fontSize: 14, marginTop: 8, lineHeight: 20 },
  searchbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#14141b",
    borderWidth: 1,
    borderColor: "#26262f",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 6,
  },
  input: { flex: 1, color: "#f4f4f6", fontSize: 15, padding: 0 },
  hint: { color: MUTED, fontSize: 14, textAlign: "center", paddingVertical: 28, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 9,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#1b1b24" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: MUTED, fontSize: 20, fontWeight: "800" },
  name: { color: "#f4f4f6", fontSize: 16, fontWeight: "700" },
  followBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: ACCENT,
  },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3a3a46" },
  followText: { color: "#0b0b0f", fontSize: 14, fontWeight: "800" },
  followingText: { color: MUTED, fontSize: 14, fontWeight: "700" },
  footer: { paddingTop: 10, paddingBottom: 6, gap: 12, alignItems: "center" },
  cta: {
    width: "100%",
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaText: { color: "#0b0b0f", fontSize: 16, fontWeight: "800" },
  skip: { color: MUTED, fontSize: 14, fontWeight: "700" },
});
