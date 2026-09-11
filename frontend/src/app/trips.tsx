/**
 * The Trips tab — plan one journey across several cities.
 *
 * Where you start, when you are free, and how far you will go. The planner then picks the
 * best-rated shows that actually fit, one a day, costing each stop as the leg from wherever the
 * trip has already reached.
 *
 * Travel figures are estimates and always carry a "~". Real flights and hotels are one tap away
 * on each stop's own event page, which is also where tickets are.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { alpha, Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import CityPicker from "../components/city-picker";
import DateRangePicker from "../components/date-range-picker";
import EventDetailView from "../components/event-detail";
import TripItinerary from "../components/trip-itinerary";
import {
  City, SavedTrip, TripPlan, deleteTrip, getSavedTrips, planTrip, saveTrip,
} from "../lib/api";
import { useProfile } from "../lib/profile";


const MODES: { key: string; label: string; hint: string }[] = [
  { key: "local", label: "My city", hint: "No travel — shows where you already are." },
  { key: "regional", label: "My country", hint: "Up to about 16 hours of travel in total." },
  { key: "fly", label: "Anywhere", hint: "Up to about 60 hours — cross a border or an ocean." },
];

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function pretty(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" });
}

export default function TripsScreen() {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useProfile();
  const [origin, setOrigin] = useState<{ id: string; name: string } | null>(null);
  const [pickCity, setPickCity] = useState(false);
  const [start, setStart] = useState(iso(new Date()));
  const [end, setEnd] = useState(iso(new Date(Date.now() + 30 * 864e5)));
  const [mode, setMode] = useState("fly");
  const [pickDates, setPickDates] = useState(false);
  // Which of the two boxes was tapped — the calendar opens setting that end.
  const [pickEnd, setPickEnd] = useState<"start" | "end">("start");

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedTrip[]>([]);
  const [savedNow, setSavedNow] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  // Your home city is the obvious place to start from, so it is filled in — but it is a
  // starting point, not a fixture, and the picker is one tap away.
  useEffect(() => {
    if (!origin && profile?.home_city_id && profile.home_city_name) {
      setOrigin({ id: profile.home_city_id, name: profile.home_city_name });
    }
  }, [profile, origin]);

  const loadSaved = useCallback(() => {
    getSavedTrips().then(setSaved).catch(() => setSaved([]));
  }, []);
  useEffect(loadSaved, [loadSaved]);

  async function build() {
    if (!origin) { setPickCity(true); return; }
    setBusy(true); setError(null); setSavedNow(false);
    try {
      setPlan(await planTrip(origin.id, start, end, mode));
    } catch (e: any) {
      setError(String(e?.message || e));
      setPlan(null);
    }
    setBusy(false);
  }

  async function keep() {
    if (!plan) return;
    setBusy(true);
    try { await saveTrip(plan); setSavedNow(true); loadSaved(); }
    catch (e: any) { setError(String(e?.message || e)); }
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.badge}><Ionicons name="location" size={18} color={th.accent} /></View>
          <Text style={styles.h1}>Plan your{"\n"}concert trip</Text>
          <Text style={styles.h2}>
            One journey, the best shows across cities — tickets, stays and getting there, all in
            one place.
          </Text>
          {saved.length ? (
            <Pressable style={styles.savedLink} onPress={() => setShowSaved(true)}>
              <Ionicons name="bookmark" size={13} color={th.accent} />
              <Text style={styles.savedLinkT}>My saved trips</Text>
              <Text style={styles.savedCount}>{saved.length}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Start from</Text>
          <Pressable style={styles.field} onPress={() => setPickCity(true)}>
            <Ionicons name="location-outline" size={16} color={th.accent} />
            <Text style={[styles.fieldT, !origin && { color: th.muted }]}>
              {origin?.name || "Choose a city"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={th.muted} />
          </Pressable>

          <Text style={styles.label}>When are you free?</Text>
          {/* Two boxes rather than one combined range. The single field read as
              "1 Sep – 1 Oct" and gave no clue that the calendar behind it wanted the
              start first and the end second. */}
          <View style={styles.whenRow}>
            {([
              { key: "start" as const, label: "From", value: start },
              { key: "end" as const, label: "To", value: end },
            ]).map((f) => (
              <Pressable
                key={f.key}
                style={styles.whenField}
                onPress={() => { setPickEnd(f.key); setPickDates(true); }}
                accessibilityRole="button"
                accessibilityLabel={`${f.label}: ${pretty(f.value)}`}
              >
                <Text style={styles.whenLabel}>{f.label}</Text>
                <View style={styles.whenValueRow}>
                  <Ionicons name="calendar-outline" size={15} color={th.accent} />
                  <Text style={styles.whenValue}>{pretty(f.value)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Text style={styles.nightsLine}>
            {Math.round((new Date(end + "T12:00:00").getTime()
                       - new Date(start + "T12:00:00").getTime()) / 864e5)} nights
          </Text>

          <Text style={styles.label}>How far will you go?</Text>
          <View style={styles.seg}>
            {MODES.map((m) => (
              <Pressable key={m.key}
                         style={[styles.segCell, mode === m.key && styles.segOn]}
                         onPress={() => setMode(m.key)}>
                <Text style={[styles.segT, mode === m.key && styles.segTOn]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{MODES.find((m) => m.key === mode)?.hint}</Text>

          <Pressable style={styles.build} onPress={build} disabled={busy}>
            {busy ? <ActivityIndicator color={th.accentInk} size="small" />
                  : <><Ionicons name="sparkles" size={15} color={th.accentInk} />
                      <Text style={styles.buildT}>Build my trip</Text></>}
          </Pressable>
          {error ? <Text style={styles.err}>{error}</Text> : null}
        </View>

        {plan ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.sum}>
              {[[plan.stops.length, plan.stops.length === 1 ? "Show" : "Shows"],
                [plan.cities, plan.cities === 1 ? "City" : "Cities"],
                [`~${plan.used_hours}h`, "Travel"]].map(([v, l]) => (
                <View key={String(l)} style={styles.sumCell}>
                  <Text style={styles.sumV}>{v}</Text>
                  <Text style={styles.sumL}>{l}</Text>
                </View>
              ))}
            </View>

            {plan.stops.length ? (
              savedNow ? (
                <View style={styles.savedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={th.accent} />
                  <Text style={styles.savedRowT}>Saved to your trips</Text>
                  <Pressable onPress={() => setShowSaved(true)}>
                    <Text style={styles.savedRowView}>View</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.save} onPress={keep} disabled={busy}>
                  <Ionicons name="bookmark-outline" size={15} color={th.accent} />
                  <Text style={styles.saveT}>Save this trip</Text>
                </Pressable>
              )
            ) : null}

            <Text style={styles.section}>Your itinerary</Text>
            <TripItinerary stops={plan.stops} origin={plan.origin} onOpenEvent={setOpenEvent} />

            {plan.stops.length ? (
              <Text style={styles.note}>
                <Ionicons name="information-circle-outline" size={11} color={th.muted} /> Best-rated
                shows first, one a day, within your travel budget. Travel times are estimates —
                open a stop for real flights and hotels.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <DateRangePicker
        visible={pickDates}
        start={start}
        end={end}
        editing={pickEnd}
        onClose={() => setPickDates(false)}
        onChange={(a, b) => { setStart(a); setEnd(b); }}
      />

      <CityPicker
        visible={pickCity}
        onClose={() => setPickCity(false)}
        onSelect={(c: City) => { setOrigin({ id: c.id, name: c.name }); setPickCity(false); }}
      />

      <Modal visible={!!openEvent} animationType="slide" onRequestClose={() => setOpenEvent(null)}>
        {openEvent ? (
          <EventDetailView id={openEvent} onClose={() => setOpenEvent(null)} />
        ) : null}
      </Modal>

      <Modal visible={showSaved} animationType="slide" onRequestClose={() => setShowSaved(false)}>
        <SafeAreaView style={styles.root} edges={["top"]}>
          <View style={styles.savedHead}>
            <Pressable onPress={() => setShowSaved(false)} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={th.text} />
            </Pressable>
            <Text style={styles.savedTitle}>My trips</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {!saved.length ? (
              <View style={styles.empty}>
                <Ionicons name="bookmark-outline" size={36} color={th.muted} />
                <Text style={styles.emptyT}>No saved trips yet</Text>
                <Text style={styles.emptyS}>
                  Build a route above, then save it to come back to any time.
                </Text>
              </View>
            ) : saved.map((t) => (
              <View key={t.id} style={{ marginBottom: 26 }}>
                <View style={styles.savedTripHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedTripT}>From {t.origin || "—"}</Text>
                    <Text style={styles.savedTripS}>
                      {t.stops.length} {t.stops.length === 1 ? "show" : "shows"}
                      {t.total_travel_hours ? ` · ~${t.total_travel_hours}h travel` : ""}
                    </Text>
                  </View>
                  <Pressable hitSlop={10}
                             onPress={() => deleteTrip(t.id).then(loadSaved).catch(() => {})}>
                    <Ionicons name="trash-outline" size={18} color={th.danger} />
                  </Pressable>
                </View>
                <TripItinerary stops={t.stops} origin={t.origin || ""}
                               onOpenEvent={(id) => { setShowSaved(false); setOpenEvent(id); }} />
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  hero: { padding: 20, paddingBottom: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: th.panel2,
           alignItems: "center", justifyContent: "center", marginBottom: 12 },
  h1: { color: th.text, fontSize: 30, fontWeight: "900", lineHeight: 34, letterSpacing: -0.8 },
  h2: { color: th.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  savedLink: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14,
               alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12,
               borderRadius: 10, backgroundColor: th.panel,
               borderWidth: 1, borderColor: th.line3 },
  savedLinkT: { color: th.text2, fontSize: 13, fontWeight: "700" },
  savedCount: { color: th.accentInk, backgroundColor: th.accentFill, fontSize: 11, fontWeight: "900",
                paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: "hidden" },

  form: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  whenRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  whenField: { flex: 1, backgroundColor: th.panel, borderWidth: 1, borderColor: th.line,
               borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  whenLabel: { color: th.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  whenValueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  whenValue: { color: th.text, fontSize: 15, fontWeight: "700" },
  nightsLine: { color: th.muted, fontSize: 12.5, marginBottom: 14 },
  label: { color: th.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8,
           textTransform: "uppercase", marginTop: 14, marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13,
           paddingHorizontal: 14, borderRadius: 12, backgroundColor: th.panel,
           borderWidth: 1, borderColor: th.line3 },
  fieldT: { color: th.text, fontSize: 15, fontWeight: "600", flex: 1 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
             paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12,
             backgroundColor: th.panel, borderWidth: 1, borderColor: th.line3 },
  step: { width: 26, height: 26, borderRadius: 8, backgroundColor: th.panel2,
          alignItems: "center", justifyContent: "center" },
  dateT: { color: th.text, fontSize: 12, fontWeight: "700" },

  seg: { flexDirection: "row", backgroundColor: th.panel, borderRadius: 12, padding: 4,
         borderWidth: 1, borderColor: th.line3 },
  segCell: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segOn: { backgroundColor: th.accentFill },
  segT: { color: th.text3, fontSize: 13, fontWeight: "700" },
  segTOn: { color: th.accentInk, fontWeight: "800" },
  hint: { color: th.faint2, fontSize: 11, marginTop: 8 },

  build: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
           backgroundColor: th.accentFill, paddingVertical: 14, borderRadius: 12, marginTop: 18 },
  buildT: { color: th.accentInk, fontSize: 15, fontWeight: "800" },
  err: { color: th.dangerSoft, fontSize: 12, marginTop: 10, lineHeight: 17 },

  sum: { flexDirection: "row", gap: 10, marginTop: 22 },
  sumCell: { flex: 1, backgroundColor: th.panel, borderRadius: 12, padding: 12,
             borderWidth: 1, borderColor: th.panel3 },
  sumV: { color: th.text, fontSize: 20, fontWeight: "900" },
  sumL: { color: th.muted, fontSize: 11, marginTop: 2 },

  save: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: th.panel,
          borderWidth: 1, borderColor: th.line3 },
  saveT: { color: th.accent, fontSize: 14, fontWeight: "700" },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12,
              paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
              backgroundColor: alpha(th.success, 0.10), borderWidth: 1, borderColor: alpha(th.success, 0.32) },
  savedRowT: { color: th.success, fontSize: 13, flex: 1 },
  savedRowView: { color: th.accent, fontSize: 13, fontWeight: "700" },

  section: { color: th.text, fontSize: 17, fontWeight: "800", marginTop: 24, marginBottom: 12 },
  note: { color: th.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },

  savedHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
               paddingHorizontal: 16, paddingVertical: 12 },
  savedTitle: { color: th.text, fontSize: 18, fontWeight: "800" },
  savedTripHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  savedTripT: { color: th.text, fontSize: 15, fontWeight: "800" },
  savedTripS: { color: th.muted, fontSize: 12, marginTop: 2 },

  empty: { alignItems: "center", padding: 30, gap: 8 },
  emptyT: { color: th.text, fontSize: 16, fontWeight: "800" },
  emptyS: { color: th.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
