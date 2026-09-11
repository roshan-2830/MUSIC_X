/**
 * One date, on a scrollable month calendar.
 *
 * The sibling of date-range-picker, which does two ends at once. A booking sheet needs single
 * dates — the day you fly, the day a free-cancellation window shuts — and forcing those
 * through a range picker would ask for an end nobody has.
 *
 * A month grid rather than a native picker, for the same reason as the range version: this app
 * runs on web and on phones, and the platform pickers look and behave nothing like each other.
 * Weeks start on Monday, matching the Calendar tab.
 *
 * `from` can be in the past. Somebody recording a trip they already took needs to reach last
 * month, and a picker that starts at today would make that impossible rather than merely
 * awkward.
 */
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = 14;

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Midday, so no timezone can shift the day underneath us. */
const at = (s: string) => new Date(s + "T12:00:00");

export const todayISO = () => iso(new Date());
export const shortDay = (s: string | null) =>
  s ? at(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;      // JS weeks start Sunday; ours start Monday
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) out.push(iso(new Date(Date.UTC(year, month, d))));
  return out;
}

export default function DayPicker({
  visible, value, title, from, allowClear = true, onClose, onChange,
}: {
  visible: boolean;
  value: string | null;
  title: string;
  /** First month shown. Defaults to this month; pass an earlier date to reach backwards. */
  from?: string | null;
  allowClear?: boolean;
  onClose: () => void;
  onChange: (day: string | null) => void;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [picked, setPicked] = useState<string | null>(value);

  // The modal stays mounted between openings, so without this it would reopen holding the
  // day picked for a different field last time.
  useEffect(() => { if (visible) setPicked(value); }, [visible, value]);

  // The month the value sits in, when it is earlier than `from` — otherwise editing a date
  // already set would open on a calendar that cannot show it.
  const floor = useMemo(() => {
    const base = from || todayISO();
    return value && value < base ? value : base;
  }, [from, value]);

  const months = useMemo(() => {
    const b = at(floor);
    return Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(b.getFullYear(), b.getMonth() + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), cells: monthCells(d.getFullYear(), d.getMonth()) };
    });
  }, [floor]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={th.text} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          {allowClear ? (
            <Pressable onPress={() => { onChange(null); onClose(); }} hitSlop={10}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : <View style={{ width: 40 }} />}
        </View>

        <View style={styles.dow}>
          {DOW.map((d, i) => <Text key={i} style={styles.dowT}>{d}</Text>)}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {months.map((m) => (
            <View key={`${m.year}-${m.month}`} style={{ marginBottom: 10 }}>
              <Text style={styles.month}>
                {new Date(m.year, m.month, 1).toLocaleDateString("en-GB",
                  { month: "long", year: "numeric" })}
              </Text>
              <View style={styles.grid}>
                {m.cells.map((day, i) => {
                  if (!day) return <View key={i} style={styles.cell} />;
                  const on = day === picked;
                  return (
                    <Pressable key={i} style={styles.cell} onPress={() => setPicked(day)}>
                      <View style={[styles.day, on && styles.dayOn]}>
                        <Text style={[styles.dayT, on && styles.dayTOn]}>
                          {Number(day.slice(8))}
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
          <Pressable
            style={[styles.btn, styles.footInner, !picked && styles.btnOff]}
            disabled={!picked}
            onPress={() => { onChange(picked); onClose(); }}>
            <Text style={[styles.btnT, !picked && styles.btnTOff]}>
              {picked ? `Use ${shortDay(picked)}` : "Pick a day"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: th.line2,
  },
  back: { width: 40 },
  title: { color: th.text, fontSize: 16, fontWeight: "800" },
  clear: { color: th.muted, fontSize: 13, fontWeight: "700", width: 40, textAlign: "right" },

  // Capped and centred: cells are a seventh of the width and square, so on a desktop browser
  // an uncapped grid gives 200px-tall days.
  dow: { flexDirection: "row", paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4,
         width: "100%", maxWidth: 420, alignSelf: "center" },
  dowT: { flex: 1, textAlign: "center", color: th.muted, fontSize: 11, fontWeight: "800" },

  month: {
    color: th.text, fontSize: 14, fontWeight: "800",
    paddingHorizontal: 16, marginTop: 12, marginBottom: 6,
    width: "100%", maxWidth: 420, alignSelf: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10,
          width: "100%", maxWidth: 420, alignSelf: "center" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayOn: { backgroundColor: th.accentFill },
  dayT: { color: th.text2, fontSize: 14, fontWeight: "600" },
  dayTOn: { color: th.accentInk, fontWeight: "900" },

  foot: { padding: 14, borderTopWidth: 1, borderTopColor: th.line2 },
  footInner: { width: "100%", maxWidth: 420, alignSelf: "center" },
  btn: { backgroundColor: th.accentFill, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnOff: { backgroundColor: th.panel3 },
  btnT: { color: th.accentInk, fontSize: 15, fontWeight: "900" },
  btnTOff: { color: th.muted },
});
