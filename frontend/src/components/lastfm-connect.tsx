import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";

import {
  connectLastfm, disconnectLastfm, getLastfmStatus, LastfmStatus,
} from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

/** Connect a Last.fm account so recommendations are built on real listening.
 *
 *  Shows the invitation while nothing is connected, and a summary of what was imported
 *  once it is. Deliberately states what we take and what we do not: Last.fm profiles are
 *  public, so this needs a username and no password, and we never write anything back. */
export default function LastfmConnect({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<LastfmStatus>({ connected: false });
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    getLastfmStatus().then(setStatus).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function submit() {
    const u = username.trim();
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      const r = await connectLastfm(u);
      setDone(
        `Imported ${r.artists_imported} artists from ${r.realname || r.username}` +
          (r.genres.length ? ` · ${r.genres.slice(0, 3).join(", ")}` : "")
      );
      setOpen(false);
      setUsername("");
      load();
      onChanged?.();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await disconnectLastfm().catch(() => {});
    setBusy(false);
    setDone(null);
    load();
    onChanged?.();
  }

  // Connected? Show nothing. This card exists to OFFER something; once the offer is
  // taken it has nothing left to say, and a permanent status panel in the middle of Home
  // is settings information sitting in the user's content. Re-sync and Disconnect belong
  // in the Me tab, alongside the notification settings that are also waiting for it.
  if (status.connected) return null;

  // ---- not connected: the invitation ----
  return (
    <>
      <Pressable style={styles.invite} onPress={() => setOpen(true)}>
        <Ionicons name="musical-notes" size={16} color={ACCENT} />
        <Text style={styles.inviteText}>
          Connect Last.fm to build this from what you actually play
        </Text>
        <Ionicons name="chevron-forward" size={15} color={ACCENT} />
      </Pressable>
      {done ? <Text style={styles.done}>{done}</Text> : null}
      {sheet()}
    </>
  );

  function sheet() {
    return (
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetWrap}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Your Last.fm username</Text>
            <Text style={styles.sheetSub}>
              The name in your profile URL — last.fm/user/<Text style={{ color: ACCENT }}>yourname</Text>
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
              onSubmitEditing={submit}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#0b0b0f" size="small" />
              ) : (
                <Text style={styles.ctaText}>Connect</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  invite: {
    flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    marginHorizontal: 16, marginTop: 4,
  },
  inviteText: { color: "#e2e2e8", fontSize: 13, flex: 1, lineHeight: 18 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 12, marginTop: 14,
  },
  ctaText: { color: "#0b0b0f", fontSize: 14.5, fontWeight: "800" },
  done: { color: ACCENT, fontSize: 12.5, marginTop: 10, marginHorizontal: 16 },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#14141b", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 34, borderTopColor: "#26262f", borderTopWidth: 1,
  },
  sheetTitle: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  sheetSub: { color: MUTED, fontSize: 13, marginTop: 6, lineHeight: 19 },
  input: {
    backgroundColor: "#0b0b0f", borderColor: "#2a2a38", borderWidth: 1, borderRadius: 12,
    color: "#f4f4f6", fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14,
  },
  error: { color: "#ff6b6b", fontSize: 12.5, marginTop: 10, lineHeight: 18 },
});
