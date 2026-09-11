import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  followPerson, getInvitesSent, Person, searchPeople, sendInvites, unfollowPerson,
} from "../lib/api";
import { alpha, Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";


/** Initials for someone with no photo. Two letters at most: "Priya Sharma" -> PS. */
function initials(name: string | null): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 34 }: { name: string | null; size?: number }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
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
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
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
        <Ionicons name="checkmark-done" size={18} color={th.muted} />
      ) : (
        <View style={[styles.tick, picked && styles.tickOn]}>
          {picked ? <Ionicons name="checkmark" size={14} color={th.accentInk} /> : null}
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
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
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
              <Ionicons name="close" size={22} color={th.muted} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={15} color={th.muted} />
            <TextInput
              style={styles.search}
              placeholder="Search people by name"
              placeholderTextColor={th.muted}
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {q ? (
              <Pressable onPress={() => setQ("")} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color={th.muted} />
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
                color={allPicked ? th.accent : th.muted}
              />
              <Text style={styles.selectAllText}>
                {allPicked ? "Clear all" : `Select all ${invitable.length}`}
              </Text>
            </Pressable>
          ) : null}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.state}><ActivityIndicator color={th.accent} /></View>
            ) : null}

            {!loading && !people.length ? (
              <View style={styles.state}>
                <Ionicons name="people-outline" size={18} color={th.muted} />
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
              placeholderTextColor={th.muted}
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
              <ActivityIndicator color={th.accentInk} />
            ) : (
              <>
                <Ionicons name="paper-plane" size={15} color={picked.size ? th.accentInk : th.muted} />
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

const makeStyles = (th: Theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: th.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: th.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22, maxHeight: "86%",
    borderWidth: 1, borderColor: th.line,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  title: { color: th.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: th.muted, fontSize: 13, marginTop: 2 },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: th.panel,
    borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
    borderColor: th.line,
  },
  search: { flex: 1, color: th.text, fontSize: 14, padding: 0 },

  selectAll: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 12 },
  selectAllText: { color: th.muted, fontSize: 13, fontWeight: "700" },

  list: { marginTop: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: th.line,
  },
  rowBody: { flex: 1 },
  name: { color: th.text, fontSize: 14.5, fontWeight: "700" },
  dim: { color: th.muted },
  sub: { color: th.muted, fontSize: 12, marginTop: 2 },

  avatar: { backgroundColor: th.panel3, alignItems: "center", justifyContent: "center" },
  avatarText: { color: th.accent, fontWeight: "800" },

  tick: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: th.line,
    alignItems: "center", justifyContent: "center",
  },
  tickOn: { backgroundColor: th.accentFill, borderColor: th.accentFill },

  followBtn: {
    borderWidth: 1, borderColor: alpha(th.accent, 0.4), borderRadius: 9,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  followText: { color: th.accent, fontSize: 12.5, fontWeight: "800" },

  note: {
    backgroundColor: th.panel, borderRadius: 11, borderWidth: 1, borderColor: th.line,
    color: th.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11, marginTop: 12,
  },
  error: { color: th.danger2, fontSize: 12.5, marginTop: 10 },

  state: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 26 },
  stateText: { color: th.muted, fontSize: 13, flex: 1, lineHeight: 18 },

  send: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: th.accentFill, borderRadius: 12, paddingVertical: 14, marginTop: 14,
  },
  sendOff: { backgroundColor: th.panel2 },
  sendText: { color: th.accentInk, fontSize: 14.5, fontWeight: "800" },
  sendTextOff: { color: th.muted },
});
