import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { alpha, Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";

import ArtistDetail from "../components/artist-detail";
import EventDetailView from "../components/event-detail";
import FestivalDetailView from "../components/festival-detail";
import WishlistHeart from "../components/wishlist-heart";
import DateRangePicker from "../components/date-range-picker";
import {
  ArtistSearchResult,
  Festival,
  fetchEvents,
  followArtist,
  FollowedArtist,
  getFestivals,
  getFollows,
  getRecommended,
  MusicEvent,
  searchAll,
  SearchAllResults,
  SearchFilters,
  searchArtists,
  searchEvents,
  searchFestivalsLive,
  unfollowArtist,
} from "../lib/api";
import { audienceLine } from "../lib/format";

// The dropdown's fixed width, shared by its style and the clamp that keeps it on screen,
// so the two cannot drift and let a menu slide off the edge.
const MENU_WIDTH = 232;

/* ---------------- small helpers ---------------- */
function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function tileColor(id: string) {
  return `hsl(${hashNum(id) % 360} 42% 22%)`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso: string | null) {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function fmtRange(s: string | null, e: string | null) {
  if (!s) return "Dates TBA";
  const sd = new Date(s);
  const start = `${MONTHS[sd.getMonth()]} ${sd.getDate()}`;
  if (!e) return start;
  const ed = new Date(e);
  if (sd.getMonth() === ed.getMonth()) return `${MONTHS[sd.getMonth()]} ${sd.getDate()}–${ed.getDate()}`;
  return `${start} – ${MONTHS[ed.getMonth()]} ${ed.getDate()}`;
}
function countryFlag(cc: string | null) {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

const FEED_LABELS: Record<string, string> = {
  recommended: "Recommended for you",
  rated: "Top rated",
  soon: "On soon",
  city: "In your city",
  country: "Around the country",
};

/** One act as this screen lists it, from either of the two places acts come from.
 *
 *  `via` is the honest label for WHY it is on screen, and the three values are three
 *  different claims:
 *    name    — our catalogue has an act by this name
 *    lineup  — our catalogue has them on a bill the term matched (searching "Wembley"
 *              finds Megadeth because Megadeth plays there, not because of their name)
 *    deezer  — nobody by that name is in our catalogue; Deezer's global one has them.
 *              Followable, but we hold no dates, so it must never claim any.
 */
type Person = {
  key: string;
  name: string;
  image_url: string | null;
  deezer_id: number | null;
  fans: number | null;
  upcoming_events: number;
  upcoming_festivals: number;
  via: "name" | "lineup" | "deezer";
};

const NO_RESULTS: SearchAllResults = { artists: [], events: [], festivals: [], applied: [] };

/* ---------------- the filter panel's options ----------------
   `count` names the field in the server's counts payload, so each option can say how many
   matching CONCERTS it would leave. Options without a count key have none to show: the
   server counts concerts, and "in my city" or "only acts I follow" would need their own
   aggregate each. Nothing shows a made-up number. */
type Opt = { value: string; label: string; count?: keyof NonNullable<SearchAllResults["counts"]> };

const WHEN_OPTS: Opt[] = [
  { value: "today", label: "Today", count: "today" },
  { value: "tomorrow", label: "Tomorrow", count: "tomorrow" },
  { value: "weekend", label: "This weekend", count: "weekend" },
  { value: "d7", label: "Next 7 days", count: "d7" },
  { value: "month", label: "This month", count: "month" },
  { value: "m3", label: "Next 3 months", count: "m3" },
  { value: "custom", label: "Pick exact dates…" },
];
const ONSALE_OPTS: Opt[] = [
  { value: "now", label: "On sale now", count: "onsale_now" },
  { value: "coming", label: "Coming on sale", count: "onsale_coming" },
];
const RATING_OPTS: Opt[] = [
  { value: "8", label: "Top rated · 8.0+", count: "rating_8" },
  { value: "7", label: "Highly rated · 7.0+", count: "rating_7" },
];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The label a pill wears. Unset it names the filter; set it names the ANSWER — so the row
 *  states what is on, and no second chip row underneath has to repeat it. */
function pillLabel(group: Group, f: SearchFilters): string {
  const v = group.valueOf(f);
  if (!v) return group.label;
  if (group.key === "when" && v === "custom") {
    return f.from ? (f.to && f.to !== f.from ? `${f.from} → ${f.to}` : f.from) : "Dates";
  }
  return (group.opts.find((o) => o.value === v)?.label ?? group.label).replace("…", "");
}

type Group = {
  key: "when" | "onsale" | "rating";
  label: string;
  opts: Opt[];
  note?: string;
  valueOf: (f: SearchFilters) => string | null;
  pick: (f: SearchFilters, value: string) => SearchFilters;
};

/** What clearing a pill resets. `when` owns the exact-date range too, so its × must drop
 *  from/to as well or the server would keep filtering by a range with no pill showing. */
const CLEARED: Record<Group["key"], Partial<SearchFilters>> = {
  when: { when: null, from: null, to: null },
  onsale: { onsale: null },
  rating: { rating: null },
};

const GROUPS: Group[] = [
  {
    key: "when", label: "When", opts: WHEN_OPTS,
    valueOf: (f) => f.when ?? null,
    // Choosing a preset clears any exact range, and vice versa — they answer the same
    // question and holding both would send the server two contradictory windows.
    pick: (f, v) => ({ ...f, when: f.when === v ? null : (v as any), from: null, to: null }),
  },
  {
    key: "onsale", label: "Tickets", opts: ONSALE_OPTS,
    note: "Applies to concerts — festivals publish no on-sale date.",
    valueOf: (f) => f.onsale ?? null,
    pick: (f, v) => ({ ...f, onsale: f.onsale === v ? null : (v as any) }),
  },
  {
    key: "rating", label: "Rating", opts: RATING_OPTS,
    valueOf: (f) => (f.rating ? String(f.rating) : null),
    pick: (f, v) => ({ ...f, rating: f.rating === Number(v) ? null : Number(v) }),
  },
];

export default function SearchScreen() {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{
    type?: string; feed?: string; label?: string; city_id?: string; country?: string;
    focus?: string;
  }>();
  // held in state, not read straight from the params, so the chip can be cleared
  const [feed, setFeed] = useState(params.feed ?? "");
  const feedLabel = params.label || FEED_LABELS[params.feed ?? ""] || "";

  const [q, setQ] = useState("");
  const [raw, setRaw] = useState<MusicEvent[]>([]);           // the browse feed
  const [festBrowse, setFestBrowse] = useState<Festival[]>([]);
  const [myArtists, setMyArtists] = useState<FollowedArtist[]>([]);
  // NOT a tab and not selectable — it only reflects which Home row was tapped. The three
  // links that used to preselect a tab (the artists row's "See all", the same row's search
  // shortcut, the festivals row's "View All") would otherwise land on a list of concerts,
  // which answers a question nobody asked.
  const browseKind = params.type === "festivals" ? "festivals"
    : params.type === "artists" ? "artists" : "concerts";
  const [res, setRes] = useState<SearchAllResults>(NO_RESULTS);
  const [people, setPeople] = useState<Person[]>([]);
  const [followed, setFollowed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedFest, setSelectedFest] = useState<string | null>(null);

  // Filters persist until cleared, which is what people expect of a funnel — and the chip
  // row below the box keeps that visible, so nobody stares at three results wondering why.
  // They reset on leaving the screen: state, not a store, on purpose.
  const [filters, setFilters] = useState<SearchFilters>({});
  const [rangeOpen, setRangeOpen] = useState(false);
  // Which pill's dropdown is open, and where each pill sits so its menu can be anchored
  // under it. Measured rather than guessed: the pills are as wide as their labels, and a
  // label changes the moment you pick something ("When" becomes "Next 3 months").
  const [menu, setMenu] = useState<Group["key"] | null>(null);
  const pillX = useRef<Record<string, number>>({});
  // How far the pill row has been slid. Held in state, not a ref, because an open menu has
  // to travel with its own pill: onLayout reports x within the row's CONTENT, so the moment
  // the row scrolls, content-x and screen-x stop agreeing.
  const [pillScroll, setPillScroll] = useState(0);
  const { width: winW } = useWindowDimensions();
  const menuLeft = useMemo(() => {
    const x = (menu ? pillX.current[menu] ?? 0 : 0) - pillScroll;
    // Kept on screen at both ends: a menu hanging off the left edge is unreachable, and one
    // off the right gets its counts clipped.
    return Math.max(0, Math.min(x, Math.max(0, winW - 32 - MENU_WIDTH)));
  }, [menu, pillScroll, winW]);
  const counts = res.counts ?? null;

  async function loadBrowse(which: string = feed) {
    setLoading(true); setError(null); setBrowsing(true);
    setRes(NO_RESULTS); setPeople([]);
    try {
      const sort = filters.sort === "rating" ? "mxs" : "date";
      if (which === "recommended") setRaw(await getRecommended(200, filters));
      else if (which === "rated") setRaw(await fetchEvents("mxs", 200, undefined, undefined, filters));
      else if (which === "city" && params.city_id)
        setRaw(await fetchEvents(sort, 200, params.city_id, undefined, filters));
      else if (which === "country" && params.country)
        setRaw(await fetchEvents(sort, 200, undefined, params.country, filters));
      else if (browseKind === "festivals") setFestBrowse(await getFestivals(300, filters));
      else setRaw(await fetchEvents(sort, 200, undefined, undefined, filters));
    } catch (e) {
      setError(String(e)); setRaw([]);
    } finally {
      setLoading(false);
    }
  }

  // Load the list from the feed, and RE-load whenever it changes.
  //
  // This must not live in a mount effect. expo-router can deliver an empty params object
  // on the first render and fill it in on the next, so `feed` initialises to "" and a
  // mount-time load falls through to the generic browse — which returned exactly 200
  // unrelated concerts for "Recommended for you". Keying off params.feed means we load
  // once the router has actually told us which list was tapped.
  useEffect(() => {
    const incoming = params.feed ?? "";
    setFeed(incoming);
    loadBrowse(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.feed, params.type]);

  const loadFollows = useCallback(() => {
    getFollows()
      .then((list) => {
        const m: Record<string, string> = {};
        list.forEach((a) => (m[a.name.toLowerCase()] = a.id));
        setFollowed(m);
        // Not de-duplicated on purpose: this is the surface where a near-duplicate follow
        // ("AR Rahman" beside "A.R. Rahman") gets unfollowed, so hiding one would trap it.
        setMyArtists(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadFollows(); }, [loadFollows]);

  function clearFeed() {
    setFeed("");
    loadBrowse("");
  }

  // Every keystroke starts a new search, and a slow one must never overwrite a newer one.
  // Each pass carries the sequence number it was started with and drops its own result if
  // a later keystroke has since bumped it — otherwise typing "corona" fast can leave you
  // looking at the results for "cor".
  const searchSeq = useRef(0);

  /** DB artists first — only they can carry dates — then Deezer fills the gaps.
   *
   *  Merged on the lowercased name because the two catalogues spell the same act two ways
   *  and the whole point of the Deezer pass is the acts we do NOT hold. Listing "Coldplay"
   *  twice, once with their tour and once without, would be worse than not asking Deezer.
   */
  function mergePeople(ours: SearchAllResults["artists"], theirs: ArtistSearchResult[]): Person[] {
    const mine: Person[] = ours.map((a) => ({
      key: a.id,
      name: a.name,
      image_url: a.image_url,
      deezer_id: null,
      fans: a.deezer_fans,
      upcoming_events: a.upcoming_events,
      upcoming_festivals: a.upcoming_festivals,
      via: a.via,
    }));
    const seen = new Set(mine.map((p) => p.name.toLowerCase()));
    const extra: Person[] = theirs
      .filter((a) => a.name && !seen.has(a.name.toLowerCase()))
      .slice(0, 4)
      .map((a) => ({
        key: `dz-${a.deezer_id ?? a.name}`,
        name: a.name,
        image_url: a.image_url,
        deezer_id: a.deezer_id,
        fans: a.fans,
        upcoming_events: 0,
        upcoming_festivals: 0,
        via: "deezer" as const,
      }));
    return [...mine, ...extra];
  }

  // The cheap half: our own database in ONE request — artists, their concerts, their
  // festivals and, when the term is a place or a festival, who is on the bill — plus
  // Deezer's global artist search so an act with no dates yet can still be followed.
  // Neither costs Ticketmaster budget, so both can run while you type.
  async function runLocalSearch(term: string, seq: number) {
    const stale = () => seq !== searchSeq.current;
    setFeed("");        // a typed search replaces whatever feed we arrived from
    setBrowsing(false); setError(null); setLoading(true);

    // Deezer runs alongside rather than after: it is the slower of the two and nothing
    // in our own answer depends on it.
    const global = searchArtists(term).catch(() => [] as ArtistSearchResult[]);
    try {
      const ours = await searchAll(term);
      if (stale()) return;
      setRes(ours);
      setPeople(mergePeople(ours.artists, []));      // show ours immediately
      const theirs = await global;
      if (!stale()) setPeople(mergePeople(ours.artists, theirs));
    } catch {
      if (!stale()) { setRes(NO_RESULTS); setPeople([]); }
    } finally {
      if (!stale()) setLoading(false);
    }
  }

  // The paid half: a live Ticketmaster search, which finds shows and festivals we have
  // never ingested. Kept separate and on a longer delay because the free tier is 5,000
  // calls a DAY and the discovery sweep plus the nightly re-verify already spend most of
  // it. Per keystroke this would drain the quota in one session of typing.
  //
  // Two calls now rather than one, because a single box has to answer for both kinds —
  // still only on the settled term, so a session of typing costs two, not two per letter.
  async function runLiveSearch(term: string, seq: number) {
    const stale = () => seq !== searchSeq.current;
    try {
      const live = await searchEvents(term);
      if (stale()) return;
      setRes((prev) => {
        const seen = new Set(prev.events.map((e) => e.id));
        return { ...prev, events: [...prev.events, ...live.filter((e) => !seen.has(e.id))] };
      });
    } catch {
      /* the local results already stand on their own */
    }
    try {
      const live = await searchFestivalsLive(term);
      if (stale()) return;
      setRes((prev) => {
        const seen = new Set(prev.festivals.map((f) => f.id));
        return { ...prev, festivals: [...prev.festivals, ...live.filter((f) => !seen.has(f.id))] };
      });
    } catch {
      /* same */
    }
  }

  // Pressing search still works, and skips both waits.
  async function runSearch() {
    const term = q.trim();
    if (!term) { loadBrowse(); return; }
    const seq = ++searchSeq.current;
    await runLocalSearch(term, seq);
    runLiveSearch(term, seq);
  }

  // Search as you type. Two delays on purpose:
  //
  //   250ms → our own database, which is what makes it feel live.
  //   900ms → the live Ticketmaster pass. Both are TRAILING, so continuous typing costs
  //           exactly one round of live calls at the end.
  //
  // Under two characters nothing runs: one letter matches a large slice of the catalogue,
  // and the endpoint rejects a single character anyway.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      if (!browsing) loadBrowse();
      return;
    }
    if (term.length < 2) return;
    const seq = ++searchSeq.current;
    const localTimer = setTimeout(() => runLocalSearch(term, seq), 250);
    const liveTimer = setTimeout(() => runLiveSearch(term, seq), 900);
    return () => { clearTimeout(localTimer); clearTimeout(liveTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filters]);

  // A filter change while browsing has to re-ask too, or the funnel does nothing until you
  // type. Skipped on the first render, which loadBrowse already handled.
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) { firstFilterRun.current = false; return; }
    if (!q.trim()) loadBrowse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function toggleFollow(p: { name: string; image_url: string | null; deezer_id: number | null }) {
    const refresh = () => loadFollows();
    const key = p.name.toLowerCase();
    const id = followed[key];
    if (id) {
      setFollowed((m) => { const n = { ...m }; delete n[key]; return n; });
      // Drop it from the visible list at once. Without this the row stayed on screen after
      // a successful unfollow, so it looked broken — and a second tap fell through to the
      // else-branch and re-followed the artist.
      setMyArtists((prev) => prev.filter((x) => x.name.toLowerCase() !== key));
      if (id !== "pending") unfollowArtist(id).catch(() => {}).finally(refresh);
    } else {
      setFollowed((m) => ({ ...m, [key]: "pending" }));
      try {
        const saved = await followArtist({ name: p.name, deezer_id: p.deezer_id, image_url: p.image_url });
        setFollowed((m) => ({ ...m, [key]: saved.id }));
        refresh();
      } catch {
        setFollowed((m) => { const n = { ...m }; delete n[key]; return n; });
      }
    }
  }

  /** Why this act is listed, in counted facts only.
   *
   *  Both counts zero says NOTHING rather than "0 concerts": we hold no date for them,
   *  which is not the same claim as none existing. A Deezer-only act falls back to its
   *  follower count, the one thing we do know about it.
   */
  function personLine(p: Person): string | null {
    if (p.via === "deezer") return audienceLine({ fans: p.fans });
    const bits: string[] = [];
    if (p.upcoming_events) bits.push(`${p.upcoming_events} concert${p.upcoming_events === 1 ? "" : "s"}`);
    if (p.upcoming_festivals) bits.push(`${p.upcoming_festivals} festival${p.upcoming_festivals === 1 ? "" : "s"}`);
    const counts = bits.join(" · ");
    if (p.via === "lineup") return counts ? `On the bill · ${counts}` : "On the bill";
    return counts || audienceLine({ deezer_fans: p.fans });
  }

  const nothing = !loading && !browsing
    && !people.length && !res.events.length && !res.festivals.length;

  function FestivalRow({ fest }: { fest: Festival }) {
    return (
      <Pressable style={styles.row} onPress={() => setSelectedFest(fest.id)}>
        <View style={styles.thumb}>
          {fest.image_url ? (
            <Image source={{ uri: fest.image_url }} style={styles.tileFill} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.tileFill, { backgroundColor: tileColor(fest.id) }]} />
          )}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>{fest.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {fmtRange(fest.starts_on, fest.ends_on)} · {countryFlag(fest.country)} {fest.city ?? ""}
          </Text>
        </View>
        {fest.mxs != null ? <Text style={styles.rowMxs}>{fest.mxs.toFixed(1)}</Text> : null}
      </Pressable>
    );
  }

  function EventRow({ e }: { e: MusicEvent }) {
    return (
      <Pressable style={styles.row} onPress={() => setSelectedId(e.id)}>
        <View style={styles.thumb}>
          {e.image_url ? (
            <Image source={{ uri: e.image_url }} style={styles.tileFill} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.tileFill, { backgroundColor: tileColor(e.id) }]} />
          )}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {fmtDay(e.starts_at)} · {countryFlag(e.country)} {e.city ?? ""}
          </Text>
        </View>
        {e.mxs != null ? <Text style={styles.rowMxs}>{e.mxs.toFixed(1)}</Text> : null}
      </Pressable>
    );
  }

  function PersonRow({ p }: { p: Person }) {
    const following = !!followed[p.name.toLowerCase()];
    const line = personLine(p);
    return (
      <View style={styles.row}>
        <Pressable style={styles.artistTap} onPress={() => setSelectedArtist(p.name)}>
          {p.image_url ? (
            <Image source={{ uri: p.image_url }} style={styles.avatar} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{p.name[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
            {line ? <Text style={styles.rowSub} numberOfLines={1}>{line}</Text> : null}
          </View>
        </Pressable>
        {/* A heart sits beside an ARTIST, never beside an event — the whole point of the
            two controls being different. Wanting to see someone and subscribing to their
            alerts stayed deliberately separate, so both are offered here. */}
        <WishlistHeart artistName={p.name} imageUrl={p.image_url} variant="panel" />
        <Pressable
          style={[styles.followBtn, following && styles.followingBtn]}
          hitSlop={6}
          onPress={() => toggleFollow(p)}>
          <Text style={following ? styles.followingText : styles.followText}>
            {following ? "Following" : "Follow"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={th.text} />
          </Pressable>
          <Text style={styles.title}>Search</Text>
        </View>
        <View style={styles.searchbar}>
          <Ionicons name="search" size={18} color={th.muted} />
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={runSearch}
            returnKeyType="search"
            autoFocus={params.focus === "1" || !params.feed}
            placeholder="Artists, concerts, festivals, cities…"
            placeholderTextColor={th.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {q ? (
            <Pressable onPress={() => { setQ(""); loadBrowse(); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={th.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Three dropdowns, under the box. No chip row underneath: each pill already wears
            its own answer, and a chip repeating "Today" says the same thing twice. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.pillScroll}
          contentContainerStyle={styles.pillRow}
          onScroll={(e) => setPillScroll(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          {GROUPS.map((g) => {
            const value = g.valueOf(filters);
            const open = menu === g.key;
            return (
              <Pressable
                key={g.key}
                style={[styles.pill, value ? styles.pillOn : null, open ? styles.pillOpen : null]}
                onLayout={(e) => { pillX.current[g.key] = e.nativeEvent.layout.x; }}
                onPress={() => setMenu(open ? null : g.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Text style={[styles.pillText, value ? styles.pillTextOn : null]} numberOfLines={1}>
                  {pillLabel(g, filters)}
                </Text>
                {value ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => { setFilters((f) => ({ ...f, ...CLEARED[g.key] })); setMenu(null); }}
                    accessibilityLabel={`Clear ${g.label}`}
                  >
                    <Ionicons name="close" size={12} color={th.accentInk} />
                  </Pressable>
                ) : (
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={12} color={th.muted} />
                )}
              </Pressable>
            );
          })}
          {GROUPS.some((g) => g.valueOf(filters)) ? (
            <Pressable onPress={() => { setFilters({}); setMenu(null); }} hitSlop={6}
                       style={styles.clearAll}>
              <Text style={styles.clearAllT}>Clear</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {/* The open dropdown, anchored under its own pill. Absolute so it floats over the
            results rather than shoving them down the screen every time you open it. */}
        {menu ? (
          <View style={styles.menuLayer} pointerEvents="box-none">
            <View style={[styles.menu, { left: menuLeft }]}>
              {(GROUPS.find((g) => g.key === menu) as Group).opts.map((o) => {
                const g = GROUPS.find((x) => x.key === menu) as Group;
                const on = g.valueOf(filters) === o.value;
                const n = counts && o.count ? counts[o.count] : undefined;
                return (
                  <Pressable
                    key={o.value}
                    style={styles.menuItem}
                    onPress={() => {
                      if (o.value === "custom") { setMenu(null); setRangeOpen(true); return; }
                      setFilters((f) => g.pick(f, o.value));
                      setMenu(null);
                    }}
                  >
                    <Text style={[styles.menuText, on ? styles.menuTextOn : null]} numberOfLines={1}>
                      {o.label}
                    </Text>
                    {/* A real count or nothing at all. A zero here would read as
                        "there are none", which is a different claim from "not counted". */}
                    {n !== undefined ? (
                      <Text style={[styles.menuCount, on ? styles.menuCountOn : null]}>{n}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {(GROUPS.find((g) => g.key === menu) as Group).note ? (
                <Text style={styles.menuNote}>
                  {(GROUPS.find((g) => g.key === menu) as Group).note}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* what the user tapped to get here — clearing it browses everything */}
      {feed && feedLabel ? (
        <View style={styles.feedRow}>
          <View style={styles.feedChip}>
            <Text style={styles.feedChipText}>{feedLabel}</Text>
            <Pressable onPress={clearFeed} hitSlop={8}>
              <Ionicons name="close" size={14} color={th.accentInk} />
            </Pressable>
          </View>
          <Text style={styles.feedCount}>
            {raw.length} concert{raw.length === 1 ? "" : "s"}
          </Text>
        </View>
      ) : null}

      {/* body */}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={40} color={th.muted} />
            <Text style={styles.errText}>Couldn’t load:{"\n"}{error}</Text>
          </View>
        ) : browsing ? (
          /* Nothing typed: the feed or the list the Home row asked for. This path carries
             every link into this screen, so it answers with the kind that was tapped. */
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={th.accent} size="large" />
              <Text style={styles.dim}>Loading…</Text>
            </View>
          ) : browseKind === "festivals" ? (
            festBrowse.length ? (
              <View>{festBrowse.map((fest) => <FestivalRow key={fest.id} fest={fest} />)}</View>
            ) : (
              <View style={styles.centerBox}>
                <Ionicons name="sad-outline" size={40} color={th.muted} />
                <Text style={styles.dim}>No upcoming festivals</Text>
              </View>
            )
          ) : browseKind === "artists" ? (
            myArtists.length ? (
              <>
                <Text style={styles.groupHead}>Following · {myArtists.length}</Text>
                {myArtists.map((a) => (
                  <PersonRow key={a.id} p={{
                    key: a.id, name: a.name, image_url: a.image_url, deezer_id: null,
                    fans: a.deezer_fans, upcoming_events: 0, upcoming_festivals: 0, via: "name",
                  }} />
                ))}
              </>
            ) : (
              <View style={styles.centerBox}>
                <Ionicons name="musical-notes-outline" size={40} color={th.muted} />
                <Text style={styles.dim}>You&rsquo;re not following anyone yet</Text>
                <Text style={styles.hint}>
                  Search above and we&rsquo;ll track their shows worldwide.
                </Text>
              </View>
            )
          ) : raw.length ? (
            <View>{raw.map((e) => <EventRow key={e.id} e={e} />)}</View>
          ) : (
            <View style={styles.centerBox}>
              <Ionicons name="search-outline" size={40} color={th.muted} />
              <Text style={styles.dim}>Search for anything</Text>
              <Text style={styles.hint}>
                An artist, a concert, a festival or a city — one box, and the answer comes
                back with all three.
              </Text>
            </View>
          )
        ) : nothing ? (
          <View style={styles.centerBox}>
            <Ionicons name="sad-outline" size={40} color={th.muted} />
            <Text style={styles.dim}>No results for “{q.trim()}”</Text>
            <Text style={styles.hint}>Try another artist, concert, festival or city.</Text>
          </View>
        ) : (
          /* ONE answer, three kinds, always in this order: who, then what, then where you
             could see them. No toggle to get it wrong, and no section header over an empty
             list — a lone heading above nothing reads like a failed load. */
          <View>
            {people.length ? (
              <>
                <Text style={styles.groupHead}>Artists</Text>
                {people.map((p) => <PersonRow key={p.key} p={p} />)}
              </>
            ) : null}

            {res.events.length ? (
              <>
                <Text style={styles.groupHead}>Concerts</Text>
                {res.events.map((e) => <EventRow key={e.id} e={e} />)}
              </>
            ) : null}

            {res.festivals.length ? (
              <>
                <Text style={styles.groupHead}>Festivals</Text>
                {res.festivals.map((fest) => <FestivalRow key={fest.id} fest={fest} />)}
              </>
            ) : null}

            {loading ? <ActivityIndicator color={th.accent} style={{ marginVertical: 16 }} /> : null}
          </View>
        )}
      </ScrollView>

      <DateRangePicker
        visible={rangeOpen}
        start={filters.from ?? iso(new Date())}
        end={filters.to ?? iso(new Date())}
        minDate={iso(new Date())}
        onClose={() => setRangeOpen(false)}
        onChange={(start, end) => {
          setFilters((f) => ({ ...f, when: "custom", from: start, to: end }));
          setRangeOpen(false);
        }}
      />

      <Modal visible={!!selectedId} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selectedId ? <EventDetailView id={selectedId} onClose={() => setSelectedId(null)} /> : null}
      </Modal>
      <Modal visible={!!selectedFest} animationType="slide" onRequestClose={() => setSelectedFest(null)}>
        {selectedFest ? <FestivalDetailView id={selectedFest} onClose={() => setSelectedFest(null)} /> : null}
      </Modal>
      <Modal visible={!!selectedArtist} animationType="slide" onRequestClose={() => setSelectedArtist(null)}>
        {selectedArtist ? (
          <ArtistDetail
            name={selectedArtist}
            onClose={() => setSelectedArtist(null)}
            onSelectEvent={(id) => { setSelectedArtist(null); setSelectedId(id); }}
            onSelectFestival={(id) => { setSelectedArtist(null); setSelectedFest(id); }}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: th.bg },

  pillScroll: { marginTop: 12, flexGrow: 0 },
  // paddingRight so the last pill — or Clear — is not flush against the screen edge once
  // the row has been slid all the way over.
  pillRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 16 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.line, borderRadius: 999,
    paddingLeft: 13, paddingRight: 11, paddingVertical: 8,
  },
  pillOpen: { backgroundColor: th.panel2, borderColor: th.outline2 },
  pillOn: { backgroundColor: th.accentFill, borderColor: th.accentFill },
  pillText: { color: th.text2, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  pillTextOn: { color: th.accentInk },
  clearAll: { paddingHorizontal: 4, paddingVertical: 6 },
  clearAllT: { color: th.muted, fontSize: 12.5, fontWeight: "700" },

  // Zero-height, so the dropdown floats over the results instead of pushing them down the
  // screen each time one opens. box-none lets taps through to whatever is underneath.
  menuLayer: { height: 0, zIndex: 30 },
  menu: {
    position: "absolute", top: 6, width: MENU_WIDTH,
    backgroundColor: th.panel, borderWidth: 1, borderColor: th.outline, borderRadius: 15,
    padding: 5,
    // Android draws shadows from elevation only; iOS and web need the four shadow props.
    elevation: 12,
    shadowColor: th.shadow, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 12 },
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    paddingVertical: 10, paddingHorizontal: 11, borderRadius: 11,
  },
  menuText: { color: th.text2, fontSize: 14.5, fontWeight: "600", flexShrink: 1 },
  menuTextOn: { color: th.accent, fontWeight: "800" },
  menuCount: { color: th.muted, fontSize: 12.5, fontVariant: ["tabular-nums"] },
  menuCountOn: { color: alpha(th.accent, 0.7) },
  menuNote: {
    color: th.muted, fontSize: 11, lineHeight: 16,
    paddingHorizontal: 11, paddingTop: 7, paddingBottom: 5,
    borderTopWidth: 1, borderTopColor: th.line, marginTop: 4,
  },

  header: { paddingHorizontal: 16, paddingTop: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  title: { color: th.text, fontSize: 24, fontWeight: "800" },
  searchbar: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: th.panel,
    borderWidth: 1, borderColor: th.line, borderRadius: 14, paddingHorizontal: 14, height: 46,
  },
  input: { flex: 1, color: th.text, fontSize: 15, padding: 0 },

  feedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  feedChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: th.accentFill, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
  },
  feedChipText: { color: th.accentInk, fontSize: 12.5, fontWeight: "800" },
  feedCount: { color: th.muted, fontSize: 12.5 },

  body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 70 },
  dim: { color: th.text, fontSize: 16, fontWeight: "700", marginTop: 6 },
  hint: { color: th.muted, fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 300 },
  errText: { color: th.danger, fontSize: 13, textAlign: "center", marginTop: 6 },

  groupHead: { color: th.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 18, marginBottom: 6 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  artistTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  thumb: { width: 56, height: 56, borderRadius: 8, overflow: "hidden", backgroundColor: th.panel },
  tileFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: th.text, fontSize: 15, fontWeight: "700" },
  rowSub: { color: th.muted, fontSize: 13, marginTop: 2 },
  rowMxs: { color: th.accent, fontSize: 15, fontWeight: "800", marginLeft: 8 },

  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: th.panel2 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: th.muted, fontSize: 20, fontWeight: "800" },
  followBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: th.accentFill },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: th.outline },
  followText: { color: th.accentInk, fontSize: 13, fontWeight: "800" },
  followingText: { color: th.muted, fontSize: 13, fontWeight: "700" },
});
