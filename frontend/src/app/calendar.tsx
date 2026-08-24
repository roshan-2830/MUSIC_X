import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CalendarEventCard, CalendarFestivalCard } from "../components/calendar-card";
import EventDetailView from "../components/event-detail";
import { CalendarEvent, Festival, getCalendar } from "../lib/api";
import { zonedDay, zonedTime } from "../lib/format";
import { useProfile } from "../lib/profile";
import { useSaves } from "../lib/saves";

const ACCENT = "#e8ff47";
const ACCENT_INK = "#101204";
const MUTED = "#9a9aa6";
const LINE = "#26262f";
const PANEL = "#14141b";
const PANEL2 = "#1b1b24";
const DANGER = "#ff6b6b";
const FEST = "#ffb200";

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
function dotColour(it: Item): string {
  if (it.kind === "fest") return FEST;
  const e = it.event;
  if (e.status !== "scheduled") return DANGER;
  if (e.booked) return ACCENT;
  if (e.saved) return "rgba(232,255,71,0.6)";
  return `hsl(${hashHue(e.genres[0] ?? "live")}, 72%, 62%)`;
}

export default function CalendarScreen() {
  const { profile } = useProfile();
  const { saves, savedFestivals, refresh: refreshSaves } = useSaves();
  const homeCity = profile?.home_city_name ?? null;

  const [mode, setMode] = useState<"mine" | "city">("mine");
  const [view, setView] = useState<"month" | "days">("month");
  const [monthKey, setMonthKey] = useState(monthKeyOf(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
        {/* ---------- sticky header ---------- */}
        <View style={styles.head}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
              <Text style={styles.month}>
                {view === "days" ? "Next 14 days" : MONTHS[monthDate.getMonth()]}
                {view === "month" ? <Text style={styles.year}> {monthDate.getFullYear()}</Text> : null}
              </Text>
            </View>
            {view === "month" ? (
              <View style={styles.arrows}>
                <Pressable style={styles.arrowBtn} onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month">
                  <Ionicons name="chevron-back" size={15} color="#f4f4f6" />
                </Pressable>
                <Pressable style={[styles.arrowBtn, styles.nowBtn]} onPress={goToday}>
                  <Text style={styles.nowText}>Today</Text>
                </Pressable>
                <Pressable style={styles.arrowBtn} onPress={() => shiftMonth(1)} accessibilityLabel="Next month">
                  <Ionicons name="chevron-forward" size={15} color="#f4f4f6" />
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
                  <Ionicons name={icon as any} size={13} color={mode === k ? ACCENT_INK : MUTED} />
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
              {[["Ticket", ACCENT], ["Festival", FEST], ["Off", DANGER]].map(([label, c]) => (
                <View key={label} style={styles.keyItem}>
                  <View style={[styles.keyDot, { backgroundColor: c }]} />
                  <Text style={styles.keyText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ---------- body ---------- */}
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
                  <Ionicons name="close" size={11} color={ACCENT_INK} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} />
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
                  <CalendarFestivalCard key={it.festival.id} festival={it.festival} />
                ))}
              </View>
            ))
          )}

          <View style={styles.foot}>
            <Ionicons name="checkmark-circle-outline" size={12} color={MUTED} />
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
                    <View key={k} style={[styles.dot, { backgroundColor: picked ? ACCENT_INK : dotColour(it) }]} />
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
                <View key={k} style={[styles.dot, { backgroundColor: picked ? ACCENT_INK : dotColour(it) }]} />
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
      <Ionicons name="chevron-forward" size={16} color={MUTED} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- empty states
function Empty({ mode, view, homeCity, monthName, jumpTarget, onJump, onSeeCity }: {
  mode: "mine" | "city"; view: "month" | "days"; homeCity: string | null;
  monthName: string; jumpTarget: string | null; onJump: () => void; onSeeCity: () => void;
}) {
  const where = view === "days" ? "in the next two weeks" : `in ${monthName}`;
  const jumpName = jumpTarget
    ? new Date(`${jumpTarget}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long" })
    : "";
  return (
    <View style={styles.empty}>
      <Ionicons name="calendar-outline" size={34} color={MUTED} style={{ opacity: 0.45 }} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },

  head: { backgroundColor: "rgba(11,11,15,0.97)", paddingHorizontal: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  topRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, color: MUTED },
  month: { fontSize: 27, fontWeight: "900", letterSpacing: -0.8, color: "#f4f4f6", marginTop: 2 },
  year: { color: MUTED, fontWeight: "800" },
  arrows: { flexDirection: "row", gap: 6, paddingBottom: 4 },
  arrowBtn: { minWidth: 34, height: 34, borderRadius: 11, backgroundColor: PANEL, borderWidth: 1, borderColor: LINE, alignItems: "center", justifyContent: "center" },
  nowBtn: { paddingHorizontal: 13 },
  nowText: { fontSize: 12, fontWeight: "800", color: MUTED },

  seg: { flexDirection: "row", backgroundColor: PANEL, borderWidth: 1, borderColor: LINE, borderRadius: 13, padding: 3, marginTop: 15 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10 },
  segBtnOn: { backgroundColor: ACCENT },
  segText: { fontSize: 13, fontWeight: "800", color: MUTED, flexShrink: 1 },
  segTextOn: { color: ACCENT_INK },

  dow: { flexDirection: "row", marginTop: 13, marginBottom: 2 },
  dowText: { flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2, color: MUTED },
  dowWe: { color: "rgba(232,255,71,0.6)" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, padding: 1 },
  dayBtn: { height: 41, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 4 },
  dayHas: { backgroundColor: "rgba(255,255,255,0.05)" },
  dayToday: { borderWidth: 1.5, borderColor: "rgba(232,255,71,0.5)" },
  dayPick: { backgroundColor: ACCENT, borderColor: "transparent" },
  dayNum: { fontSize: 13.5, fontWeight: "700", color: MUTED, fontVariant: ["tabular-nums"] },
  dayNumHas: { color: "#f4f4f6", fontWeight: "800" },
  dayNumToday: { color: ACCENT },
  dayNumPick: { color: ACCENT_INK },
  dots: { flexDirection: "row", gap: 3, height: 4, alignItems: "center" },
  dot: { width: 4, height: 4, borderRadius: 2 },

  strip: { gap: 6, paddingTop: 15, paddingBottom: 6 },
  sd: { width: 48, height: 66, borderRadius: 15, backgroundColor: PANEL, borderWidth: 1, borderColor: LINE, alignItems: "center", justifyContent: "center", gap: 5 },
  sdToday: { borderColor: "rgba(232,255,71,0.5)" },
  sdPick: { backgroundColor: ACCENT, borderColor: ACCENT },
  sdQuiet: { opacity: 0.42 },
  sdW: { fontSize: 9.5, fontWeight: "900", letterSpacing: 1, color: MUTED },
  sdWPick: { color: ACCENT_INK },
  sdN: { fontSize: 17, fontWeight: "800", color: "#f4f4f6", fontVariant: ["tabular-nums"] },
  sdNToday: { color: ACCENT },
  sdNPick: { color: ACCENT_INK },

  utils: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4, paddingBottom: 10 },
  vt: { flexDirection: "row", backgroundColor: PANEL2, borderWidth: 1, borderColor: LINE, borderRadius: 10, padding: 2 },
  vtBtn: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8 },
  vtBtnOn: { backgroundColor: PANEL },
  vtText: { fontSize: 11.5, fontWeight: "800", color: MUTED },
  vtTextOn: { color: "#f4f4f6" },
  key: { marginLeft: "auto", flexDirection: "row", gap: 11 },
  keyItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  keyDot: { width: 6, height: 6, borderRadius: 3 },
  keyText: { fontSize: 10, fontWeight: "800", color: MUTED },

  body: { padding: 16, paddingBottom: 28 },

  next: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 15, borderWidth: 1, borderLeftWidth: 3, padding: 13, paddingHorizontal: 15, marginBottom: 20 },
  nextNear: { backgroundColor: "rgba(232,255,71,0.08)", borderColor: "rgba(232,255,71,0.28)", borderLeftColor: ACCENT },
  nextFar: { backgroundColor: PANEL, borderColor: LINE, borderLeftColor: MUTED },
  nextC: { alignItems: "center" },
  nextN: { fontSize: 23, fontWeight: "800", color: ACCENT, letterSpacing: -0.7, fontVariant: ["tabular-nums"] },
  nextNsm: { fontSize: 19, color: "#f4f4f6" },
  nextU: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.1, color: MUTED, marginTop: 5 },
  nextD: { flex: 1, minWidth: 0 },
  nextK: { fontSize: 9.5, fontWeight: "900", letterSpacing: 1.3, color: ACCENT },
  nextKfar: { color: MUTED },
  nextT: { fontSize: 15.5, fontWeight: "800", color: "#f4f4f6", marginTop: 4 },
  nextS: { fontSize: 12, color: MUTED, marginTop: 3 },

  filterRow: { flexDirection: "row", marginBottom: 16 },
  filter: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: ACCENT, borderRadius: 999, paddingLeft: 14, paddingRight: 7, paddingVertical: 6 },
  filterText: { color: ACCENT_INK, fontSize: 12.5, fontWeight: "800" },
  filterX: { width: 21, height: 21, borderRadius: 11, backgroundColor: "rgba(16,18,4,0.18)", alignItems: "center", justifyContent: "center" },

  group: { marginBottom: 20 },
  ghead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  gdate: { fontSize: 11.5, fontWeight: "900", letterSpacing: 1, color: "#f4f4f6" },
  gline: { flex: 1, height: 1, backgroundColor: LINE },
  grel: { fontSize: 11, fontWeight: "800", color: MUTED },
  ghot: { color: ACCENT },

  empty: { alignItems: "center", paddingHorizontal: 20, paddingTop: 26, paddingBottom: 10 },
  emptyT: { fontSize: 17, fontWeight: "800", color: "#f4f4f6", marginTop: 12, textAlign: "center" },
  emptyS: { color: MUTED, fontSize: 13, marginTop: 7, textAlign: "center", lineHeight: 20, maxWidth: 272 },
  btn: { marginTop: 16, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  btnText: { color: ACCENT_INK, fontWeight: "800", fontSize: 14 },

  foot: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 6, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: LINE, marginTop: 6 },
  footText: { fontSize: 11.5, color: MUTED, lineHeight: 17, flexShrink: 1 },
});
