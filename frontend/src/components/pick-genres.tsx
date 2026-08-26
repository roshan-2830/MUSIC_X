import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { bulkFollow, GenreArtist, GenreOption, getGenreArtists, getGenres } from "../lib/api";
import { audienceLine, coverColor } from "../lib/format";

const ACCENT = "#e8ff47";
const ACCENT_INK = "#0b0b0f";
const MUTED = "#8a8a95";

/** Enough picks to give the artist step something to work with, few enough that the
 *  screen is not a chore. Below two, "Rock" alone returns a wall of stadium acts. */
const MIN_PICKS = 2;

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/**
 * The onboarding path for everyone without a Last.fm account — which is most people.
 *
 * Connecting a listening history is the shortest route to real recommendations, so it is
 * offered first. This is the fallback, and it has to stand on its own: pick a few genres,
 * get real artists who are actually playing, follow the ones you know.
 *
 * Every artist shown has an upcoming show. That is the point of following one — it is a
 * promise to tell you when they announce a date, and a follow that can never fire is a
 * dead end dressed up as personalisation.
 */
export default function PickGenres({
  onDone,
  onSearch,
}: {
  onDone: () => void;
  /** Hand off to the search screen — some people arrive knowing exactly who they want. */
  onSearch: () => void;
}) {
  const [step, setStep] = useState<"genres" | "artists">("genres");
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [artists, setArtists] = useState<GenreArtist[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getGenres(30)
      .then((g) => { if (alive) setGenres(g); })
      .catch(() => { if (alive) setError("Couldn’t load genres. Check your connection and try again."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pickedNames = Object.keys(picked).filter((k) => picked[k]);
  const chosenNames = Object.keys(chosen).filter((k) => chosen[k]);

  const loadArtists = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await getGenreArtists(pickedNames, 36);
      setArtists(list);
      // Nothing pre-selected. Following on someone's behalf because they tapped a genre
      // would be putting words in their mouth — the same rule the Last.fm import follows.
      setChosen({});
      setStep("artists");
    } catch {
      setError("Couldn’t load artists for those genres.");
    } finally {
      setLoading(false);
    }
  }, [pickedNames]);

  async function finish() {
    if (!chosenNames.length) { onDone(); return; }
    setBusy(true);
    try {
      await bulkFollow(
        artists.filter((a) => chosen[a.name])
          .map((a) => ({ name: a.name, image_url: a.image_url, genres: a.genres })),
      );
      onDone();
    } catch {
      setError("Couldn’t save your follows. Try again.");
      setBusy(false);
    }
  }

  /* ------------------------------------------------ genres */
  if (step === "genres") {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.logo}>MUSIC<Text style={styles.accent}>X</Text></Text>
          <Text style={styles.h1}>What do you listen to?</Text>
          <Text style={styles.sub}>
            Pick a few. We’ll show you artists who are actually playing — no guessing at your taste.
          </Text>

          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 34 }} />
          ) : error ? (
            <View style={styles.errBox}>
              <Ionicons name="cloud-offline-outline" size={32} color={MUTED} />
              <Text style={styles.errText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.chips}>
              {genres.map((g) => {
                const on = !!picked[g.name];
                return (
                  <Pressable
                    key={g.name}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setPicked((m) => ({ ...m, [g.name]: !m[g.name] }))}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.name}</Text>
                    {/* The count is the honest part: it says how much we can actually
                        offer for this genre before you commit to it. */}
                    <Text style={[styles.chipCount, on && styles.chipCountOn]}>{g.artist_count}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.foot}>
          <Pressable
            style={[styles.cta, pickedNames.length < MIN_PICKS && styles.ctaOff]}
            disabled={pickedNames.length < MIN_PICKS}
            onPress={loadArtists}
          >
            <Text style={styles.ctaText}>
              {pickedNames.length < MIN_PICKS
                ? `Pick ${MIN_PICKS - pickedNames.length} more`
                : `Show me ${pickedNames.length} genres of artists`}
            </Text>
          </Pressable>
          <Pressable onPress={onSearch} hitSlop={8}>
            <Text style={styles.skip}>I’d rather search for an artist</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* ------------------------------------------------ artists */
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.back} onPress={() => setStep("genres")} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={MUTED} />
          <Text style={styles.backText}>Genres</Text>
        </Pressable>

        <Text style={styles.h1}>Follow who you know</Text>
        <Text style={styles.sub}>
          Everyone here has a show coming up. Following someone means we’ll tell you when
          they announce a date near you.
        </Text>

        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 34 }} />
        ) : error ? (
          <View style={styles.errBox}>
            <Ionicons name="cloud-offline-outline" size={32} color={MUTED} />
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : artists.length === 0 ? (
          <View style={styles.errBox}>
            <Ionicons name="search-outline" size={32} color={MUTED} />
            <Text style={styles.errText}>
              Nobody in those genres has a date announced yet. Try different genres, or
              search for an artist by name.
            </Text>
          </View>
        ) : (
          artists.map((a) => {
            const on = !!chosen[a.name];
            return (
              <Pressable
                key={a.name}
                style={styles.row}
                onPress={() => setChosen((m) => ({ ...m, [a.name]: !m[a.name] }))}
              >
                {a.image_url ? (
                  <Image source={{ uri: a.image_url }} style={styles.avatar} contentFit="cover" transition={120} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: coverColor(a.name), alignItems: "center", justifyContent: "center" }]}>
                    <Text style={styles.avatarText}>{initials(a.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {a.genres.slice(0, 2).join(" · ")}
                    {a.upcoming_shows
                      ? ` · ${a.upcoming_shows} show${a.upcoming_shows > 1 ? "s" : ""}`
                      : ""}
                  </Text>
                  {audienceLine(a) ? (
                    <Text style={styles.audience} numberOfLines={1}>{audienceLine(a)}</Text>
                  ) : null}
                </View>
                <View style={[styles.tick, on && styles.tickOn]}>
                  {on ? <Ionicons name="checkmark" size={15} color={ACCENT_INK} /> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <View style={styles.foot}>
        <Pressable style={[styles.cta, busy && styles.ctaOff]} disabled={busy} onPress={finish}>
          <Text style={styles.ctaText}>
            {busy
              ? "Saving…"
              : chosenNames.length
                ? `Follow ${chosenNames.length} and continue`
                : "Continue without following"}
          </Text>
        </Pressable>
        <Pressable onPress={onSearch} hitSlop={8}>
          <Text style={styles.skip}>Search for someone else</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 26 },

  logo: { color: "#f4f4f6", fontSize: 15, fontWeight: "900", letterSpacing: 2, marginBottom: 26 },
  accent: { color: ACCENT },
  h1: { color: "#f4f4f6", fontSize: 27, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8 },
  sub: { color: MUTED, fontSize: 14.5, lineHeight: 21, marginBottom: 22 },

  back: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 16, alignSelf: "flex-start" },
  backText: { color: MUTED, fontSize: 14, fontWeight: "700" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#15151c", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10,
  },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: "#f4f4f6", fontSize: 14.5, fontWeight: "700" },
  chipTextOn: { color: ACCENT_INK },
  chipCount: { color: MUTED, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipCountOn: { color: "rgba(11,11,15,0.55)" },

  row: {
    flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { color: ACCENT_INK, fontWeight: "900", fontSize: 17 },
  name: { color: "#f4f4f6", fontSize: 16, fontWeight: "700" },
  meta: { color: MUTED, fontSize: 12.5, marginTop: 2, textTransform: "capitalize" },
  audience: { color: MUTED, fontSize: 11.5, marginTop: 1 },
  tick: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: "#33333e",
    alignItems: "center", justifyContent: "center",
  },
  tickOn: { backgroundColor: ACCENT, borderColor: ACCENT },

  errBox: { alignItems: "center", gap: 11, paddingVertical: 40, paddingHorizontal: 16 },
  errText: { color: MUTED, fontSize: 14.5, textAlign: "center", lineHeight: 21 },

  foot: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 14,
    borderTopWidth: 1, borderTopColor: "#1a1a22", alignItems: "center",
  },
  cta: {
    width: "100%", backgroundColor: ACCENT, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  ctaOff: { opacity: 0.35 },
  ctaText: { color: ACCENT_INK, fontSize: 15.5, fontWeight: "900" },
  skip: { color: MUTED, fontSize: 14, fontWeight: "700" },
});
