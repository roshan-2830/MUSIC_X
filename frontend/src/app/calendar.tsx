import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { alpha, Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import { CalendarEventCard, CalendarFestivalCard } from "../components/calendar-card";
import FestivalDetailView from "../components/festival-detail";
import EventDetailView from "../components/event-detail";
import { CalendarEvent, Festival, getCalendar } from "../lib/api";
import { zonedDay, zonedTime } from "../lib/format";
import { useProfile } from "../lib/profile";
import { useSaves } from "../lib/saves";


const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---- dates, all in local time so "today" means the user's today ----
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const isoOf = (d: Date) => iso(d.getFullYear(), d.getMonth(), d.getDate());
const monthKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const midnight = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (isoDay: string) =>
  Math.round((new Date(`${isoDay}T12:00:00`).getTime() - midnight().getTime() - 432e5) / 864e5);

/** "Today" / "in 4 days" / "3 days ago" — and nothing at all past a month, where a day
 *  count stops being something anyone can picture. */
function relLabel(isoDay: string): string {
  const n = daysBetween(isoDay);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 0) return n <= 30 ? `in ${n} days` : "";
  return n >= -30 ? `${-n} days ago` : "";
}
const isSoon = (isoDay: string) => { const n = daysBetween(isoDay); return n >= 0 && n <= 7; };

// Stable colour per genre, so the same music is the same colour every month.
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

type Item =
  | { kind: "event"; day: string; event: CalendarEvent }
  | { kind: "fest"; day: string; endDay: string; festival: Festival };

/** One dot per thing on a day. The meaning is kept deliberately narrow: you have a
 *  ticket, it's yours, it's a festival, it's off — or it's just live music. */
// Takes the theme as an argument: a module-level helper cannot call a hook, and this one
// has to answer in whichever theme is live.
function dotColour(it: Item, th: Theme): string {
  if (it.kind === "fest") return th.festival;
  const e = it.event;
  if (e.status !== "scheduled") return th.danger;
  if (e.booked) return th.accent;
  if (e.saved) return th.accentTint60;
  return `hsl(${hashHue(e.genres[0] ?? "live")}, 72%, 62%)`;
}

export default function CalendarScreen() {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useProfile();
  const { saves, savedFestivals, refresh: refreshSaves } = useSaves();
  const homeCity = profile?.home_city_name ?? null;

  const [mode, setMode] = useState<"mine" | "city">("mine");
  const [view, setView] = useState<"month" | "days">("month");
  const [monthKey, setMonthKey] = useState(monthKeyOf(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedFest, setSelectedFest] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ events: CalendarEvent[]; festivals: Festival[] }>({
    events: [], festivals: [],
  });
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [probed, setProbed] = useState(false);

  const monthDate = useMemo(() => new Date(`${monthKey}-01T12:00:00`), [monthKey]);

  // The window the current view is asking about.
  const range = useMemo(() => {
    if (view === "days") {
      const from = midnight();
      return { start: isoOf(from), end: isoOf(addDays(from, 13)) };
    }
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    return { start: iso(y, m, 1), end: iso(y, m, new Date(y, m + 1, 0).getDate()) };
  }, [view, monthDate]);

  // Ask for a day either side of it. The server filters on a UTC timestamp while the
  // agenda groups by the venue's own day, so a late show in Los Angeles can fall outside
  // the window by the server's reckoning and inside it by the user's. Fetching wide and
  // trimming below by the zoned day keeps the grid and the agenda showing the same set —
  // otherwise the list holds a date the grid has no cell for.
  const fetchRange = useMemo(() => ({
    start: isoOf(addDays(new Date(`${range.start}T12:00:00`), -1)),
    end: isoOf(addDays(new Date(`${range.end}T12:00:00`), 1)),
  }), [range.start, range.end]);

  // Saving something changes more than one bookmark: the eyebrow's split, the card's tag
  // and the colour of its dot are all derived server-side from what is saved. Refetch on
  // any change so the header, the grid and the card can never contradict each other.
  const savesKey = saves.length + savedFestivals.length;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCalendar(mode, fetchRange.start, fetchRange.end)
      .then((d) => { if (alive) setPayload(d); })
      .catch(() => { if (alive) setPayload({ events: [], festivals: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, fetchRange.start, fetchRange.end, savesKey]);

  const items = useMemo<Item[]>(() => {
    const evs: Item[] = payload.events
      .filter((e) => e.starts_at)
      .map((e) => ({ kind: "event" as const, day: zonedDay(e.starts_at!, e.timezone), event: e }));
    const fests: Item[] = payload.festivals
      .filter((f) => f.starts_on)
      .map((f) => ({
        kind: "fest" as const,
        // A festival that began before this window is still on NOW, so it files under the
        // first day on screen rather than its own start date — otherwise a festival you
        // could walk into today reads as "4 days ago".
        day: f.starts_on! < range.start ? range.start : f.starts_on!,
        endDay: f.ends_on ?? f.starts_on!,
        festival: f,
      }));
    // Trim back to the window actually on screen, by the day each thing happens on.
    return [...evs, ...fests].filter((it) =>
      it.kind === "fest"
        ? it.endDay >= range.start && it.day <= range.end
        : it.day >= range.start && it.day <= range.end
    );
  }, [payload, range.start, range.end]);

  // Land where the content is: an empty month is a dead end, so offer the next one that
  // isn't. Only probed once, and only when the month really is empty.
  useEffect(() => {
    if (loading || items.length || probed || view !== "month") return;
    setProbed(true);
    const from = midnight();
    getCalendar(mode, isoOf(from), isoOf(addDays(from, 365)))
      .then((d) => {
        const keys = [
          ...d.events.filter((e) => e.starts_at).map((e) => monthKeyOf(new Date(e.starts_at!))),
          ...d.festivals.filter((f) => f.starts_on).map((f) => f.starts_on!.slice(0, 7)),
        ].filter((k) => k > monthKey).sort();
        setJumpTarget(keys[0] ?? null);
      })
      .catch(() => setJumpTarget(null));
  }, [loading, items.length, probed, view, mode, monthKey]);

  const shiftMonth = useCallback((n: number) => {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() + n);
    setMonthKey(monthKeyOf(d));
    setSelected(null);
    setProbed(false);
    setJumpTarget(null);
  }, [monthDate]);

  const goToday = useCallback(() => {
    setMonthKey(monthKeyOf(new Date()));
    setSelected(null);
    setView("month");
    setProbed(false);
  }, []);

  const changeMode = useCallback((m: "mine" | "city") => {
    setMode(m); setSelected(null); setProbed(false); setJumpTarget(null);
  }, []);

  const changeView = useCallback((v: "month" | "days") => {
    setView(v); setSelected(null);
    // The strip is always "now", so there is nothing to jump to; coming back to the
    // month view re-arms the probe so an empty month can still offer a way out.
    setProbed(v === "days");
    setJumpTarget(null);
  }, []);

  // ---- which days have something on them ----
  const byDay = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const it of items) {
      if (it.kind === "fest") {
        // A festival occupies every day it runs, so the grid shows the whole block.
        const s = new Date(`${it.day}T12:00:00`), e = new Date(`${it.endDay}T12:00:00`);
        for (let c = new Date(s); c <= e; c = addDays(c, 1)) (map[isoOf(c)] ??= []).push(it);
      } else {
        (map[it.day] ??= []).push(it);
      }
    }
    return map;
  }, [items]);

  // ---- up next: the question this page really gets asked ----
  const upNext = useMemo(() => {
    const now = Date.now();
    const next = saves
      .filter((e) => e.starts_at && new Date(e.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0];
    if (!next) return null;
    const days = daysBetween(zonedDay(next.starts_at!, next.timezone));
    return days > 90 ? null : { event: next, days };
  }, [saves]);

  // ---- the agenda, grouped by day ----
  const groups = useMemo(() => {
    const list = selected
      ? items.filter((it) => it.kind === "fest"
        ? selected >= it.day && selected <= it.endDay
        : it.day === selected)
      : items;
    const g: Record<string, Item[]> = {};
    for (const it of list) (g[selected ?? it.day] ??= []).push(it);
    return Object.keys(g).sort().map((day) => ({
      day,
      rows: g[day].sort((a, b) => {
        const at = a.kind === "fest" ? "00:00" : zonedTime(a.event.starts_at!, a.event.timezone);
        const bt = b.kind === "fest" ? "00:00" : zonedTime(b.event.starts_at!, b.event.timezone);
        return at.localeCompare(bt);
      }),
    }));
  }, [items, selected]);

  const total = items.length;
  const festCount = items.filter((i) => i.kind === "fest").length;
  const ticketCount = payload.events.filter((e) => e.booked).length;

  // Everything in this scope is saved now, so the eyebrow no longer has to explain a
  // split between "yours" and "an artist you follow" — it counts commitments and says how
  // many are actually paid for, which is the next question a plan gets asked.
  const eyebrow = total === 0
    ? "Nothing saved"
    : mode === "mine"
      ? `${total} saved · ${ticketCount ? `${ticketCount} with tickets` : "none booked yet"}`
      : `${total - festCount ? `${total - festCount} in ${homeCity ?? "your city"}` : "no local shows"}` +
        `${festCount ? ` · ${festCount} festival${festCount > 1 ? "s" : ""}` : ""}`;
  
  
  // ---- the calendar gets out of the way while you read the list ----
  // It floats above the agenda rather than being a sticky child, because a sticky child
  // cannot move: stickyHeaderIndices pinned all ~420px of month grid to the top and left
  // the list two cards of room. The height is measured, never guessed — the month grid is
  // six rows tall and the 14-day strip is one, so any constant is wrong half the time.
  const [headH, setHeadH] = useState(0);
  const headY = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);
  const isHidden = useRef(false);

  const slideHead = useCallback((hide: boolean) => {
    if (isHidden.current === hide) return;     // already there — don't restart the animation
    isHidden.current = hide;
    Animated.timing(headY, {
      toValue: hide ? -headH : 0,
      duration: 190,
      // There is no native driver on web, and this same screen runs there.
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [headY, headH]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    // The 5px deadzone is load-bearing: without it a finger that is holding still
    // still jitters by a pixel or two and the header flickers.
    if (y <= 0) slideHead(false);                                // at the top, always shown
    else if (dy > 5 && headH > 0 && y > headH) slideHead(true);  // reading down: get out of the way
    else if (dy < -5) slideHead(false);                          // reading back up: come straight back
  }, [slideHead, headH]);

  // Month ↔ 14 days changes the header's height, and a translateY of the *old* height
  // would leave it parked half off-screen. Reset whenever the layout changes under it.
  useEffect(() => { slideHead(false); }, [monthKey, mode, view, slideHead]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* ---------- the calendar: floats over the list, slides away as you read ---------- */}
      <Animated.View
        style={[styles.head, styles.headFloat, { transform: [{ translateY: headY }] }]}
        onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}
      >
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
              {/* One line, always. "September 2026" at 27pt measures ~219pt and a 390pt
                  phone leaves ~175pt next to the month controls, so this used to break
                  across two lines mid-word — "Septe / mber". adjustsFontSizeToFit shrinks
                  it to fit instead, down to 18pt, which is still the biggest thing on the
                  header. Shrinking beats truncating here: "Septemb…" is worse than a
                  slightly smaller September. */}
              <Text
                style={styles.month}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.66}
              >
                {view === "days" ? "Next 14 days" : MONTHS[monthDate.getMonth()]}
                {view === "month" ? <Text style={styles.year}> {monthDate.getFullYear()}</Text> : null}
              </Text>
            </View>
            {view === "month" ? (
              <View style={styles.arrows}>
                {/* The month NAME beside each chevron. A bare "chevron-back" is the same
                    icon this app uses for "leave this screen" on every other page, so on
                    the Calendar it read as a way out rather than a step back in time.
                    Naming the month it goes to removes the ambiguity and says where you
                    are heading, which a chevron alone never did. */}
                <Pressable style={styles.arrowBtn} onPress={() => shiftMonth(-1)}
                           accessibilityLabel={`${MONTHS[(monthDate.getMonth() + 11) % 12]}, the previous month`}>
                  <Ionicons name="chevron-back" size={13} color={th.muted} />
                  <Text style={styles.monthStep}>{MON_SHORT[(monthDate.getMonth() + 11) % 12]}</Text>
                </Pressable>
                <Pressable style={[styles.arrowBtn, styles.nowBtn]} onPress={goToday}>
                  <Text style={styles.nowText}>Today</Text>
                </Pressable>
                <Pressable style={styles.arrowBtn} onPress={() => shiftMonth(1)}
                           accessibilityLabel={`${MONTHS[(monthDate.getMonth() + 1) % 12]}, the next month`}>
                  <Text style={styles.monthStep}>{MON_SHORT[(monthDate.getMonth() + 1) % 12]}</Text>
                  <Ionicons name="chevron-forward" size={13} color={th.muted} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.arrows}>
                <Pressable style={[styles.arrowBtn, styles.nowBtn]} onPress={() => changeView("month")}>
                  <Text style={styles.nowText}>Full month</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* scope */}
          <View style={styles.seg}>
            {([["mine", "bookmark", "Saved"], ["city", "location", `All in ${homeCity ?? "your city"}`]] as const)
              .map(([k, icon, label]) => (
                <Pressable
                  key={k}
                  style={[styles.segBtn, mode === k && styles.segBtnOn]}
                  onPress={() => changeMode(k as "mine" | "city")}
                >
                  <Ionicons name={icon as any} size={13} color={mode === k ? th.accentInk : th.muted} />
                  <Text style={[styles.segText, mode === k && styles.segTextOn]} numberOfLines={1}>{label}</Text>
                </Pressable>
              ))}
          </View>

          {view === "month" ? (
            <MonthGrid monthDate={monthDate} byDay={byDay} selected={selected} onPick={setSelected} />
          ) : (
            <DayStrip byDay={byDay} selected={selected} onPick={setSelected} />
          )}

          {/* view toggle + what the colours mean */}
          <View style={styles.utils}>
            <View style={styles.vt}>
              {(["month", "days"] as const).map((v) => (
                <Pressable key={v} style={[styles.vtBtn, view === v && styles.vtBtnOn]} onPress={() => changeView(v)}>
                  <Text style={[styles.vtText, view === v && styles.vtTextOn]}>
                    {v === "month" ? "Month" : "14 days"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.key}>
              {[["Ticket", th.accent], ["Festival", th.festival], ["Off", th.danger]].map(([label, c]) => (
                <View key={label} style={styles.keyItem}>
                  <View style={[styles.keyDot, { backgroundColor: c }]} />
                  <Text style={styles.keyText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
         </Animated.View>

      {/* ---------- body: gets the whole screen; the calendar floats over it ---------- */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: headH }}
      >
        <View style={styles.body}>
          {!selected && upNext ? <UpNext {...upNext} onPress={() => setDetailId(upNext.event.id)} /> : null}

          {selected ? (
            <View style={styles.filterRow}>
              <View style={styles.filter}>
                <Text style={styles.filterText}>
                  {new Date(`${selected}T12:00:00`).toLocaleDateString("en-GB",
                    { weekday: "long", day: "numeric", month: "long" })}
                </Text>
                <Pressable style={styles.filterX} onPress={() => setSelected(null)} accessibilityLabel="Show the whole month">
                  <Ionicons name="close" size={11} color={th.accentInk} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={th.accent} style={{ marginTop: 30 }} />
          ) : groups.length === 0 ? (
            <Empty
              mode={mode} view={view} homeCity={homeCity}
              monthName={MONTHS[monthDate.getMonth()]}
              jumpTarget={jumpTarget}
              onJump={() => { if (jumpTarget) { setMonthKey(jumpTarget); setSelected(null); setJumpTarget(null); } }}
              onSeeCity={() => changeMode("city")}
            />
          ) : (
            groups.map(({ day, rows }) => (
              <View key={day} style={styles.group}>
                {!selected ? (
                  <View style={styles.ghead}>
                    <Text style={styles.gdate}>
                      {new Date(`${day}T12:00:00`).toLocaleDateString("en-GB",
                        { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}
                    </Text>
                    <View style={styles.gline} />
                    <Text style={[styles.grel, isSoon(day) && styles.ghot]}>{relLabel(day)}</Text>
                  </View>
                ) : null}
                {rows.map((it) => it.kind === "event" ? (
                  <CalendarEventCard key={it.event.id} event={it.event} onPress={() => setDetailId(it.event.id)} />
                ) : (
                  <CalendarFestivalCard key={it.festival.id} festival={it.festival} onPress={() => setSelectedFest(it.festival.id)} />
                ))}
              </View>
            ))
          )}

          <View style={styles.foot}>
            <Ionicons name="checkmark-circle-outline" size={12} color={th.muted} />
            <Text style={styles.footText}>
              Cancelled and postponed shows stay on your calendar — we never quietly drop them.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!detailId} animationType="slide" onRequestClose={() => setDetailId(null)}>
        {detailId ? (
          <EventDetailView id={detailId} onClose={() => { setDetailId(null); refreshSaves(); }} />
        ) : null}
      </Modal>
      <Modal visible={!!selectedFest} animationType="slide" onRequestClose={() => setSelectedFest(null)}>
        {selectedFest ? <FestivalDetailView id={selectedFest} onClose={() => setSelectedFest(null)} /> : null}
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- month grid
function MonthGrid({ monthDate, byDay, selected, onPick }: {
  monthDate: Date;
  byDay: Record<string, Item[]>;
  selected: string | null;
  onPick: (d: string | null) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;   // Monday-first
  const today = isoOf(new Date());

  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <>
      <View style={styles.dow}>
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
          <Text key={i} style={[styles.dowText, i > 4 && styles.dowWe]}>{l}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((n, i) => {
          if (n == null) return <View key={i} style={styles.cell} />;
          const day = iso(y, m, n);
          const on = byDay[day] ?? [];
          const picked = selected === day;
          return (
            <View key={i} style={styles.cell}>
              <Pressable
                style={[styles.dayBtn, on.length > 0 && styles.dayHas, day === today && styles.dayToday, picked && styles.dayPick]}
                onPress={() => on.length ? onPick(picked ? null : day) : undefined}
                accessibilityLabel={`${n}, ${on.length ? `${on.length} show${on.length > 1 ? "s" : ""}` : "nothing on"}`}
              >
                <Text style={[
                  styles.dayNum,
                  on.length > 0 && styles.dayNumHas,
                  day === today && !picked && styles.dayNumToday,
                  picked && styles.dayNumPick,
                ]}>{n}</Text>
                <View style={styles.dots}>
                  {on.slice(0, 3).map((it, k) => (
                    <View key={k} style={[styles.dot, { backgroundColor: picked ? th.accentInk : dotColour(it, th) }]} />
                  ))}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </>
  );
}

// ---------------------------------------------------------------- 14-day strip
function DayStrip({ byDay, selected, onPick }: {
  byDay: Record<string, Item[]>;
  selected: string | null;
  onPick: (d: string | null) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const base = midnight();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {Array.from({ length: 14 }, (_, i) => {
        const c = addDays(base, i);
        const day = isoOf(c);
        const on = byDay[day] ?? [];
        const picked = selected === day;
        return (
          <Pressable
            key={day}
            style={[styles.sd, i === 0 && styles.sdToday, picked && styles.sdPick, !on.length && styles.sdQuiet]}
            onPress={() => on.length ? onPick(picked ? null : day) : undefined}
          >
            <Text style={[styles.sdW, picked && styles.sdWPick]}>{DOW_SHORT[c.getDay()][0]}</Text>
            <Text style={[styles.sdN, i === 0 && !picked && styles.sdNToday, picked && styles.sdNPick]}>
              {c.getDate()}
            </Text>
            <View style={styles.dots}>
              {on.slice(0, 3).map((it, k) => (
                <View key={k} style={[styles.dot, { backgroundColor: picked ? th.accentInk : dotColour(it, th) }]} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- up next
function UpNext({ event, days, onPress }: { event: any; days: number; onPress: () => void }) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  // A countdown only earns a big number when the number means something. Inside two
  // weeks: count down. Beyond that: just state the date.
  const near = days <= 14;
  const day = zonedDay(event.starts_at, event.timezone);      // YYYY-MM-DD, venue's zone
  const dayNum = Number(day.slice(8, 10));
  const monIdx = Number(day.slice(5, 7)) - 1;
  return (
    <Pressable style={[styles.next, near ? styles.nextNear : styles.nextFar]} onPress={onPress}>
      <View style={styles.nextC}>
        <Text style={[styles.nextN, !near && styles.nextNsm]}>
          {near ? (days === 0 ? "NOW" : days) : dayNum}
        </Text>
        <Text style={styles.nextU}>
          {near ? (days === 0 ? "DOORS TODAY" : days === 1 ? "DAY TO GO" : "DAYS TO GO")
                : MON_SHORT[monIdx].toUpperCase()}
        </Text>
      </View>
      <View style={styles.nextD}>
        <Text style={[styles.nextK, !near && styles.nextKfar]}>{near ? "UP NEXT" : "YOUR NEXT SHOW"}</Text>
        <Text style={styles.nextT} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.nextS} numberOfLines={1}>
          {event.venue_name ?? "Venue TBA"}{event.city ? `, ${event.city}` : ""} · {zonedTime(event.starts_at, event.timezone)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={th.muted} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- empty states
function Empty({ mode, view, homeCity, monthName, jumpTarget, onJump, onSeeCity }: {
  mode: "mine" | "city"; view: "month" | "days"; homeCity: string | null;
  monthName: string; jumpTarget: string | null; onJump: () => void; onSeeCity: () => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const where = view === "days" ? "in the next two weeks" : `in ${monthName}`;
  const jumpName = jumpTarget
    ? new Date(`${jumpTarget}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long" })
    : "";
  return (
    <View style={styles.empty}>
      <Ionicons name="calendar-outline" size={34} color={th.muted} style={{ opacity: 0.45 }} />
      <Text style={styles.emptyT}>
        {mode === "mine" ? `Nothing saved ${where}` : `No shows in ${homeCity ?? "your city"} ${where}`}
      </Text>
      <Text style={styles.emptyS}>
        {mode === "mine"
          // Names the one action that fills this page. It used to say "follow an artist or
          // save a show", which stopped being true when this scope became saved-only —
          // following now changes Home, not here, and copy that promises otherwise sends
          // someone off to follow ten artists and come back to the same empty month.
          ? "Tap the bookmark on any concert or festival and it lands here."
          : "Try another month, or change your city from the home screen."}
      </Text>
      {jumpTarget ? (
        <Pressable style={styles.btn} onPress={onJump}>
          <Text style={styles.btnText}>Jump to {jumpName}</Text>
        </Pressable>
      ) : mode === "mine" && homeCity ? (
        <Pressable style={styles.btn} onPress={onSeeCity}>
          <Text style={styles.btnText}>See what&apos;s on in {homeCity}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: th.bg },

   // Solid, not 97%: the agenda now slides *underneath* this, and at 0.97 you can read
  // the ghost of a card through the month grid.
  head: { backgroundColor: th.bg, paddingHorizontal: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: th.line },
  headFloat: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5 },
  topRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, color: th.muted },
  month: { fontSize: 27, fontWeight: "900", letterSpacing: -0.8, color: th.text, marginTop: 2 },
  year: { color: th.muted, fontWeight: "800" },
  arrows: { flexShrink: 0, flexDirection: "row", gap: 6, paddingBottom: 4 },
  arrowBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1,
    minWidth: 34, height: 34, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line,
  },
  // 11pt rather than 12: naming the month is worth ~34pt of the header, and the title is
  // what someone is actually reading.
  monthStep: { color: th.text2, fontSize: 11, fontWeight: "800" },
  nowBtn: { paddingHorizontal: 13 },
  nowText: { fontSize: 12, fontWeight: "800", color: th.muted },

  seg: { flexDirection: "row", backgroundColor: th.panel, borderWidth: 1, borderColor: th.line, borderRadius: 13, padding: 3, marginTop: 15 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10 },
  segBtnOn: { backgroundColor: th.accentFill },
  segText: { fontSize: 13, fontWeight: "800", color: th.muted, flexShrink: 1 },
  segTextOn: { color: th.accentInk },

  dow: { flexDirection: "row", marginTop: 13, marginBottom: 2 },
  dowText: { flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2, color: th.muted },
  dowWe: { color: alpha(th.accent, 0.6) },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, padding: 1 },
  dayBtn: { height: 41, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 4 },
  dayHas: { backgroundColor: alpha(th.text, 0.05) },
  dayToday: { borderWidth: 1.5, borderColor: alpha(th.accent, 0.5) },
  dayPick: { backgroundColor: th.accentFill, borderColor: "transparent" },
  dayNum: { fontSize: 13.5, fontWeight: "700", color: th.muted, fontVariant: ["tabular-nums"] },
  dayNumHas: { color: th.text, fontWeight: "800" },
  dayNumToday: { color: th.accent },
  dayNumPick: { color: th.accentInk },
  dots: { flexDirection: "row", gap: 3, height: 4, alignItems: "center" },
  dot: { width: 4, height: 4, borderRadius: 2 },

  strip: { gap: 6, paddingTop: 15, paddingBottom: 6 },
  sd: { width: 48, height: 66, borderRadius: 15, backgroundColor: th.panel, borderWidth: 1, borderColor: th.line, alignItems: "center", justifyContent: "center", gap: 5 },
  sdToday: { borderColor: alpha(th.accent, 0.5) },
  sdPick: { backgroundColor: th.accentFill, borderColor: th.accentFill },
  sdQuiet: { opacity: 0.42 },
  sdW: { fontSize: 9.5, fontWeight: "900", letterSpacing: 1, color: th.muted },
  sdWPick: { color: th.accentInk },
  sdN: { fontSize: 17, fontWeight: "800", color: th.text, fontVariant: ["tabular-nums"] },
  sdNToday: { color: th.accent },
  sdNPick: { color: th.accentInk },

  utils: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4, paddingBottom: 10 },
  vt: { flexDirection: "row", backgroundColor: th.panel2, borderWidth: 1, borderColor: th.line, borderRadius: 10, padding: 2 },
  vtBtn: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8 },
  vtBtnOn: { backgroundColor: th.panel },
  vtText: { fontSize: 11.5, fontWeight: "800", color: th.muted },
  vtTextOn: { color: th.text },
  key: { marginLeft: "auto", flexDirection: "row", gap: 11 },
  keyItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  keyDot: { width: 6, height: 6, borderRadius: 3 },
  keyText: { fontSize: 10, fontWeight: "800", color: th.muted },

  body: { padding: 16, paddingBottom: 28 },

  next: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 15, borderWidth: 1, borderLeftWidth: 3, padding: 13, paddingHorizontal: 15, marginBottom: 20 },
  nextNear: { backgroundColor: alpha(th.accent, 0.08), borderColor: alpha(th.accent, 0.28), borderLeftColor: th.accentFill },
  nextFar: { backgroundColor: th.panel, borderColor: th.line, borderLeftColor: th.muted },
  nextC: { alignItems: "center" },
  nextN: { fontSize: 23, fontWeight: "800", color: th.accent, letterSpacing: -0.7, fontVariant: ["tabular-nums"] },
  nextNsm: { fontSize: 19, color: th.text },
  nextU: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.1, color: th.muted, marginTop: 5 },
  nextD: { flex: 1, minWidth: 0 },
  nextK: { fontSize: 9.5, fontWeight: "900", letterSpacing: 1.3, color: th.accent },
  nextKfar: { color: th.muted },
  nextT: { fontSize: 15.5, fontWeight: "800", color: th.text, marginTop: 4 },
  nextS: { fontSize: 12, color: th.muted, marginTop: 3 },

  filterRow: { flexDirection: "row", marginBottom: 16 },
  filter: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: th.accentFill, borderRadius: 999, paddingLeft: 14, paddingRight: 7, paddingVertical: 6 },
  filterText: { color: th.accentInk, fontSize: 12.5, fontWeight: "800" },
  filterX: { width: 21, height: 21, borderRadius: 11, backgroundColor: alpha(th.accentInk, 0.18), alignItems: "center", justifyContent: "center" },

  group: { marginBottom: 20 },
  ghead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  gdate: { fontSize: 11.5, fontWeight: "900", letterSpacing: 1, color: th.text },
  gline: { flex: 1, height: 1, backgroundColor: th.line },
  grel: { fontSize: 11, fontWeight: "800", color: th.muted },
  ghot: { color: th.accent },

  empty: { alignItems: "center", paddingHorizontal: 20, paddingTop: 26, paddingBottom: 10 },
  emptyT: { fontSize: 17, fontWeight: "800", color: th.text, marginTop: 12, textAlign: "center" },
  emptyS: { color: th.muted, fontSize: 13, marginTop: 7, textAlign: "center", lineHeight: 20, maxWidth: 272 },
  btn: { marginTop: 16, backgroundColor: th.accentFill, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  btnText: { color: th.accentInk, fontWeight: "800", fontSize: 14 },

  foot: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 6, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: th.line, marginTop: 6 },
  footText: { fontSize: 11.5, color: th.muted, lineHeight: 17, flexShrink: 1 },
});
