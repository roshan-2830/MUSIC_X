/**
 * The Me tab — the mockup's fifth tab, and the doorway to everything personal.
 *
 * Rows that lead somewhere real navigate. Rows for things not built yet say so plainly when
 * tapped, which is the mockup's own pattern (`__soon`) and better than either hiding them —
 * leaving no sign the feature is planned — or opening an empty screen that looks broken.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CityPicker from "../components/city-picker";
import NotificationsModal from "../components/notifications-modal";
import PassportView from "../components/passport";
import { useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  go: () => void;
  danger?: boolean;
};

export default function MeScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { profile, setHomeCity } = useProfile();
  const [passport, setPassport] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [soon, setSoon] = useState<string | null>(null);

  const notYet = useCallback((what: string) => () => {
    setSoon(what);
    setTimeout(() => setSoon(null), 2200);
  }, []);

  const name = profile?.display_name || "You";
  const city = profile?.home_city_name || "somewhere";

  const yourMusic: Row[] = [
    { icon: "calendar-outline", label: "My shows", detail: "Saved & planned concerts",
      go: () => router.push("/calendar") },
    { icon: "ticket-outline", label: "My bookings", detail: "Tickets, hotels & travel",
      go: notYet("My bookings") },
    { icon: "location-outline", label: "My trips", detail: "Routes you’ve saved",
      go: notYet("My trips") },
    { icon: "musical-notes-outline", label: "Concert Passport",
      detail: "Every show you’ve been to", go: () => setPassport(true) },
    { icon: "star-outline", label: "Bucket list", detail: "Artists to see before you die",
      go: notYet("Bucket list") },
  ];

  const settings: Row[] = [
    { icon: "location-outline", label: "Home city", detail: city,
      go: () => setCityOpen(true) },
    { icon: "options-outline", label: "Appearance", detail: "Theme & display",
      go: notYet("Appearance") },
    { icon: "notifications-outline", label: "Notifications", detail: "Alerts & reminders",
      go: () => setAlerts(true) },
    { icon: "sparkles-outline", label: "What’s coming", detail: "Our roadmap",
      go: notYet("Our roadmap") },
    { icon: "shield-checkmark-outline", label: "Our promise & privacy",
      detail: "How we handle your data", go: notYet("Our promise & privacy") },
    { icon: "chatbubble-outline", label: "Help & support", detail: "Get in touch",
      go: notYet("Help & support") },
  ];

  const RowView = (r: Row) => (
    <Pressable key={r.label} style={styles.row} onPress={r.go}>
      <View style={styles.rowIcon}>
        <Ionicons name={r.icon} size={18} color={r.danger ? "#ff6b6b" : ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowL, r.danger && { color: "#ff6b6b" }]}>{r.label}</Text>
        <Text style={styles.rowD}>{r.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarT}>{name.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.sub}>
              <Ionicons name="location" size={11} color={MUTED} /> Based in {city}
            </Text>
          </View>
        </View>

        <Text style={styles.group}>Your music</Text>
        {yourMusic.map(RowView)}

        <Text style={styles.group}>Settings</Text>
        {settings.map(RowView)}

        <Text style={styles.group}>Account</Text>
        {RowView({ icon: "log-out-outline", label: "Log out",
                   detail: "Sign out of your account", danger: true, go: signOut })}

        <Text style={styles.foot}>Music X</Text>
      </ScrollView>

      {soon ? (
        <View style={styles.toast}>
          <Text style={styles.toastT}>{soon} — coming soon</Text>
        </View>
      ) : null}

      <Modal visible={passport} animationType="slide" onRequestClose={() => setPassport(false)}>
        <PassportView onClose={() => setPassport(false)} />
      </Modal>
      <Modal visible={alerts} animationType="slide" onRequestClose={() => setAlerts(false)}>
        <NotificationsModal
          onClose={() => setAlerts(false)}
          // Tapping an alert here sends you to Home, which owns the event detail. Better than
          // opening a second copy of that screen inside a tab that is not about events.
          onOpenEvent={(id) => { setAlerts(false); router.push(`/?event=${id}`); }}
        />
      </Modal>
      {/* CityPicker is its own Modal, so it is rendered directly rather than wrapped. */}
      <CityPicker
        visible={cityOpen}
        onClose={() => setCityOpen(false)}
        onSelect={async (c) => { await setHomeCity(c.id); setCityOpen(false); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingBottom: 20 },
  avatar: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: "#1b1b24",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2b2b36",
  },
  avatarT: { color: ACCENT, fontSize: 24, fontWeight: "900" },
  name: { color: "#f4f4f6", fontSize: 22, fontWeight: "900" },
  sub: { color: MUTED, fontSize: 13, marginTop: 3 },

  group: {
    color: MUTED, fontSize: 11, fontWeight: "800", letterSpacing: 1,
    textTransform: "uppercase", marginTop: 18, marginBottom: 6, paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#16161d",
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: "#14141b",
    alignItems: "center", justifyContent: "center",
  },
  rowL: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  rowD: { color: MUTED, fontSize: 12, marginTop: 2 },
  foot: { color: "#4a4a55", fontSize: 12, textAlign: "center", marginTop: 24 },

  toast: {
    position: "absolute", left: 24, right: 24, bottom: 28,
    backgroundColor: "#23232c", borderRadius: 12, paddingVertical: 12, alignItems: "center",
  },
  toastT: { color: "#f4f4f6", fontSize: 13, fontWeight: "600" },
});
