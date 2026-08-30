/**
 * Linking a setlist.fm profile, and bringing that history into the Passport.
 *
 * ATTRIBUTION IS NOT DECORATION HERE. setlist.fm's terms require their data to be credited
 * wherever it appears, with a real link — that is the price of a database twenty years of fans
 * typed in for free, and skipping it is grounds for the key being revoked, which would break
 * every imported passport at once.
 *
 * It happens to be the same line of text the app needs anyway: setlist.fm cannot prove an
 * account belongs to whoever types its name, so imported shows have to be visibly labelled as
 * imported rather than presented as confirmed here.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SetlistfmLink, getSetlistfmLink, linkSetlistfm, unlinkSetlistfm,
} from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const SETLISTFM = "https://www.setlist.fm/";

export default function SetlistfmLinkView({ onClose, onChanged }:
  { onClose: () => void; onChanged?: () => void }) {
  const [link, setLink] = useState<SetlistfmLink | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    getSetlistfmLink().then(setLink).catch(() => setLink(null));
  }, []);
  useEffect(load, [load]);

  async function connect() {
    const u = username.trim().replace(/^@/, "");
    if (!u) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await linkSetlistfm(u);
      setDone(r.added === 0
        ? "Already up to date — nothing new to add."
        : `Added ${r.added} ${r.added === 1 ? "concert" : "concerts"} to your Passport.`);
      setUsername("");
      load();
      onChanged?.();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    setBusy(false);
  }

  async function disconnect() {
    setBusy(true); setError(null); setDone(null);
    try {
      await unlinkSetlistfm();
      load();
      onChanged?.();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    setBusy(false);
  }

  const connected = !!link?.username;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#f4f4f6" />
        </Pressable>
        <Text style={styles.title}>Concert history</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.lead}>
          Your Passport starts the day you joined Music X. If you’ve been logging concerts on
          setlist.fm, bring that history in.
        </Text>

        {!link?.available ? (
          <View style={styles.note}>
            <Ionicons name="alert-circle-outline" size={18} color={MUTED} />
            <Text style={styles.noteT}>
              setlist.fm importing isn’t switched on for this app right now.
            </Text>
          </View>
        ) : connected ? (
          <View style={styles.card}>
            <Text style={styles.cardL}>Connected as</Text>
            <Text style={styles.cardV}>{link!.username}</Text>
            {link!.last_synced_at ? (
              <Text style={styles.cardS}>
                Last imported {new Date(link!.last_synced_at).toLocaleDateString("en-GB",
                  { day: "numeric", month: "short", year: "numeric" })}
                {typeof link!.last_import_count === "number"
                  ? ` · ${link!.last_import_count} added` : ""}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable style={[styles.btn, styles.ghost]} disabled={busy}
                         onPress={() => { setUsername(link!.username || ""); connect(); }}>
                <Text style={styles.ghostT}>Import again</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.danger]} disabled={busy} onPress={disconnect}>
                <Text style={styles.dangerT}>Disconnect</Text>
              </Pressable>
            </View>
            <Text style={styles.warn}>
              Disconnecting removes the concerts that were imported. Shows you ticked here stay.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardL}>Your setlist.fm username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. yourname"
              placeholderTextColor="#5a5a66"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              onSubmitEditing={connect}
            />
            <Pressable style={[styles.btn, styles.primary]} disabled={busy || !username.trim()}
                       onPress={connect}>
              {busy ? <ActivityIndicator color="#101204" size="small" />
                    : <Text style={styles.primaryT}>Import my concerts</Text>}
            </Pressable>
            <Text style={styles.warn}>
              Imported concerts are labelled as coming from setlist.fm — we can’t verify the
              account is yours, so they’re shown as imported rather than confirmed here.
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.err}><Text style={styles.errT}>{error}</Text></View>
        ) : null}
        {done ? (
          <View style={styles.ok}><Text style={styles.okT}>{done}</Text></View>
        ) : null}

        {/* REQUIRED by setlist.fm's terms: credit wherever their data is used, with a real
            link. Also the honest label — see the note at the top of this file. */}
        <Pressable style={styles.attr} onPress={() => Linking.openURL(SETLISTFM)}>
          <Text style={styles.attrT}>
            Concert history powered by <Text style={styles.attrLink}>setlist.fm</Text>
          </Text>
          <Ionicons name="open-outline" size={13} color={ACCENT} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  lead: { color: MUTED, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  card: { backgroundColor: "#14141b", borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: "#23232c" },
  cardL: { color: MUTED, fontSize: 11, fontWeight: "800", letterSpacing: 0.8,
           textTransform: "uppercase" },
  cardV: { color: "#f4f4f6", fontSize: 20, fontWeight: "800", marginTop: 4 },
  cardS: { color: MUTED, fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: "#0f0f15", borderRadius: 11, borderWidth: 1, borderColor: "#2b2b36",
    color: "#f4f4f6", fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 8, marginBottom: 12,
  },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: "center" },
  primary: { backgroundColor: ACCENT },
  primaryT: { color: "#101204", fontSize: 15, fontWeight: "800" },
  ghost: { backgroundColor: "#1b1b24", borderWidth: 1, borderColor: "#2b2b36" },
  ghostT: { color: "#e6e6ee", fontSize: 14, fontWeight: "700" },
  danger: { backgroundColor: "#1b1b24", borderWidth: 1, borderColor: "#3a2426" },
  dangerT: { color: "#ff6b6b", fontSize: 14, fontWeight: "700" },
  warn: { color: "#6c6c78", fontSize: 11, lineHeight: 16, marginTop: 12 },
  note: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#14141b",
          borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#23232c" },
  noteT: { color: MUTED, fontSize: 13, flex: 1 },
  err: { backgroundColor: "#241a1c", borderRadius: 12, padding: 12, marginTop: 12,
         borderWidth: 1, borderColor: "#3a2426" },
  errT: { color: "#ff9b9b", fontSize: 13, lineHeight: 18 },
  ok: { backgroundColor: "#17201a", borderRadius: 12, padding: 12, marginTop: 12,
        borderWidth: 1, borderColor: "#24422f" },
  okT: { color: "#8ee5a8", fontSize: 13 },
  attr: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          marginTop: 26 },
  attrT: { color: MUTED, fontSize: 12 },
  attrLink: { color: ACCENT, fontWeight: "700", textDecorationLine: "underline" },
});
