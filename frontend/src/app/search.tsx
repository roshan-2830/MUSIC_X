import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import EventDetailView from "../components/event-detail";
import { MusicEvent, searchEvents } from "../lib/api";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

/* ---------------- small helpers ---------------- */
function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function tileHeight(id: string) {
  return [150, 196, 168, 214, 160, 182][hashNum(id) % 6];
}
function tileColor(id: string) {
  return `hsl(${hashNum(id) % 360} 42% 22%)`;
}
function countryFlag(cc: string | null) {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}
function inWhen(iso: string | null, mode: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (mode === "weekend") {
    const end = new Date(now);
    end.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
    end.setHours(23, 59, 59, 999);
    return d >= now && d <= end;
  }
  if (mode === "month") return d <= new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  if (mode === "next-month") {
    const s = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
    return d >= s && d <= end;
  }
  if (mode === "3m") {
    const end = new Date(now);
    end.setMonth(now.getMonth() + 3);
    return d <= end;
  }
  return true;
}

/* ---------------- filter option lists ---------------- */
type Opt = { value: string; label: string; short?: string };

const SORT_OPTS: Opt[] = [
  { value: "soonest", label: "Soonest first", short: "Soonest" },
  { value: "rating", label: "Highest rated", short: "Top rated" },
  { value: "price", label: "Lowest price", short: "Cheapest" },
];
const DATE_OPTS: Opt[] = [
  { value: "", label: "Any date" },
  { value: "weekend", label: "This weekend", short: "Weekend" },
  { value: "month", label: "This month", short: "This month" },
  { value: "next-month", label: "Next month", short: "Next month" },
  { value: "3m", label: "Next 3 months", short: "3 months" },
];
const RATING_OPTS: Opt[] = [
  { value: "", label: "Any rating" },
  { value: "9", label: "9.0+ · Exceptional", short: "9.0+" },
  { value: "8", label: "8.0+ · Great", short: "8.0+" },
  { value: "7", label: "7.0+ · Good", short: "7.0+" },
];
const COUNTRY_CODES = ["GB", "US", "DE", "NL", "FR", "ES", "IT", "IE", "IN", "JP", "KR", "BR", "MX", "AU", "CA"];
const COUNTRY_OPTS: Opt[] = [
  { value: "", label: "Any country" },
  ...COUNTRY_CODES.map((cc) => ({ value: cc, label: `${countryFlag(cc)}  ${cc}`, short: `${countryFlag(cc)} ${cc}` })),
];

type Filters = { sort: string; when: string; rating: string; country: string };
const EMPTY: Filters = { sort: "soonest", when: "", rating: "", country: "" };

/* ---------------- one dropdown filter (pill + bottom sheet) ---------------- */
function FilterDropdown({
  icon,
  title,
  placeholder,
  options,
  value,
  defaultValue = "",
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  placeholder: string;
  options: Opt[];
  value: string;
  defaultValue?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== "" && value !== defaultValue;
  const selected = options.find((o) => o.value === value);
  const pillText = active ? selected?.short ?? selected?.label ?? placeholder : placeholder;

  return (
    <>
      <Pressable style={[styles.pill, active && styles.pillOn]} onPress={() => setOpen(true)}>
        <Ionicons name={icon} size={14} color={active ? "#0b0b0f" : MUTED} />
        <Text style={[styles.pillText, active && styles.pillTextOn]} numberOfLines={1}>{pillText}</Text>
        <Ionicons name="chevron-down" size={13} color={active ? "#0b0b0f" : MUTED} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{title}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value || "any"}
                    style={styles.optRow}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optText, on && styles.optTextOn]}>{o.label}</Text>
                    {on ? <Ionicons name="checkmark" size={20} color={ACCENT} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ---------------- the screen ---------------- */
export default function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState<MusicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [f, setF] = useState<Filters>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function runSearch() {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      setRaw(await searchEvents(term));
    } catch (e) {
      setError(String(e));
      setRaw([]);
    } finally {
      setLoading(false);
    }
  }

  const results = useMemo(() => {
    let l = raw.slice();
    if (f.when) l = l.filter((e) => inWhen(e.starts_at, f.when));
    if (f.rating) {
      const min = Number(f.rating);
      l = l.filter((e) => e.mxs != null && e.mxs >= min);
    }
    if (f.country) l = l.filter((e) => e.country === f.country);
    if (f.sort === "rating") l.sort((a, b) => (b.mxs ?? -1) - (a.mxs ?? -1));
    else if (f.sort === "price")
      l.sort((a, b) => (a.price_from_amount ?? 9e9) - (b.price_from_amount ?? 9e9));
    else
      l.sort((a, b) => {
        const ta = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
        const tb = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
        return ta - tb;
      });
    return l;
  }, [raw, f]);

  const activeCount =
    (f.when ? 1 : 0) + (f.rating ? 1 : 0) + (f.country ? 1 : 0) + (f.sort !== "soonest" ? 1 : 0);

  // split into 2 balanced columns → masonry collage
  const cols: MusicEvent[][] = [[], []];
  const colH = [0, 0];
  for (const e of results) {
    const c = colH[0] <= colH[1] ? 0 : 1;
    cols[c].push(e);
    colH[c] += tileHeight(e.id);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* header: back + title + input */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#f4f4f6" />
          </Pressable>
          <Text style={styles.title}>Search</Text>
        </View>
        <View style={styles.searchbar}>
          <Ionicons name="search" size={18} color={MUTED} />
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={runSearch}
            returnKeyType="search"
            autoFocus
            placeholder="Try “coldplay” or “Berlin”…"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={MUTED} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* filter bar — ALWAYS visible, single scrollable row of dropdowns */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
          keyboardShouldPersistTaps="handled"
        >
          <FilterDropdown
            icon="swap-vertical" title="Sort by" placeholder="Sort" defaultValue="soonest"
            options={SORT_OPTS} value={f.sort} onChange={(v) => setF((p) => ({ ...p, sort: v }))}
          />
          <FilterDropdown
            icon="calendar-outline" title="Date" placeholder="Date"
            options={DATE_OPTS} value={f.when} onChange={(v) => setF((p) => ({ ...p, when: v }))}
          />
          <FilterDropdown
            icon="star-outline" title="Rating" placeholder="Rating"
            options={RATING_OPTS} value={f.rating} onChange={(v) => setF((p) => ({ ...p, rating: v }))}
          />
          <FilterDropdown
            icon="earth-outline" title="Country" placeholder="Country"
            options={COUNTRY_OPTS} value={f.country} onChange={(v) => setF((p) => ({ ...p, country: v }))}
          />
        </ScrollView>
        {searched && !loading ? (
          <View style={styles.metaRow}>
            <Text style={styles.count}>
              {results.length} result{results.length === 1 ? "" : "s"}
            </Text>
            {activeCount > 0 ? (
              <Pressable onPress={() => setF(EMPTY)} hitSlop={8}>
                <Text style={styles.clearText}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* body */}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={ACCENT} size="large" />
            <Text style={styles.dim}>Searching Ticketmaster…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
            <Text style={styles.errText}>Couldn’t search:{"\n"}{error}</Text>
          </View>
        ) : !searched ? (
          <View style={styles.centerBox}>
            <Ionicons name="search" size={40} color={MUTED} />
            <Text style={styles.dim}>Search live concerts</Text>
            <Text style={styles.hint}>Type an artist, city or venue and hit search.{"\n"}Set filters above to shape your results.</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="sad-outline" size={40} color={MUTED} />
            <Text style={styles.dim}>
              {raw.length > 0 ? "Nothing matches those filters" : `No results for “${q.trim()}”`}
            </Text>
            <Text style={styles.hint}>
              {raw.length > 0 ? "Try loosening a filter above." : "Try another artist, city or genre."}
            </Text>
          </View>
        ) : (
          <View style={styles.collage}>
            {cols.map((col, ci) => (
              <View key={ci} style={styles.col}>
                {col.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => setSelectedId(e.id)}
                    style={[styles.tile, { height: tileHeight(e.id), backgroundColor: tileColor(e.id) }]}
                  >
                    <View style={styles.scrim} />
                    <Text style={styles.tileMxs}>{e.mxs == null ? "—" : e.mxs.toFixed(1)}</Text>
                    <View style={styles.tileInfo}>
                      <Text style={styles.tileTitle} numberOfLines={2}>{e.title}</Text>
                      <Text style={styles.tileCity} numberOfLines={1}>
                        {countryFlag(e.country)} {e.city ?? ""}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* tap a tile → event detail */}
      <Modal visible={!!selectedId} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selectedId ? <EventDetailView id={selectedId} onClose={() => setSelectedId(null)} /> : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  header: { paddingHorizontal: 16, paddingTop: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  title: { color: "#f4f4f6", fontSize: 24, fontWeight: "800" },
  searchbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#14141b",
    borderWidth: 1,
    borderColor: "#26262f",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
  },
  input: { flex: 1, color: "#f4f4f6", fontSize: 15, padding: 0 },

  filterBar: { paddingTop: 10, borderBottomWidth: 1, borderBottomColor: "#1c1c24" },
  pillRow: { alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#14141b",
    borderWidth: 1,
    borderColor: "#26262f",
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 8,
  },
  pillOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  pillText: { color: "#d6d6de", fontSize: 13, fontWeight: "700", maxWidth: 130 },
  pillTextOn: { color: "#0b0b0f" },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  count: { color: MUTED, fontSize: 13, fontWeight: "600" },
  clearText: { color: ACCENT, fontSize: 13, fontWeight: "700" },

  /* bottom sheet */
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#14141b",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: "#26262f",
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#3a3a46", marginBottom: 12 },
  sheetTitle: { color: "#f4f4f6", fontSize: 18, fontWeight: "800", marginBottom: 6 },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1c1c24",
  },
  optText: { color: "#d6d6de", fontSize: 16, fontWeight: "600" },
  optTextOn: { color: ACCENT, fontWeight: "800" },

  body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 70 },
  dim: { color: "#f4f4f6", fontSize: 16, fontWeight: "700", marginTop: 6 },
  hint: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 19 },
  errText: { color: "#ff6b6b", fontSize: 13, textAlign: "center", marginTop: 6 },

  collage: { flexDirection: "row", gap: 12 },
  col: { flex: 1, gap: 12 },
  tile: { borderRadius: 16, overflow: "hidden", justifyContent: "flex-end", padding: 12 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.22)" },
  tileMxs: {
    position: "absolute",
    top: 10,
    left: 10,
    color: ACCENT,
    fontSize: 15,
    fontWeight: "800",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  tileInfo: { gap: 2 },
  tileTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  tileCity: { color: "#e6e6ea", fontSize: 12, fontWeight: "600" },
});
