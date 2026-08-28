import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  followPerson, getInvitesSent, Person, searchPeople, sendInvites, unfollowPerson,
} from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const SHEET = "#101014";

/** Initials for someone with no photo. Two letters at most: "Priya Sharma" -> PS. */
function initials(name: string | null): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 34 }: { name: string | null; size?: number }) {
  // No photo means initials, never a stock silhouette: a grey outline of a person repeated
  // down a list makes everyone look like the same stranger.
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

function Row({
  person, picked, invited, onToggle, onFollow,
}: {
  person: Person;
  picked: boolean;
  invited: boolean;
  onToggle: () => void;
  onFollow: () => void;
}) {
  const where = [person.home_city, person.home_country].filter(Boolean).join(", ");
  // Someone you do not follow cannot be invited — that is what stops this being a way to
  // notify a stranger — so the row offers Follow instead of a tick.
  if (!person.following) {
    return (
      <View style={styles.row}>
        <Avatar name={person.display_name} />
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>{person.display_name || "Someone"}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {where || "No city set"}{person.follows_you ? " · follows you" : ""}
          </Text>
        </View>
        <Pressable style={styles.followBtn} onPress={onFollow}>
          <Text style={styles.followText}>Follow</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable style={styles.row} onPress={invited ? undefined : onToggle} disabled={invited}>
      <Avatar name={person.display_name} />
      <View style={styles.rowBody}>
        <Text style={[styles.name, invited && styles.dim]} numberOfLines={1}>
          {person.display_name || "Someone"}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {invited ? "Already invited" : (where || "No city set")}
        </Text>
      </View>
      {invited ? (
        <Ionicons name="checkmark-done" size={18} color={MUTED} />
      ) : (
        <View style={[styles.tick, picked && styles.tickOn]}>
          {picked ? <Ionicons name="checkmark" size={14} color="#101204" /> : null}
        </View>
      )}
    </Pressable>
  );
}

/**
 * "Invite friends" — pick people you follow and send them this show.
 *
 * Opens on the people you already follow rather than an empty search box, because that is the
 * list somebody came here to use. Searching widens it to everyone, where a stranger can be
 * followed first — inviting is restricted to people you follow, so the sheet has to offer a way
 * to get there rather than showing names it will refuse to send to.
 */
export default function InviteSheet({
  visible, onClose, eventId, eventTitle, onSent,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string | null;
  onSent?: (count: number) => void;
}) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    const [list, sent] = await Promise.all([
      searchPeople(term),
      getInvitesSent(eventId),
    ]);
    setPeople(list);
    setInvited(new Set(sent));
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (!visible) return;
    setPicked(new Set());
    setNote("");
    setError(null);
    load("");
  }, [visible, load]);

  // Debounced, so typing a name is one request when they stop rather than one per letter.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => load(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q, visible, load]);

  const friends = useMemo(() => people.filter((p) => p.following), [people]);
  const invitable = useMemo(
    () => friends.filter((p) => !invited.has(p.id)),
    [friends, invited],
  );
  const allPicked = invitable.length > 0 && picked.size === invitable.length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const follow = async (p: Person) => {
    // Optimistic: the row flips immediately and the list is re-read after, so a slow network
    // does not make a tap look ignored.
    setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, following: true } : x)));
    const ok = await followPerson(p.id);
    if (!ok) {
      setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, following: false } : x)));
      setError("Couldn't follow that person — try again.");
    }
  };

  const send = async () => {
    if (!picked.size) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendInvites(eventId, [...picked], note.trim() || undefined);
      onSent?.(res.invited);
      onClose();
    } catch {
      setError("Couldn't send those invites — try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Invite friends</Text>
              {eventTitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>{eventTitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={MUTED} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={15} color={MUTED} />
            <TextInput
              style={styles.search}
              placeholder="Search people by name"
              placeholderTextColor={MUTED}
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {q ? (
              <Pressable onPress={() => setQ("")} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color={MUTED} />
              </Pressable>
            ) : null}
          </View>

          {invitable.length > 1 ? (
            <Pressable
              style={styles.selectAll}
              onPress={() =>
                setPicked(allPicked ? new Set() : new Set(invitable.map((p) => p.id)))
              }
            >
              <Ionicons
                name={allPicked ? "checkbox" : "square-outline"}
                size={16}
                color={allPicked ? ACCENT : MUTED}
              />
              <Text style={styles.selectAllText}>
                {allPicked ? "Clear all" : `Select all ${invitable.length}`}
              </Text>
            </Pressable>
          ) : null}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.state}><ActivityIndicator color={ACCENT} /></View>
            ) : null}

            {!loading && !people.length ? (
              <View style={styles.state}>
                <Ionicons name="people-outline" size={18} color={MUTED} />
                <Text style={styles.stateText}>
                  {q
                    ? `Nobody matching "${q}".`
                    : "Nobody to invite yet — search for a friend by name to follow them first."}
                </Text>
              </View>
            ) : null}

            {!loading
              ? people.map((p) => (
                  <Row
                    key={p.id}
                    person={p}
                    picked={picked.has(p.id)}
                    invited={invited.has(p.id)}
                    onToggle={() => toggle(p.id)}
                    onFollow={() => follow(p)}
                  />
                ))
              : null}
          </ScrollView>

          {picked.size ? (
            <TextInput
              style={styles.note}
              placeholder="Add a note (optional)"
              placeholderTextColor={MUTED}
              value={note}
              onChangeText={setNote}
              maxLength={200}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.send, !picked.size && styles.sendOff]}
            onPress={send}
            disabled={!picked.size || sending}
          >
            {sending ? (
              <ActivityIndicator color="#101204" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={15} color={picked.size ? "#101204" : MUTED} />
                <Text style={[styles.sendText, !picked.size && styles.sendTextOff]}>
                  {picked.size ? `Invite ${picked.size}` : "Pick someone to invite"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: SHEET, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22, maxHeight: "86%",
    borderWidth: 1, borderColor: LINE,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  subtitle: { color: MUTED, fontSize: 13, marginTop: 2 },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#17171d",
    borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
    borderColor: LINE,
  },
  search: { flex: 1, color: "#f4f4f6", fontSize: 14, padding: 0 },

  selectAll: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 12 },
  selectAllText: { color: MUTED, fontSize: 13, fontWeight: "700" },

  list: { marginTop: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: LINE,
  },
  rowBody: { flex: 1 },
  name: { color: "#f4f4f6", fontSize: 14.5, fontWeight: "700" },
  dim: { color: MUTED },
  sub: { color: MUTED, fontSize: 12, marginTop: 2 },

  avatar: { backgroundColor: "#23232c", alignItems: "center", justifyContent: "center" },
  avatarText: { color: ACCENT, fontWeight: "800" },

  tick: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: LINE,
    alignItems: "center", justifyContent: "center",
  },
  tickOn: { backgroundColor: ACCENT, borderColor: ACCENT },

  followBtn: {
    borderWidth: 1, borderColor: "rgba(232,255,71,0.4)", borderRadius: 9,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  followText: { color: ACCENT, fontSize: 12.5, fontWeight: "800" },

  note: {
    backgroundColor: "#17171d", borderRadius: 11, borderWidth: 1, borderColor: LINE,
    color: "#f4f4f6", fontSize: 14, paddingHorizontal: 12, paddingVertical: 11, marginTop: 12,
  },
  error: { color: "#ff7a6b", fontSize: 12.5, marginTop: 10 },

  state: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 26 },
  stateText: { color: MUTED, fontSize: 13, flex: 1, lineHeight: 18 },

  send: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, marginTop: 14,
  },
  sendOff: { backgroundColor: "#1b1b23" },
  sendText: { color: "#101204", fontSize: 14.5, fontWeight: "800" },
  sendTextOff: { color: MUTED },
});
