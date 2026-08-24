import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { bulkFollow, connectLastfm } from "../lib/api";
import { coverColor } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

type Found = { name: string; image_url: string | null; playcount: number };

/** The sources, in the mockup's order and brand colours.
 *
 *  Only Last.fm is live, and the rest say why rather than being silently dead: Spotify
 *  closed its taste endpoints to new apps in 2024, and Apple and Amazon have no free
 *  taste API at all. A greyed row with no explanation reads as "broken"; one that says
 *  "not available yet" reads as honest. */
const SOURCES: {
  key: string; name: string; colour: string; icon: keyof typeof Ionicons.glyphMap;
  live: boolean; note?: string;
}[] = [
  { key: "lastfm", name: "Last.fm", colour: "#D51007", icon: "radio", live: true },
  { key: "spotify", name: "Spotify", colour: "#1DB954", icon: "musical-notes", live: false, note: "Spotify closed this to new apps" },
  { key: "apple", name: "Apple Music", colour: "#FA243C", icon: "musical-note", live: false, note: "No free API" },
  { key: "amazon", name: "Amazon Music", colour: "#25D1DA", icon: "volume-medium", live: false, note: "No free API" },
];

export default function ConnectMusic({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<"sources" | "username" | "confirm">("sources");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<string>("");

  const chosen = found.filter((a) => picked[a.name]);

  async function scan() {
    const u = username.trim();
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      const r = await connectLastfm(u);
      const top = r.artists.slice(0, 30);
      setFound(top);
      // Pre-selected: they already told us these are their artists by playing them.
      // Making them tick 30 boxes to confirm what they just imported is busywork.
      setPicked(Object.fromEntries(top.map((a) => [a.name, true])));
      setWho(r.realname || r.username);
      setStep("confirm");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    if (chosen.length) {
      await bulkFollow(chosen.map((a) => ({ name: a.name, image_url: a.image_url }))).catch(() => {});
    }
    setBusy(false);
    onDone();
  }

  const segment = step === "sources" ? 1 : step === "username" ? 2 : 3;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.progress}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.seg, n <= segment && styles.segOn]} />
        ))}
      </View>

      {step === "sources" ? (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.h1}>Connect your music</Text>
            <Text style={styles.sub}>
              We&rsquo;ll read what you already listen to and build your recommendations from
              it — no questionnaire, nothing to fill in.
            </Text>

            <View style={{ marginTop: 22 }}>
              {SOURCES.map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.srcRow, !s.live && styles.srcOff]}
                  disabled={!s.live}
                  onPress={() => setStep("username")}>
                  <View style={[styles.srcLogo, { backgroundColor: s.colour }]}>
                    <Ionicons name={s.icon} size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.srcName}>{s.name}</Text>
                    {s.note ? <Text style={styles.srcNote}>{s.note}</Text> : null}
                  </View>
                  {s.live ? (
                    <Ionicons name="chevron-forward" size={18} color={ACCENT} />
                  ) : (
                    <Text style={styles.soon}>Soon</Text>
                  )}
                </Pressable>
              ))}
            </View>

            <View style={styles.privacy}>
              <Ionicons name="lock-closed-outline" size={14} color={MUTED} />
              <Text style={styles.privacyText}>
                Read-only. We never post to your account, and we never sell what we learn.
              </Text>
            </View>
          </ScrollView>
          <Pressable style={styles.skip} onPress={onSkip}>
            <Text style={styles.skipText}>Skip — I&rsquo;ll pick my artists myself</Text>
          </Pressable>
        </>
      ) : step === "username" ? (
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={[styles.srcLogo, { backgroundColor: "#D51007", marginBottom: 18 }]}>
              <Ionicons name="radio" size={20} color="#fff" />
            </View>
            <Text style={styles.h1}>What&rsquo;s your Last.fm username?</Text>
            <Text style={styles.sub}>
              The name in your profile address — last.fm/user/
              <Text style={{ color: ACCENT }}>yourname</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => { setUsername(t); setError(null); }}
              placeholder="yourname"
              placeholderTextColor={MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={scan}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.privacyText}>
              No password needed — Last.fm profiles are public, so there&rsquo;s nothing to
              authorise.
            </Text>
          </ScrollView>
          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={scan} disabled={busy}>
            {busy ? (
              <>
                <ActivityIndicator color="#0b0b0f" size="small" />
                <Text style={styles.ctaText}>Reading your listening…</Text>
              </>
            ) : (
              <>
                <Text style={styles.ctaText}>Scan my listening</Text>
                <Ionicons name="arrow-forward" size={17} color="#0b0b0f" />
              </>
            )}
          </Pressable>
          <Pressable style={styles.skip} onPress={() => setStep("sources")}>
            <Text style={styles.skipText}>Back</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.h1}>These are your artists</Text>
            <Text style={styles.sub}>
              From {who}&rsquo;s listening, most played first. Tap any to leave out —
              we&rsquo;ll alert you when the ones you keep announce a date.
            </Text>

            <View style={styles.grid}>
              {found.map((a) => {
                const on = !!picked[a.name];
                return (
                  <Pressable
                    key={a.name}
                    style={styles.gridItem}
                    onPress={() => setPicked((p) => ({ ...p, [a.name]: !p[a.name] }))}>
                    <View style={styles.avatarWrap}>
                      {a.image_url ? (
                        <Image source={{ uri: a.image_url }} style={[styles.avatar, !on && styles.avatarOff]} contentFit="cover" transition={120} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: coverColor(a.name) }, !on && styles.avatarOff]} />
                      )}
                      <View style={[styles.tick, on && styles.tickOn]}>
                        {on ? <Ionicons name="checkmark" size={13} color="#0b0b0f" /> : null}
                      </View>
                    </View>
                    <Text style={[styles.gridName, !on && { color: MUTED }]} numberOfLines={2}>
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={finish} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#0b0b0f" size="small" />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  {chosen.length ? `Follow ${chosen.length} artist${chosen.length === 1 ? "" : "s"}` : "Continue without following"}
                </Text>
                <Ionicons name="arrow-forward" size={17} color="#0b0b0f" />
              </>
            )}
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const COL = 3;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingTop: 10 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#26262f" },
  segOn: { backgroundColor: ACCENT },
  body: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 20 },
  h1: { color: "#f4f4f6", fontSize: 26, fontWeight: "900", letterSpacing: -0.6, lineHeight: 32 },
  sub: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 10 },

  srcRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#1c1c24",
  },
  srcOff: { opacity: 0.45 },
  srcLogo: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  srcName: { color: "#f4f4f6", fontSize: 16, fontWeight: "700" },
  srcNote: { color: MUTED, fontSize: 12, marginTop: 2 },
  soon: { color: MUTED, fontSize: 12, fontWeight: "700" },

  privacy: { flexDirection: "row", gap: 8, marginTop: 26, alignItems: "flex-start" },
  privacyText: { color: MUTED, fontSize: 12, lineHeight: 17.5, flex: 1, marginTop: 14 },

  input: {
    backgroundColor: "#14141b", borderColor: "#2a2a38", borderWidth: 1, borderRadius: 12,
    color: "#f4f4f6", fontSize: 17, paddingHorizontal: 15, paddingVertical: 13, marginTop: 18,
  },
  error: { color: "#ff6b6b", fontSize: 13, marginTop: 10, lineHeight: 19 },

  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 20, marginHorizontal: -6 },
  gridItem: { width: `${100 / COL}%`, paddingHorizontal: 6, marginBottom: 18, alignItems: "center" },
  avatarWrap: { position: "relative" },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarOff: { opacity: 0.3 },
  tick: {
    position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: "#0b0b0f", backgroundColor: "#2a2a38",
    alignItems: "center", justifyContent: "center",
  },
  tickOn: { backgroundColor: ACCENT },
  gridName: { color: "#e2e2e8", fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 7, lineHeight: 15 },

  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, marginHorizontal: 20,
  },
  ctaText: { color: "#0b0b0f", fontSize: 15.5, fontWeight: "800" },
  skip: { alignItems: "center", paddingVertical: 16 },
  skipText: { color: MUTED, fontSize: 13.5, fontWeight: "600" },
});
