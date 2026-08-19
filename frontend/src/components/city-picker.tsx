import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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

import {
  City,
  CitySuggestion,
  CityWithShows,
  resolveCity,
  searchCitiesWithShows,
  searchGlobalCities,
} from "../lib/api";
import { detectCurrentCity } from "../lib/location";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

function countryFlag(cc: string) {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

export default function CityPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (city: City) => void;
}) {
  const [q, setQ] = useState("");
  const [appCities, setAppCities] = useState<CityWithShows[]>([]);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const query = q.trim();
    if (query.length < 2) {
      setAppCities([]);
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      Promise.all([
        searchCitiesWithShows(query).catch(() => []),
        searchGlobalCities(query).catch(() => []),
      ])
        .then(([app, global]) => {
          setAppCities(app);
          setSuggestions(global);
        })
        .finally(() => setLoading(false));
    }, 350); // debounce (Nominatim politeness)
    return () => clearTimeout(t);
  }, [q, visible]);

  async function pickGlobal(s: CitySuggestion) {
    try {
      onSelect(await resolveCity(s));
    } catch {
      setMsg("Couldn’t set that city — try again.");
    }
  }

  async function useLocation() {
    setLocating(true);
    setMsg(null);
    const city = await detectCurrentCity();
    setLocating(false);
    if (city) onSelect(city);
    else setMsg("Couldn’t get your location — search for your city instead.");
  }

  const query = q.trim();
  // Hide worldwide results that duplicate an app city we already show above.
  const appKeys = new Set(appCities.map((c) => `${c.name.toLowerCase()}|${c.country}`));
  const otherCities = suggestions.filter((s) => !appKeys.has(`${s.name.toLowerCase()}|${s.country}`));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Your city</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={MUTED} />
            </Pressable>
          </View>

          <Pressable style={styles.locBtn} onPress={useLocation} disabled={locating}>
            {locating ? (
              <ActivityIndicator color={ACCENT} size="small" />
            ) : (
              <Ionicons name="navigate" size={16} color={ACCENT} />
            )}
            <Text style={styles.locText}>{locating ? "Finding you…" : "Use my current location"}</Text>
          </Pressable>

          <View style={styles.searchbar}>
            <Ionicons name="search" size={18} color={MUTED} />
            <TextInput
              style={styles.input}
              value={q}
              onChangeText={setQ}
              placeholder="Search any city — London, Bangalore…"
              placeholderTextColor={MUTED}
              autoFocus
              autoCorrect={false}
            />
          </View>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
          ) : query.length < 2 ? (
            <Text style={styles.empty}>Type your city name to find shows near you.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {appCities.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.row}
                  onPress={() => onSelect({ id: c.id, name: c.name, country: c.country })}
                >
                  <Text style={styles.rowText}>{countryFlag(c.country)}  {c.name}</Text>
                  <View style={styles.showsBadge}>
                    <Text style={styles.showsBadgeText}>
                      {c.show_count} show{c.show_count === 1 ? "" : "s"}
                    </Text>
                  </View>
                </Pressable>
              ))}

              {otherCities.length > 0 ? (
                <Text style={styles.groupLabel}>Other cities · no shows yet</Text>
              ) : null}
              {otherCities.map((s) => (
                <Pressable key={`${s.name}-${s.country}`} style={styles.row} onPress={() => pickGlobal(s)}>
                  <Text style={styles.rowText}>{countryFlag(s.country)}  {s.name}</Text>
                  <Text style={styles.rowCountry}>{s.country}</Text>
                </Pressable>
              ))}

              {appCities.length === 0 && otherCities.length === 0 ? (
                <Text style={styles.empty}>No cities match “{query}”.</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#14141b",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderColor: "#26262f",
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#3a3a46", marginBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  locBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1b1b24", borderColor: "#26262f", borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 },
  locText: { color: ACCENT, fontSize: 14, fontWeight: "700" },
  searchbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0b0b0f",
    borderWidth: 1,
    borderColor: "#26262f",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 8,
  },
  input: { flex: 1, color: "#f4f4f6", fontSize: 15, padding: 0 },
  msg: { color: MUTED, fontSize: 12, marginBottom: 6, paddingHorizontal: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1c1c24",
  },
  rowText: { color: "#f4f4f6", fontSize: 16, fontWeight: "600" },
  rowCountry: { color: MUTED, fontSize: 13, fontWeight: "600" },
  showsBadge: { backgroundColor: "rgba(232,255,71,0.14)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  showsBadgeText: { color: ACCENT, fontSize: 12, fontWeight: "800" },
  groupLabel: { color: MUTED, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 16, marginBottom: 2, paddingHorizontal: 2 },
  empty: { color: MUTED, fontSize: 14, textAlign: "center", paddingVertical: 24, lineHeight: 20 },
});
