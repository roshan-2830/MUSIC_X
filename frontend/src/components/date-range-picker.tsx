/**
 * Picking the dates for a trip.
 *
 * Shaped like the date pickers people already know from booking sites: two boxes at the
 * top for the two ends of the range, and a calendar you scroll rather than page through.
 *
 * WHAT CHANGED AND WHY. The first version was one arrow-paged month and a single combined
 * field on the Trips screen, so choosing dates meant working out that the first tap was
 * the start and the second the end, and clicking an arrow repeatedly for anything a few
 * months out. Two labelled boxes say which end you are setting, and twelve months in one
 * scroll removes the paging entirely.
 *
 * A month grid rather than a native picker, still, for the original reason: this app runs
 * on web and on phones, and the platform pickers look and behave nothing like each other.
 *
 * Weeks start on Monday, matching the Calendar tab, so the two screens do not disagree
 * about what a week looks like.
 */
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS_AHEAD = 12;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(s + "T12:00:00");   // midday, so a timezone cannot shift the day
const short = (s: string) =>
  at(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Every cell of a month grid, padded so the 1st lands under the right weekday. */
function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;   // JS weeks start Sunday; ours start Monday
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) out.push(iso(new Date(Date.UTC(year, month, d))));
  return out;
}

type End = "start" | "end";

export default function DateRangePicker({
  visible, start, end, editing = "start", onClose, onChange, minDate,
}: {
  visible: boolean; start: string; end: string;
  /** Which box the person tapped to get here, so the calendar sets that end first. */
  editing?: End;
  onClose: () => void; onChange: (start: string, end: string) => void;
  minDate?: string;
}) {
  // Held locally until Done, so a half-made range never leaks to the screen behind.
  const [a, setA] = useState<string>(start);
  const [b, setB] = useState<string | null>(end);
  const [focus, setFocus] = useState<End>(editing);

  const floor = minDate || iso(new Date());

  const months = useMemo(() => {
    const base = at(floor);
    return Array.from({ length: MONTHS_AHEAD }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), cells: monthCells(d.getFullYear(), d.getMonth()) };
    });
  }, [floor]);

  function tap(day: string) {
    if (day < floor) return;
    if (focus === "start") {
      setA(day);
      if (b && day >= b) setB(null);   // the old end is now behind the new start
      setFocus("end");                 // move along, the way a booking form does
    } else if (day <= a) {
      // Tapping before the start means they want a different start, not a backwards range.
      setA(day);
      setB(null);
    } else {
      setB(day);
    }
  }

  const inRange = (d: string) => b !== null && d > a && d < b;
  const isEnd = (d: string) => d === a || d === b;
  const nights = b ? Math.round((at(b).getTime() - at(a).getTime()) / 864e5) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#f4f4f6" />
          </Pressable>
          <Text style={styles.title}>When are you free?</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* The two ends, side by side. Whichever is outlined is the one a tap will set —
            and tapping a box switches to it, so a mistake is one tap to fix. */}
        <View style={styles.ends}>
          {(["start", "end"] as End[]).map((which) => {
            const on = focus === which;
            const value = which === "start" ? a : b;
            return (
              <Pressable
                key={which}
                style={[styles.endBox, on && styles.endBoxOn]}
                onPress={() => setFocus(which)}
                accessibilityRole="button"
              >
                <Text style={[styles.endLabel, on && styles.endLabelOn]}>
                  {which === "start" ? "From" : "To"}
                </Text>
                <Text style={[styles.endValue, !value && styles.endValueOff]}>
                  {value ? short(value) : "Pick a day"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dow}>
          {DOW.map((l, i) => <Text key={i} style={styles.dowT}>{l}</Text>)}
        </View>

        {/* Twelve months in one scroll. Paging an arrow to reach next summer was the thing
            that made this hard to use. */}
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {months.map(({ year, month, cells }) => (
            <View key={`${year}-${month}`} style={styles.month}>
              <Text style={styles.monthName}>
                {new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </Text>
              <View style={styles.grid}>
                {cells.map((d, i) => {
                  if (!d) return <View key={`p${i}`} style={styles.cell} />;
                  const past = d < floor;
                  return (
                    <Pressable key={d} style={styles.cell} onPress={() => tap(d)} disabled={past}>
                      <View style={[styles.day, inRange(d) && styles.dayIn, isEnd(d) && styles.dayEnd]}>
                        <Text style={[
                          styles.dayT,
                          past && styles.dayPast,
                          inRange(d) && styles.dayInT,
                          isEnd(d) && styles.dayEndT,
                        ]}>
                          {Number(d.slice(8, 10))}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.foot}>
          <Text style={styles.summary}>
            {b
              ? `${short(a)} – ${short(b)}  ·  ${nights} ${nights === 1 ? "night" : "nights"}`
              : "Now pick the day you head home"}
          </Text>
          <Pressable
            style={[styles.done, !b && styles.doneOff]}
            disabled={!b}
            onPress={() => { if (b) { onChange(a, b); onClose(); } }}
          >
            <Text style={[styles.doneT, !b && styles.doneTOff]}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },

  ends: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  endBox: { flex: 1, backgroundColor: "#14141b", borderWidth: 1, borderColor: "#26262f",
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  endBoxOn: { borderColor: ACCENT },
  endLabel: { color: MUTED, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  endLabelOn: { color: ACCENT },
  endValue: { color: "#f4f4f6", fontSize: 15, fontWeight: "700", marginTop: 3 },
  endValueOff: { color: MUTED, fontWeight: "600" },

  dow: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 6,
         borderBottomWidth: 1, borderBottomColor: "#1c1c24" },
  dowT: { width: `${100 / 7}%`, textAlign: "center", color: MUTED, fontSize: 11, fontWeight: "800" },

  scroll: { paddingBottom: 8 },
  month: { paddingTop: 14 },
  monthName: { color: "#f4f4f6", fontSize: 15, fontWeight: "800", paddingHorizontal: 16,
               paddingBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  cell: { width: `${100 / 7}%`, padding: 2, alignItems: "center" },
  day: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayIn: { backgroundColor: "#1e2410" },
  dayEnd: { backgroundColor: ACCENT },
  dayT: { color: "#e6e6ee", fontSize: 14, fontWeight: "600" },
  dayPast: { color: "#3a3a44" },
  dayInT: { color: ACCENT },
  dayEndT: { color: "#101204", fontWeight: "900" },

  foot: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: "#1c1c24" },
  summary: { color: MUTED, fontSize: 13, textAlign: "center" },
  done: { backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  doneOff: { backgroundColor: "#1b1b24" },
  doneT: { color: "#101204", fontSize: 15, fontWeight: "800" },
  doneTOff: { color: "#5a5a66" },
});
