/**
 * My shows — everything saved, filed by the state its plan is actually in.
 *
 * The Me tab row used to jump to the Calendar tab, which is a different question: the Calendar
 * asks "what is on in this window of time", this asks "what have I committed to, and how far
 * along is each one". A show in November is invisible on an October calendar and belongs here
 * all the same.
 *
 * THE STATES ARE NOT A MENU. Nothing on this screen moves a show between tabs, because nothing
 * should: the state is derived on the server from the ticket, the hotel, the invites and the
 * (see services/plan.py). Tapping through to the show and doing one of those things is
 * what moves it. A "mark as Planning" button here would let the label disagree with the facts
 * underneath it, which is the exact failure the derived design exists to prevent.
 *
 * "Missed" gets its own tab rather than hiding inside Attended. It is an answer somebody gave
 * us — asked after the show and told no — and folding it into the shows they did attend would
 * overwrite what they said with what we assumed.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import EventDetailView from "./event-detail";
import FestivalDetailView from "./festival-detail";
import { Festival, MyShow, MyShows as MyShowsT, getMyShows } from "../lib/api";
import { coverColor, flagEmoji, formatDay } from "../lib/format";


type TabKey = "interested" | "planning" | "confirmed" | "attended" | "missed" | "festivals";

const TABS: { key: TabKey; label: string }[] = [
  { key: "interested", label: "Interested" },
  { key: "planning", label: "Planning" },
  { key: "confirmed", label: "Confirmed" },
  { key: "attended", label: "Attended" },
  { key: "missed", label: "Missed" },
  { key: "festivals", label: "Festivals" },
];

/** What each empty tab says. Never "nothing here" on its own — each one names the thing that
 *  would put a show in it, so the tab explains the ladder instead of just being blank. */
const EMPTY: Record<TabKey, string> = {
  interested: "Nothing saved yet. Tap the bookmark on any show and it lands here.",
  planning: "A show moves here once you start building the trip around it — a place to stay, "
    + "or an invite to a friend.",
  confirmed: "Shows land here when you add your ticket, on the show's own page.",
  attended: "Shows land here after they happen, if you had a ticket or told us you went.",
  missed: "Shows you told us you didn't make. Nothing to see is the good outcome.",
  festivals: "No festivals saved. Bookmark one and it lands here.",
};

function Tag({ text, color, icon }: {
  text: string; color?: string; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Defaulted here rather than in the signature: a default parameter is evaluated before
  // the body, where the theme does not exist yet.
  const tint = color ?? th.accent;
  return (
    <View style={[styles.tag, { borderColor: tint }]}>
      {icon ? <Ionicons name={icon} size={11} color={tint} /> : null}
      <Text style={[styles.tagT, { color: tint }]}>{text}</Text>
    </View>
  );
}

function ShowRow({ s, onOpen }: { s: MyShow; onOpen: () => void }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.row} onPress={onOpen}>
      <View style={[styles.thumb, { backgroundColor: coverColor(s.headliner || s.title) }]}>
        <Text style={styles.thumbT}>{flagEmoji(s.country)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowT} numberOfLines={1}>{s.title}</Text>
        <Text style={styles.rowD} numberOfLines={1}>
          {formatDay(s.starts_at, s.timezone)}
          {s.city ? ` · ${s.city}` : ""}
        </Text>
      </View>
      {s.booked ? <Tag text="Ticket" icon="ticket-outline" />
        : s.is_suggestion ? <Tag text="Suggested" color={th.muted} /> : null}
      <Ionicons name="chevron-forward" size={16} color={th.muted} />
    </Pressable>
  );
}

function FestivalRow({ f, onOpen }: { f: Festival; onOpen: () => void }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.row} onPress={onOpen}>
      <View style={[styles.thumb, { backgroundColor: coverColor(f.name) }]}>
        <Text style={styles.thumbT}>{flagEmoji(f.country)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowT} numberOfLines={1}>{f.name}</Text>
        <Text style={styles.rowD} numberOfLines={1}>
          {f.starts_on ? formatDay(f.starts_on) : "Dates TBA"}{f.city ? ` · ${f.city}` : ""}
        </Text>
      </View>
      <Tag text="Festival" color={th.festival} />
      <Ionicons name="chevron-forward" size={16} color={th.muted} />
    </Pressable>
  );
}

export default function MyShowsView({ onClose }: { onClose: () => void }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [data, setData] = useState<MyShowsT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("interested");
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [openFestival, setOpenFestival] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getMyShows()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const counts = data?.counts ?? {};
  const byTab = useMemo(() => {
    const m: Record<string, MyShow[]> = {};
    for (const s of data?.shows ?? []) (m[s.state] ??= []).push(s);
    return m;
  }, [data]);

  // Open on the first tab that has anything, so the screen does not greet somebody with an
  // empty Interested list while four confirmed shows sit one tap away. Only on the first load
  // — after that the tab is theirs, and moving it under them would be worse than an empty tab.
  const [autoTabbed, setAutoTabbed] = useState(false);
  useEffect(() => {
    if (!data || autoTabbed) return;
    setAutoTabbed(true);
    const first = TABS.find((t) => (counts[t.key] ?? 0) > 0);
    if (first) setTab(first.key);
  }, [data, autoTabbed, counts]);

  const rows = tab === "festivals" ? [] : (byTab[tab] ?? []);
  const fests = tab === "festivals" ? (data?.festivals ?? []) : [];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={22} color={th.text} />
        </Pressable>
        <Text style={styles.title}>My shows</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.sub}>
        Everything you’ve saved, by status. Tap one to open it and book.
      </Text>

      {/* flexGrow 0: a ScrollView inside a flex column takes all the remaining height on
          web, which left a screen-deep gap above and below one row of pills. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0 }} contentContainerStyle={styles.pills}>
        {TABS.map((t) => {
          const n = counts[t.key] ?? 0;
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)}
                       style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.pillT, on && styles.pillTOn]}>
                {t.label}{n ? ` (${n})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={th.accent} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyT}>{error}</Text>
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryT}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {rows.map((s) => (
            <ShowRow key={s.id} s={s} onOpen={() => setOpenEvent(s.id)} />
          ))}
          {fests.map((f) => (
            <FestivalRow key={f.id} f={f} onOpen={() => setOpenFestival(f.id)} />
          ))}
          {!rows.length && !fests.length ? (
            <View style={styles.empty}><Text style={styles.emptyT}>{EMPTY[tab]}</Text></View>
          ) : null}
        </ScrollView>
      )}

      {/* Reloaded on close: adding a ticket or a hotel in there changes which tab this
          belongs in, and coming back to the old filing would look like the app forgot. */}
      <Modal visible={!!openEvent} animationType="slide"
             onRequestClose={() => { setOpenEvent(null); load(); }}>
        {openEvent ? (
          <EventDetailView id={openEvent} onClose={() => { setOpenEvent(null); load(); }} />
        ) : null}
      </Modal>
      <Modal visible={!!openFestival} animationType="slide"
             onRequestClose={() => { setOpenFestival(null); load(); }}>
        {openFestival ? (
          <FestivalDetailView id={openFestival}
                              onClose={() => { setOpenFestival(null); load(); }} />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  title: { color: th.text, fontSize: 17, fontWeight: "900" },
  sub: { color: th.muted, fontSize: 13, paddingHorizontal: 16, marginBottom: 12 },

  // alignItems, not just padding: a horizontal ScrollView on web stretches its children to
  // the full cross-axis height unless told otherwise, which turns these pills into columns.
  pills: { paddingHorizontal: 12, gap: 8, paddingBottom: 12, alignItems: "center" },
  pill: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.panel3,
  },
  pillOn: { backgroundColor: th.accentFill, borderColor: th.accentFill },
  pillT: { color: th.text2, fontSize: 13, fontWeight: "700" },
  pillTOn: { color: th.accentInk, fontWeight: "900" },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: th.line,
  },
  thumb: {
    width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  thumbT: { fontSize: 18 },
  rowT: { color: th.text, fontSize: 14, fontWeight: "700" },
  rowD: { color: th.muted, fontSize: 12, marginTop: 3 },

  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  tagT: { fontSize: 11, fontWeight: "800" },

  empty: { paddingHorizontal: 28, paddingTop: 44, alignItems: "center",
           maxWidth: 460, alignSelf: "center" },
  emptyT: { color: th.muted, fontSize: 13, textAlign: "center", lineHeight: 20 },
  retry: {
    marginTop: 16, backgroundColor: th.panel3, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  retryT: { color: th.text, fontSize: 13, fontWeight: "700" },
});
