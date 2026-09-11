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

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import AppearanceView from "../components/appearance";
import WishlistView from "../components/wishlist";
import CityPicker from "../components/city-picker";
import MyBookingsView from "../components/my-bookings";
import MyShowsView from "../components/my-shows";
import NotificationsModal from "../components/notifications-modal";
import PassportView from "../components/passport";
import SetlistfmLinkView from "../components/setlistfm-link";
import { useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { useToast } from "../lib/toast";


type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  go: () => void;
  danger?: boolean;
};

export default function MeScreen() {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { signOut } = useAuth();
  const { profile, setHomeCity } = useProfile();
  const [passport, setPassport] = useState(false);
  const [shows, setShows] = useState(false);
  const [bookings, setBookings] = useState(false);
  const [setlistfm, setSetlistfm] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [wishlist, setWishlist] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  // One toast in the app, not two. This screen had its own — the mockup's `__soon` pattern —
  // and a second pill with its own timing and styling would have drifted from the one the
  // heart and the bookmark now use.
  const { show } = useToast();
  const notYet = useCallback((what: string) => () => {
    show(`${what} — coming soon`);
  }, [show]);

  const name = profile?.display_name || "You";
  const city = profile?.home_city_name || "somewhere";

  const yourMusic: Row[] = [
    // NOT the Calendar tab. The Calendar answers "what is on between these two dates";
    // this answers "what have I committed to, and how far along is each one" — and a show
    // three months out is invisible on this month's grid while belonging here all the same.
    { icon: "calendar-outline", label: "My shows", detail: "Saved & planned concerts",
      go: () => setShows(true) },
    { icon: "ticket-outline", label: "My bookings", detail: "Tickets, hotels & travel",
      go: () => setBookings(true) },
    { icon: "location-outline", label: "My trips", detail: "Routes you’ve saved",
      go: notYet("My trips") },
    { icon: "musical-notes-outline", label: "Concert Passport",
      detail: "Every show you’ve been to", go: () => setPassport(true) },
    // "Wishlist", not "Bucket list" — the user's word as of 2026-09-09. The table behind
    // it is still `bucket_list`, and the phase-2 mockup still says Bucket list; this is a
    // deliberate divergence, not an oversight.
    { icon: "heart-outline", label: "Wishlist", detail: "Acts you want to see live",
      go: () => setWishlist(true) },
  ];

  const settings: Row[] = [
    { icon: "location-outline", label: "Home city", detail: city,
      go: () => setCityOpen(true) },
    { icon: "options-outline", label: "Appearance", detail: "Light, dark or your device",
      go: () => setAppearance(true) },
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
        <Ionicons name={r.icon} size={18} color={r.danger ? th.danger : th.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowL, r.danger && { color: th.danger }]}>{r.label}</Text>
        <Text style={styles.rowD}>{r.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={th.muted} />
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
              <Ionicons name="location" size={11} color={th.muted} /> Based in {city}
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


      <Modal visible={shows} animationType="slide" onRequestClose={() => setShows(false)}>
        <MyShowsView onClose={() => setShows(false)} />
      </Modal>
      <Modal visible={bookings} animationType="slide" onRequestClose={() => setBookings(false)}>
        {/* The home city seeds the "From" box on a travel leg — most people leave from
            home, and typing it every time is a question the app can already answer. */}
        <MyBookingsView onClose={() => setBookings(false)}
                        homeCity={profile?.home_city_name ?? null} />
      </Modal>
      <Modal visible={passport} animationType="slide" onRequestClose={() => setPassport(false)}>
        <PassportView onClose={() => setPassport(false)}
                      onImport={() => { setPassport(false); setSetlistfm(true); }} />
      </Modal>
      <Modal visible={setlistfm} animationType="slide" onRequestClose={() => setSetlistfm(false)}>
        <SetlistfmLinkView onClose={() => setSetlistfm(false)} />
      </Modal>
      <Modal visible={wishlist} animationType="slide" onRequestClose={() => setWishlist(false)}>
        {wishlist ? (
          <WishlistView
            onClose={() => setWishlist(false)}
            onOpenEvent={(id) => { setWishlist(false); router.push(`/?event=${id}`); }}
          />
        ) : null}
      </Modal>
      <Modal visible={appearance} animationType="slide" onRequestClose={() => setAppearance(false)}>
        {appearance ? <AppearanceView onClose={() => setAppearance(false)} /> : null}
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

const makeStyles = (th: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.bg },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingBottom: 20 },
  avatar: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: th.panel2,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: th.line3,
  },
  avatarT: { color: th.accent, fontSize: 24, fontWeight: "900" },
  name: { color: th.text, fontSize: 22, fontWeight: "900" },
  sub: { color: th.muted, fontSize: 13, marginTop: 3 },

  group: {
    color: th.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1,
    textTransform: "uppercase", marginTop: 18, marginBottom: 6, paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: th.panel,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: th.panel,
    alignItems: "center", justifyContent: "center",
  },
  rowL: { color: th.text, fontSize: 15, fontWeight: "700" },
  rowD: { color: th.muted, fontSize: 12, marginTop: 2 },
  foot: { color: th.outline2, fontSize: 12, textAlign: "center", marginTop: 24 },

});
