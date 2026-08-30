/**
 * Picking the dates for a trip.
 *
 * A month grid rather than a native picker, for one reason: this app runs on web and on phones,
 * and the platform pickers behave and look nothing like each other. A range chosen across two
 * taps is also the honest shape of the question — "when are you free" has two ends.
 *
 * Weeks start on Monday, matching the Calendar tab, so the two screens do not disagree about
 * what a week looks like.
 */
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(s + "T12:00:00");   // midday, so a timezone cannot shift the day

/** Every cell of a month grid, padded so the 1st lands under the right weekday. */
function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  // JS weeks start on Sunday; ours start on Monday.
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) out.push(iso(new Date(Date.UTC(year, month, d))));
  return out;
}

export default function DateRangePicker({
  visible, start, end, onClose, onChange, minDate,
}: {
  visible: boolean; start: string; end: string;
  onClose: () => void; onChange: (start: string, end: string) => void;
  minDate?: string;
}) {
  const [cursor, setCursor] = useState(() => at(start));
  // Held locally until Done, so a half-made range never leaks back to the screen behind.
  const [a, setA] = useState<string>(start);
  const [b, setB] = useState<string | null>(end);

  const cells = useMemo(
    () => monthCells(cursor.getFullYear(), cursor.getMonth()),
    [cursor]);
  const floor = minDate || iso(new Date());

  function tap(day: string) {
    if (day < floor) return;
    // First tap starts a new range; second tap closes it. Tapping earlier than the start
    // restarts rather than making a backwards range nobody asked for.
    if (b !== null || day < a) { setA(day); setB(null); }
    else setB(day);
  }

  const inRange = (d: string) => b !== null && d > a && d < b;
  const isEnd = (d: string) => d === a || d === b;

  const nights = b ? Math.round((at(b).getTime() - at(a).getTime()) / 864e5) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#f4f4f6" />
          </Pressable>
          <Text style={styles.title}>When are you free?</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.monthBar}>
          <Pressable hitSlop={10} style={styles.arrow}
                     onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <Ionicons name="chevron-back" size={18} color="#f4f4f6" />
          </Pressable>
          <Text style={styles.month}>
            {cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </Text>
          <Pressable hitSlop={10} style={styles.arrow}
                     onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <Ionicons name="chevron-forward" size={18} color="#f4f4f6" />
          </Pressable>
        </View>

        <View style={styles.dow}>
          {DOW.map((l, i) => <Text key={i} style={styles.dowT}>{l}</Text>)}
        </View>

        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (!d) return <View key={`p${i}`} style={styles.cell} />;
            const past = d < floor;
            return (
              <Pressable key={d} style={styles.cell} onPress={() => tap(d)} disabled={past}>
                <View style={[
                  styles.day,
                  inRange(d) && styles.dayIn,
                  isEnd(d) && styles.dayEnd,
                ]}>
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

        <View style={styles.foot}>
          <Text style={styles.summary}>
            {b
              ? `${at(a).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ` +
                `${at(b).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` +
                `  ·  ${nights} ${nights === 1 ? "night" : "nights"}`
              : "Now pick the day you head home"}
          </Text>
          <Pressable
            style={[styles.done, !b && styles.doneOff]}
            disabled={!b}
            onPress={() => { if (b) { onChange(a, b); onClose(); } }}>
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
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 16, paddingVertical: 10 },
  arrow: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#14141b",
           alignItems: "center", justifyContent: "center" },
  month: { color: "#f4f4f6", fontSize: 16, fontWeight: "800" },
  dow: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 4 },
  dowT: { width: `${100 / 7}%`, textAlign: "center", color: MUTED, fontSize: 11,
          fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  cell: { width: `${100 / 7}%`, padding: 2, alignItems: "center" },
  day: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayIn: { backgroundColor: "#1e2410" },
  dayEnd: { backgroundColor: ACCENT },
  dayT: { color: "#e6e6ee", fontSize: 14, fontWeight: "600" },
  dayPast: { color: "#3a3a44" },
  dayInT: { color: ACCENT },
  dayEndT: { color: "#101204", fontWeight: "900" },

  foot: { marginTop: "auto", padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: "#1c1c24" },
  summary: { color: MUTED, fontSize: 13, textAlign: "center" },
  done: { backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  doneOff: { backgroundColor: "#1b1b24" },
  doneT: { color: "#101204", fontSize: 15, fontWeight: "800" },
  doneTOff: { color: "#5a5a66" },
});
