import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CityPicker from "../components/city-picker";
import EventCard from "../components/event-card";
import EventDetailView from "../components/event-detail";
import EventHCard from "../components/event-hcard";
import FestivalCard from "../components/festival-card";
import FestivalDetailView from "../components/festival-detail";
import ArtistDetail from "../components/artist-detail";
import ArtistsRow from "../components/artists-row";
import LastfmConnect from "../components/lastfm-connect";
import NotificationBell from "../components/notification-bell";
import NotificationsModal from "../components/notifications-modal";
import SearchBar from "../components/search-bar";
import { City, Festival, fetchEvents, getFestivals, getRecommended, MusicEvent, RecommendedEvent } from "../lib/api";
import { useAuth } from "../lib/auth";
import { detectCurrentCity } from "../lib/location";
import { useProfile } from "../lib/profile";
import { usePush } from "../hooks/use-push";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

// Two shows by the same act is plenty for one row — otherwise a three-night stand at
// the top of the ratings takes a quarter of the row and nine other artists never appear.
// We only have the title to go on, so key off the part before ":" or " - ", which is
// where the act's name sits in Ticketmaster titles.
function actKey(title: string): string {
  return (title || "")
    // the headliner sits before the tour name, the support act, or the presenter —
    // without the "w/" case, "Muse - The Wow! Signal Tour" and "Muse w/ Portugal the
    // Man" count as two different acts and Muse takes three of the twelve cards.
    .split(/[:\-–|]| w\/ | with | feat\.? | featuring /i)[0]
    .trim()
    .toLowerCase()
    .slice(0, 28);
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "the US", GB: "the UK", IN: "India", AU: "Australia", CA: "Canada",
  DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
  IE: "Ireland", TR: "Türkiye", MX: "Mexico", BR: "Brazil", JP: "Japan",
  SG: "Singapore", PL: "Poland", FI: "Finland", BE: "Belgium", SE: "Sweden",
};
const countryName = (cc: string | null) => (cc ? COUNTRY_NAMES[cc] ?? cc : "");

/** One card per artist, for the twelve-wide shelves.
 *
 *  A shelf's job is breadth. Sorting purely by rating handed the "Highest rated" row to
 *  three acts: measured 2026-08-24, the top 15 worldwide were 6 Foo Fighters dates, 4 The
 *  Weeknd and 4 Eric Clapton — one answer printed six times, and you can only go to one of
 *  them. Nothing is hidden: "See all" opens the unfiltered list, where the city and date
 *  filters are the right tools for choosing between dates of one tour, and the artist page
 *  lists their whole run.
 *
 *  Grouped by `headliner_artist_id`, never by title. Ticketmaster bills the same six-date
 *  run as "Foo Fighters: TAKE COVER TOUR 2026" and "FOO FIGHTERS - TAKE COVER TOUR 2026",
 *  so title matching would read one tour as two artists. Events with no headliner (TBA) are
 *  each kept — we do not know them to be the same act, and assuming they are would hide
 *  real shows. */
function onePerArtist(list: MusicEvent[]): MusicEvent[] {
  const seen = new Set<string>();
  const out: MusicEvent[] = [];
  for (const e of list) {
    const key = e.headliner_artist_id;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(e);
  }
  return out;
}

export default function HomeScreen() {
  const { signOut } = useAuth();
  const { profile, setHomeCity } = useProfile();
  const router = useRouter();
  const [events, setEvents] = useState<MusicEvent[]>([]);
  // Fetched separately from `events`. The rated list only holds the ~600 shows we could
  // score, so re-sorting it by date can never surface an unscored local gig tomorrow.
  const [soonest, setSoonest] = useState<MusicEvent[]>([]);
  const [inCity, setInCity] = useState<MusicEvent[]>([]);
  const [inCountry, setInCountry] = useState<MusicEvent[]>([]);
  const [recommended, setRecommended] = useState<RecommendedEvent[]>([]);
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFest, setSelectedFest] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [artistName, setArtistName] = useState<string | null>(null);
  // bumped when the manage-artists screen closes, so the row re-reads the follows
  const [followsKey, setFollowsKey] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  // bumping this re-checks the unread badge (after the inbox is closed)
  const [badgeKey, setBadgeKey] = useState(0);
  const [triedLocate, setTriedLocate] = useState(false);

  // Register this phone for notifications, and open the right show when one is tapped.
  // Home is where a tap lands because this is the screen that owns the detail modal — and a
  // reminder that drops you on a list you then have to search is barely a reminder at all.
  usePush(setSelectedId);

  // the global catalogue (loaded once)
  useEffect(() => {
    fetchEvents("mxs", 200).then(setEvents).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, []);

  // What is genuinely happening next, rating or no rating.
  useEffect(() => {
    fetchEvents("date", 200).then(setSoonest).catch(() => setSoonest([]));
  }, []);

  // Recommended is derived from who they follow, so it has to move when the follow list
  // does — following someone on the Search screen should change this row, not just the
  // artists row. Refreshed on focus for the same reason: Home never unmounts.
  useFocusEffect(
    useCallback(() => {
      getRecommended().then(setRecommended).catch(() => {});
    }, [])
  );

  // upcoming festivals (loaded once)
  useEffect(() => {
    getFestivals(100).then(setFestivals).catch(() => setFestivals([]));
  }, []);

  // region rows — reload whenever the user's home city / country changes
  useEffect(() => {
    const cityId = profile?.home_city_id ?? null;
    const country = profile?.home_city_country ?? null;
    if (cityId) fetchEvents("date", 30, cityId).then(setInCity).catch(() => setInCity([]));
    else setInCity([]);
    if (country) fetchEvents("date", 30, undefined, country).then(setInCountry).catch(() => setInCountry([]));
    else setInCountry([]);
  }, [profile?.home_city_id, profile?.home_city_country]);

  // First-time GPS auto-detect: no home city yet → ask for location, set nearest city.
  useEffect(() => {
    if (profile && !profile.home_city_id && !triedLocate) {
      setTriedLocate(true);
      detectCurrentCity().then((city) => {
        if (city) setHomeCity(city.id);
      });
    }
  }, [profile, triedLocate, setHomeCity]);

  async function selectCity(city: City) {
    setPickerOpen(false);
    try {
      await setHomeCity(city.id);
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={ACCENT} size="large" /></View>;
  if (error) return <View style={styles.center}><Text style={styles.error}>Couldn’t load:{"\n"}{error}</Text></View>;

  const city = profile?.home_city_name ?? null;
  const country = profile?.home_city_country ?? null;
  const cityLabel = city ?? "Set your city";
  // "Coming up soon" row: the best of the next 7 days. Rated shows lead, then we keep
  // filling with the soonest so the row is never thin — only ~20 of the 300-odd shows in
  // any given week carry a rating, so rated-only would show the same handful every day.
  const comingUp = useMemo(() => {
    const weekEnd = Date.now() + 7 * 864e5;
    const within = (e: MusicEvent) =>
      !!e.starts_at && new Date(e.starts_at).getTime() <= weekEnd;

    // Both lists are needed. `soonest` is capped at 200 and on a busy day those 200 are
    // all TODAY, so on its own it yields almost no rated shows (measured: 3 of 200).
    // `events` is the rating-sorted list, which is where the week's big shows actually
    // live. Merged and de-duped, we get the strong ones AND full coverage of the week.
    const merged = new Map<string, MusicEvent>();
    for (const e of [...events, ...soonest]) if (within(e)) merged.set(e.id, e);
    const pool = merged.size ? [...merged.values()] : soonest;
    const rated = pool.filter((e) => e.mxs != null).sort((a, b) => (b.mxs ?? 0) - (a.mxs ?? 0));
    const unrated = pool.filter((e) => e.mxs == null);

    const out: MusicEvent[] = [];
    const perAct: Record<string, number> = {};
    for (const e of [...rated, ...unrated]) {
      const key = actKey(e.title);
      perAct[key] = (perAct[key] ?? 0) + 1;
      if (perAct[key] <= 2) out.push(e);
      if (out.length >= 12) break;
    }
    return out;
  }, [events, soonest]);

  // Balanced row: at most 2 shows per artist/genre, so every followed act appears
  // (otherwise one prolific artist floods the row and buries the rest).
  const recommendedRow: RecommendedEvent[] = [];
  const perLabel: Record<string, number> = {};
  for (const e of recommended) {
    perLabel[e.reason_label] = (perLabel[e.reason_label] ?? 0) + 1;
    if (perLabel[e.reason_label] <= 2) recommendedRow.push(e);
    if (recommendedRow.length >= 12) break;
  }

  // Every "See all" goes to the Search page carrying which list it came from, the way
  // the festivals row already did. One screen owns browsing, so the filters, sort and
  // search bar are the same wherever you arrived from — instead of six one-off modals.
  function openFeed(feed: string, label: string, extra: Record<string, string> = {}) {
    router.push({ pathname: "/search", params: { feed, label, ...extra } });
  }

  function Section({
    title, sub, data, feed, extra,
  }: {
    title: string; sub?: string; data: MusicEvent[]; feed: string;
    extra?: Record<string, string>;
  }) {
    if (!data.length) return null;
    return (
      <View style={styles.section}>
        <View style={styles.rowHead}>
          <Text style={styles.rowHeadTitle}>{title}</Text>
          <Pressable onPress={() => openFeed(feed, title, extra)} hitSlop={8} style={styles.viewAll}>
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="arrow-forward" size={13} color={ACCENT} />
          </Pressable>
        </View>
        {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
          {onePerArtist(data).slice(0, 12).map((e) => (
            <EventHCard key={e.id} event={e} onPress={() => setSelectedId(e.id)} />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>MUSIC<Text style={styles.accent}>X</Text></Text>
          <Pressable style={styles.cityBtn} onPress={() => setPickerOpen(true)}>
            <Ionicons name="location-sharp" size={14} color={ACCENT} />
            <Text style={styles.cityText}>{cityLabel}</Text>
            <Ionicons name="chevron-forward" size={13} color={MUTED} />
          </Pressable>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell refreshKey={badgeKey} onPress={() => setAlertsOpen(true)} />
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push({ pathname: "/search", params: { type: "artists" } })}>
            <Ionicons name="musical-notes" size={20} color={ACCENT} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color="#f4f4f6" />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={events.slice(0, 10)}
        keyExtractor={(e) => e.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <View style={{ paddingHorizontal: 16 }}>
              <SearchBar />
            </View>
            <ArtistsRow
              refreshKey={followsKey}
              onOpenArtist={setArtistName}
              onSeeAll={() => router.push({ pathname: "/search", params: { type: "artists" } })}
              onAdd={() =>
                router.push({ pathname: "/search", params: { type: "artists", focus: "1" } })
              }
            />
            <LastfmConnect
              onChanged={() => {
                setFollowsKey((k) => k + 1);
                getRecommended().then(setRecommended).catch(() => {});
              }}
            />
            {recommended.length ? (
              <View style={styles.section}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowHeadTitle}>Recommended for you</Text>
                  {recommended.length > recommendedRow.length ? (
                    <Pressable
                      onPress={() => openFeed("recommended", "Recommended for you")}
                      hitSlop={8}
                    >
                      <Text style={styles.seeAll}>See all</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.sectionSub}>Based on the artists and genres you love</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
                  {recommendedRow.map((e) => (
                    <EventHCard
                      key={e.id}
                      event={e}
                      reasonLabel={e.reason_label}
                      reasonKind={e.reason_kind}
                      onPress={() => setSelectedId(e.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {city ? (
              inCity.length ? (
                <Section title={`In ${city}`} sub="Shows near you" data={inCity}
                  feed="city" extra={profile?.home_city_id ? { city_id: profile.home_city_id } : {}} />
              ) : (
                <View style={styles.emptyCity}>
                  <Text style={styles.sectionTitle}>In {city}</Text>
                  <Text style={styles.emptyCityText}>
                    No shows in {city} yet — here’s what’s happening worldwide 🌍
                  </Text>
                </View>
              )
            ) : null}
            {country ? (
              <Section
                title={`In ${countryName(country)}`}
                sub="Shows you can book from home"
                data={inCountry}
              feed="country" extra={country ? { country } : {}}
              />
            ) : null}
            {/* MXS is OUR rating (artist stature, venue, rarity) — it is not a measure of
                what is selling or what is popular right now, so it must not say "trending". */}
            <Section title="Highest rated" sub="Ranked by our MXS rating, worldwide"
              data={events} feed="rated" />
            <Section title="Coming up soon" sub="The next 7 days, best first"
              data={comingUp} feed="soon" />
            {festivals.length ? (
              <View style={styles.section}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowHeadTitle}>Upcoming festivals</Text>
                  <Pressable
                    onPress={() => router.push({ pathname: "/search", params: { type: "festivals" } })}
                    hitSlop={8}
                    style={styles.viewAll}
                  >
                    <Text style={styles.seeAll}>View All</Text>
                    <Ionicons name="arrow-forward" size={13} color={ACCENT} />
                  </Pressable>
                </View>
                <Text style={styles.sectionSub}>Multi-day trips worth planning around</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
                  {festivals.slice(0, 12).map((f) => (
                    <FestivalCard key={f.id} festival={f} onPress={() => setSelectedFest(f.id)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={[styles.rowHead, { marginTop: 22, marginBottom: 10 }]}>
              <Text style={styles.rowHeadTitle}>All events</Text>
              {events.length > 10 ? (
                <Pressable onPress={() => openFeed("all", "All concerts")} hitSlop={8}>
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <EventCard event={item} onPress={() => setSelectedId(item.id)} />
          </View>
        )}
      />

      <Modal visible={!!selectedFest} animationType="slide" onRequestClose={() => setSelectedFest(null)}>

        {selectedFest ? <FestivalDetailView id={selectedFest} onClose={() => setSelectedFest(null)} /> : null}

      </Modal>

      <Modal visible={!!selectedId} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selectedId ? <EventDetailView id={selectedId} onClose={() => setSelectedId(null)} /> : null}
      </Modal>
      <CityPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectCity} />
      <Modal
        visible={alertsOpen}
        animationType="slide"
        onRequestClose={() => {
          setAlertsOpen(false);
          setBadgeKey((k) => k + 1);
        }}>
        <NotificationsModal
          onClose={() => {
            setAlertsOpen(false);
            setBadgeKey((k) => k + 1);
          }}
          onOpenEvent={(id) => setSelectedId(id)}
        />
      </Modal>

      <Modal visible={!!artistName} animationType="slide" onRequestClose={() => setArtistName(null)}>
        {artistName ? (
          <ArtistDetail
            name={artistName}
            onClose={() => { setArtistName(null); setFollowsKey((k) => k + 1); }}
            onSelectEvent={(id) => { setArtistName(null); setSelectedId(id); }}
            onSelectFestival={(id) => { setArtistName(null); setSelectedFest(id); }}
          />
        ) : null}
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  center: { flex: 1, backgroundColor: "#0b0b0f", alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerActions: { flexDirection: "row", gap: 8 },
  logo: { color: "#f4f4f6", fontSize: 24, fontWeight: "800", letterSpacing: 1 },
  accent: { color: ACCENT },
  cityBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  cityText: { color: "#f4f4f6", fontSize: 13, fontWeight: "600" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#14141b", alignItems: "center", justifyContent: "center" },
  section: { marginTop: 18 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 16 },
  rowHeadTitle: { color: "#f4f4f6", fontSize: 19, fontWeight: "800" },
  seeAll: { color: ACCENT, fontSize: 13, fontWeight: "700" },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  emptyCity: { marginTop: 18, paddingHorizontal: 16 },
  emptyCityText: { color: MUTED, fontSize: 14, marginTop: 6, lineHeight: 20 },
  sectionTitle: { color: "#f4f4f6", fontSize: 19, fontWeight: "800", paddingHorizontal: 16 },
  sectionSub: { color: MUTED, fontSize: 13, paddingHorizontal: 16, marginTop: 2, marginBottom: 10 },
  hscroll: { paddingHorizontal: 16, paddingTop: 2 },
  error: { color: "#ff6b6b", fontSize: 14, textAlign: "center" },
});
