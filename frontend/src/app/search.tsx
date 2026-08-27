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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ArtistDetail from "../components/artist-detail";
import EventDetailView from "../components/event-detail";
import FestivalDetailView from "../components/festival-detail";
import {
  ArtistSearchResult,
  Festival,
  fetchEvents,
  followArtist,
  getFestivals,
  FollowedArtist,
  getFollows,
  getRecommended,
  MusicEvent,
  searchArtists,
  searchFestivals,
  searchFestivalsLive,
  searchEvents,
  searchEventsLocal,
  unfollowArtist,
} from "../lib/api";
import { audienceLine } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";

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
function inWhen(iso: string | null, mode: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (mode === "today") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return d >= s && d <= end;
  }
  if (mode === "tomorrow") {
    const s = new Date(now); s.setDate(now.getDate() + 1); s.setHours(0, 0, 0, 0);
    const end = new Date(s); end.setHours(23, 59, 59, 999);
    return d >= s && d <= end;
  }
  if (mode === "week") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(now.getDate() + 7); end.setHours(23, 59, 59, 999);
    return d >= s && d <= end;
  }
  if (mode === "weekend") {
    const end = new Date(now);
    end.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
    end.setHours(23, 59, 59, 999);
    return d >= now && d <= end;
  }
  if (mode === "month") return d <= new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  if (mode === "3m") {
    const end = new Date(now);
    end.setMonth(now.getMonth() + 3);
    return d <= end;
  }
  return true;
}

/* ---------------- filter option lists (apply to concerts) ---------------- */
type Opt = { value: string; label: string; short?: string };
const SORT_OPTS: Opt[] = [
  { value: "soonest", label: "Soonest first", short: "Soonest" },
  { value: "rating", label: "Highest rated", short: "Top rated" },
  { value: "price", label: "Lowest price", short: "Cheapest" },
];
const DATE_OPTS: Opt[] = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today", short: "Today" },
  { value: "tomorrow", label: "Tomorrow", short: "Tomorrow" },
  { value: "weekend", label: "This weekend", short: "Weekend" },
  { value: "week", label: "Next 7 days", short: "7 days" },
  { value: "month", label: "This month", short: "This month" },
  { value: "3m", label: "Next 3 months", short: "3 months" },
];
const COUNTRY_CODES = ["GB", "US", "DE", "NL", "FR", "ES", "IT", "IE", "IN", "JP", "KR", "BR", "MX", "AU", "CA"];
const COUNTRY_OPTS: Opt[] = [
  { value: "", label: "Any country" },
  ...COUNTRY_CODES.map((cc) => ({ value: cc, label: `${countryFlag(cc)}  ${cc}`, short: `${countryFlag(cc)} ${cc}` })),
];

/* ---------------- feeds ----------------
   Every "See all" on Home lands here rather than in its own modal, so one screen owns
   browsing: the same filters, sort and search bar apply whatever you arrived from.
   `feed` says WHICH list to load; `label` is what the user tapped, shown as a chip
   they can clear to fall back to browsing everything. */
const FEED_LABELS: Record<string, string> = {
  recommended: "Recommended for you",
  soon: "Coming up soon",
  rated: "Highest rated",
  city: "In your city",
  country: "In your country",
  all: "All concerts",
};

type Filters = { sort: string; when: string; country: string };
const EMPTY: Filters = { sort: "soonest", when: "", country: "" };

/* ---------------- one dropdown filter (pill + bottom sheet) ---------------- */
function FilterDropdown({
  icon, title, placeholder, options, value, defaultValue = "", onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap; title: string; placeholder: string;
  options: Opt[]; value: string; defaultValue?: string; onChange: (v: string) => void;
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
                  <Pressable key={o.value || "any"} style={styles.optRow}
                    onPress={() => { onChange(o.value); setOpen(false); }}>
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
  const params = useLocalSearchParams<{
    type?: string; feed?: string; label?: string; city_id?: string; country?: string;
    focus?: string;
  }>();
  // held in state, not read straight from the params, so the chip can be cleared
  const [feed, setFeed] = useState(params.feed ?? "");
  const feedLabel = params.label || FEED_LABELS[params.feed ?? ""] || "";
  const [mode, setMode] = useState<"concerts" | "festivals" | "artists">(
    params.type === "festivals" ? "festivals" : params.type === "artists" ? "artists" : "concerts"
  );
  // Everyone the user follows. Shown in Artists mode when the box is empty, so this
  // screen is where you both browse your artists AND find new ones — the same shape as
  // Concerts and Festivals. NOT de-duplicated: this is the surface where near-duplicates
  // ("AR Rahman" beside "A.R. Rahman") get unfollowed, so hiding them would trap them.
  const [myArtists, setMyArtists] = useState<FollowedArtist[]>([]);
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState<MusicEvent[]>([]);
  const [artists, setArtists] = useState<ArtistSearchResult[]>([]);
  const [festAll, setFestAll] = useState<Festival[]>([]);
  const [festResults, setFestResults] = useState<Festival[]>([]);
  const [followed, setFollowed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [f, setF] = useState<Filters>(
    params.feed === "soon" ? { ...EMPTY, when: "week" }
      : params.feed === "rated" ? { ...EMPTY, sort: "rating" }
      : EMPTY
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedFest, setSelectedFest] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(true);

  async function loadBrowse(which: string = feed) {
    setLoading(true); setError(null); setSearched(true); setBrowsing(true);
    setArtists([]); setFestResults([]);
    try {
      if (which === "recommended") setRaw(await getRecommended());
      else if (which === "rated") setRaw(await fetchEvents("mxs", 200));
      else if (which === "city" && params.city_id)
        setRaw(await fetchEvents("date", 200, params.city_id));
      else if (which === "country" && params.country)
        setRaw(await fetchEvents("date", 200, undefined, params.country));
      else setRaw(await fetchEvents("date", 200));
    } catch (e) {
      setError(String(e)); setRaw([]);
    } finally {
      setLoading(false);
    }
  }

  // Same trap as `feed` below: expo-router can hand over an empty params object on the
  // first render and fill it in on the next, so reading params.type ONLY in the useState
  // initialiser left mode stuck on "concerts". That is why "See all" on the artists row
  // landed here showing concerts. Keyed on params.type so it corrects itself the moment
  // the router tells us — and this covers the festivals "View All" too, which had the
  // same latent bug.
  useEffect(() => {
    if (params.type === "artists") setMode("artists");
    else if (params.type === "festivals") setMode("festivals");
    else if (params.type) setMode("concerts");
  }, [params.type]);

  // Load the list from the feed, and RE-load whenever it changes.
  //
  // This must not live in the mount effect. expo-router can deliver an empty params
  // object on the first render and fill it in on the next, so `feed` initialises to ""
  // and a mount-time load falls through to the generic browse — which returned exactly
  // 200 unrelated concerts for "Recommended for you". Keying off params.feed means we
  // load once the router has actually told us which list was tapped.
  useEffect(() => {
    const incoming = params.feed ?? "";
    setFeed(incoming);
    if (incoming === "soon") setF({ ...EMPTY, when: "week" });
    else if (incoming === "rated") setF({ ...EMPTY, sort: "rating" });
    loadBrowse(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.feed]);

  const loadFollows = useCallback(() => {
    getFollows()
      .then((list) => {
        const m: Record<string, string> = {};
        list.forEach((a) => (m[a.name.toLowerCase()] = a.id));
        setFollowed(m);
        setMyArtists(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getFestivals(300).then(setFestAll).catch(() => {});
    loadFollows();
  }, []);

  function clearFeed() {
    setFeed("");
    setF(EMPTY);
    loadBrowse("");
  }

  // Every keystroke starts a new search, and a slow one must never overwrite a newer one.
  // Each pass carries the sequence number it was started with and drops its own result if
  // a later keystroke has since bumped it — otherwise typing "corona" fast can leave you
  // looking at the results for "cor".
  const searchSeq = useRef(0);

  // The cheap half: our own database, the festival list already in memory, and Deezer's
  // artist search. Nothing here costs Ticketmaster budget, so it can run while you type.
  async function runLocalSearch(term: string, seq: number) {
    const stale = () => seq !== searchSeq.current;
    setFeed("");        // a typed search replaces whatever feed we arrived from
    if (mode === "artists") {
      setLoading(true);
      try {
        const list = await searchArtists(term);
        if (!stale()) setArtists(list);
      } catch {
        if (!stale()) setArtists([]);
      } finally {
        if (!stale()) setLoading(false);
      }
      return;
    }
    setSearched(true); setBrowsing(false); setError(null);
    // Server-side now, and ranked. The old client-side filter searched only the 100
    // festivals this screen had fetched, so a search for something we DO hold returned
    // nothing but whatever noise happened to be in those 100 — "ade" matched "BULL
    // BRIGADE" and "Shred Fest Adelaide" while Corona Capital was unreachable.
    searchFestivals(term).then((l) => { if (!stale()) setFestResults(l); }).catch(() => {});
    // No artist lookup here any more: Concerts and Festivals no longer render artists, and
    // this fired a Deezer request on every keystroke to fill a list nobody sees.
    setArtists([]);

    setLoading(true);
    try {
      const local = await searchEventsLocal(term);
      if (!stale()) setRaw(local);
    } catch {
      if (!stale()) setRaw([]);
    } finally {
      if (!stale()) setLoading(false);
    }
  }

  // The paid half: a live Ticketmaster search, which finds shows we have never ingested.
  // Kept separate and on a longer delay because Ticketmaster's free tier is 5,000 calls a
  // DAY and the discovery sweep plus the nightly re-verify already spend most of it. Per
  // keystroke this would drain the quota in a single session of typing.
  async function runLiveSearch(term: string, seq: number) {
    if (mode === "artists") return;
    if (mode === "festivals") {
      // The same deal the concert side has always had: our own festivals appear instantly,
      // then Ticketmaster is asked once for anything we have never swept. Merged by id, so
      // a festival we already held is not listed twice.
      try {
        const live = await searchFestivalsLive(term);
        if (seq !== searchSeq.current) return;
        setFestResults((prev) => {
          const seen = new Set(prev.map((f) => f.id));
          return [...prev, ...live.filter((f) => !seen.has(f.id))];
        });
      } catch {
        /* the local results already stand on their own */
      }
      return;
    }
    try {
      const live = await searchEvents(term);
      if (seq !== searchSeq.current) return;
      setRaw((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...live.filter((e) => !seen.has(e.id))];
      });
    } catch {
      /* the local results already stand on their own */
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
  //   250ms → the local pass, which is what makes it feel live. Typing "corona" surfaces
  //           Corona Capital before you finish the word; the backend already matched on a
  //           substring, so nothing had to change there — the screen simply never asked
  //           until you pressed the search key.
  //   900ms → the live Ticketmaster pass. Both are TRAILING, so continuous typing costs
  //           exactly one live call at the end, the same as one press of search used to.
  //
  // Under two characters nothing runs: one letter matches a large slice of the catalogue,
  // and Deezer's artist search rejects a single character anyway.
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
  }, [q, mode]);

  async function toggleFollow(a: ArtistSearchResult) {
    // whatever happens, re-read the follows afterwards so Artists mode stays truthful
    const refresh = () => loadFollows();
    const key = a.name.toLowerCase();
    const id = followed[key];
    if (id) {
      setFollowed((m) => { const n = { ...m }; delete n[key]; return n; });
      // Drop it from the visible list straight away. Without this the row stayed on
      // screen after a successful unfollow, so it looked broken — and a second tap fell
      // through to the else-branch and re-followed the artist.
      setMyArtists((prev) => prev.filter((x) => x.name.toLowerCase() !== key));
      if (id !== "pending") unfollowArtist(id).catch(() => {}).finally(refresh);
    } else {
      setFollowed((m) => ({ ...m, [key]: "pending" }));
      try {
        const saved = await followArtist({ name: a.name, deezer_id: a.deezer_id, image_url: a.image_url });
        setFollowed((m) => ({ ...m, [key]: saved.id }));
        refresh();
      } catch {
        setFollowed((m) => { const n = { ...m }; delete n[key]; return n; });
      }
    }
  }

  const concerts = useMemo(() => {
    let l = raw.slice();
    if (f.when) l = l.filter((e) => inWhen(e.starts_at, f.when));
    if (f.country) l = l.filter((e) => e.country === f.country);
    if (f.sort === "rating") l.sort((a, b) => (b.mxs ?? -1) - (a.mxs ?? -1));
    else if (f.sort === "price") l.sort((a, b) => (a.price_from_amount ?? 9e9) - (b.price_from_amount ?? 9e9));
    else l.sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
      return ta - tb;
    });
    return l;
  }, [raw, f]);

  // Festivals browse list — same filters (date on start date, country), soonest first.
  const festivalsBrowse = useMemo(() => {
    let l = festAll.slice();
    if (f.when) l = l.filter((x) => inWhen(x.starts_on, f.when));
    if (f.country) l = l.filter((x) => x.country === f.country);
    l.sort((a, b) => {
      const ta = a.starts_on ? new Date(a.starts_on).getTime() : Infinity;
      const tb = b.starts_on ? new Date(b.starts_on).getTime() : Infinity;
      return ta - tb;
    });
    return l;
  }, [festAll, f]);

  const activeCount = (f.when ? 1 : 0) + (f.country ? 1 : 0) + (f.sort !== "soonest" ? 1 : 0);
  // Judged against the kind this toggle actually shows. It used to require all three to
  // be empty, so "No results" never appeared on Concerts while an unrelated artist matched.
  const nothing = !loading && !browsing && (
    mode === "artists" ? artists.length === 0
      : mode === "festivals" ? festResults.length === 0
      : concerts.length === 0
  );

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
        {/* The score, as EventRow has always shown it. Without this the "sort by rating"
            filter above ranked festivals by a number the row never displayed. */}
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* header */}
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
            autoFocus={params.focus === "1" || !params.feed}
            placeholder="Artists, concerts, festivals, cities…"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {q ? (
            <Pressable onPress={() => { setQ(""); loadBrowse(); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={MUTED} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.segment}>
          <Pressable style={[styles.segBtn, mode === "concerts" && styles.segBtnOn]} onPress={() => setMode("concerts")}>
            <Text style={[styles.segText, mode === "concerts" && styles.segTextOn]}>Concerts</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, mode === "festivals" && styles.segBtnOn]} onPress={() => setMode("festivals")}>
            <Text style={[styles.segText, mode === "festivals" && styles.segTextOn]}>Festivals</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, mode === "artists" && styles.segBtnOn]} onPress={() => setMode("artists")}>
            <Text style={[styles.segText, mode === "artists" && styles.segTextOn]}>Artists</Text>
          </Pressable>
        </View>
      </View>

      {/* what the user tapped to get here — clearing it browses everything */}
      {feed && feedLabel ? (
        <View style={styles.feedRow}>
          <View style={styles.feedChip}>
            <Text style={styles.feedChipText}>{feedLabel}</Text>
            <Pressable onPress={clearFeed} hitSlop={8}>
              <Ionicons name="close" size={14} color="#0b0b0f" />
            </Pressable>
          </View>
          <Text style={styles.feedCount}>
            {concerts.length} concert{concerts.length === 1 ? "" : "s"}
          </Text>
        </View>
      ) : null}

      {/* Concert filters. Hidden in Artists mode: sorting people by "soonest first" or
          "lowest price" means nothing, and a date filter on an artist is nonsense. */}
      {mode !== "artists" ? (
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} keyboardShouldPersistTaps="handled">
          <FilterDropdown icon="swap-vertical" title="Sort by" placeholder="Sort" defaultValue="soonest"
            options={SORT_OPTS} value={f.sort} onChange={(v) => setF((p) => ({ ...p, sort: v }))} />
          <FilterDropdown icon="calendar-outline" title="Date" placeholder="Date"
            options={DATE_OPTS} value={f.when} onChange={(v) => setF((p) => ({ ...p, when: v }))} />
          <FilterDropdown icon="earth-outline" title="Country" placeholder="Country"
            options={COUNTRY_OPTS} value={f.country} onChange={(v) => setF((p) => ({ ...p, country: v }))} />
          {activeCount > 0 ? (
            <Pressable style={styles.clearPill} onPress={() => setF(EMPTY)} hitSlop={6}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
      ) : null}

      {/* body */}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
            <Text style={styles.errText}>Couldn’t load:{"\n"}{error}</Text>
          </View>
        ) : mode === "artists" ? (
          /* ARTISTS MODE — your follows, or search results once you type */
          <View>
            {q.trim().length < 2 ? (
              myArtists.length ? (
                <>
                  <Text style={styles.groupHead}>Following · {myArtists.length}</Text>
                  {myArtists.map((a) => (
                    <View key={a.id} style={styles.row}>
                      <Pressable style={styles.artistTap} onPress={() => setSelectedArtist(a.name)}>
                        {a.image_url ? (
                          <Image source={{ uri: a.image_url }} style={styles.avatar} contentFit="cover" transition={120} />
                        ) : (
                          <View style={[styles.avatar, styles.avatarFallback]}>
                            <Text style={styles.avatarInitial}>{a.name[0]?.toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{a.name}</Text>
                          {audienceLine(a) ? (
                            <Text style={styles.rowSub} numberOfLines={1}>{audienceLine(a)}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                      <Pressable
                        style={[styles.followBtn, styles.followingBtn]}
                        hitSlop={6}
                        onPress={() =>
                          toggleFollow({ name: a.name, image_url: a.image_url, deezer_id: null, fans: null })
                        }>
                        <Text style={styles.followingText}>Following</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              ) : (
                <View style={styles.centerBox}>
                  <Ionicons name="musical-notes-outline" size={40} color={MUTED} />
                  <Text style={styles.dim}>
                    You&rsquo;re not following anyone yet — search above and we&rsquo;ll track their shows worldwide.
                  </Text>
                </View>
              )
            ) : loading ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 16 }} />
            ) : artists.length ? (
              <>
                <Text style={styles.groupHead}>Results</Text>
                {artists.map((a) => {
                  const following = !!followed[a.name.toLowerCase()];
                  return (
                    <View key={`${a.name}-${a.deezer_id}`} style={styles.row}>
                      <Pressable style={styles.artistTap} onPress={() => setSelectedArtist(a.name)}>
                        {a.image_url ? (
                          <Image source={{ uri: a.image_url }} style={styles.avatar} contentFit="cover" transition={120} />
                        ) : (
                          <View style={[styles.avatar, styles.avatarFallback]}>
                            <Text style={styles.avatarInitial}>{a.name[0]?.toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{a.name}</Text>
                          {audienceLine(a) ? (
                            <Text style={styles.rowSub} numberOfLines={1}>{audienceLine(a)}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                      <Pressable style={[styles.followBtn, following && styles.followingBtn]} onPress={() => toggleFollow(a)} hitSlop={6}>
                        <Text style={following ? styles.followingText : styles.followText}>
                          {following ? "Following" : "Follow"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </>
            ) : (
              <View style={styles.centerBox}>
                <Ionicons name="sad-outline" size={40} color={MUTED} />
                <Text style={styles.dim}>No artist matches “{q.trim()}”.</Text>
              </View>
            )}
          </View>
        ) : browsing ? (
          mode === "festivals" ? (
            festivalsBrowse.length ? (
              <View>{festivalsBrowse.map((fest) => <FestivalRow key={fest.id} fest={fest} />)}</View>
            ) : (
              <View style={styles.centerBox}><Ionicons name="sad-outline" size={40} color={MUTED} /><Text style={styles.dim}>No festivals match those filters</Text></View>
            )
          ) : loading ? (
            <View style={styles.centerBox}><ActivityIndicator color={ACCENT} size="large" /><Text style={styles.dim}>Loading concerts…</Text></View>
          ) : concerts.length ? (
            <View>{concerts.map((e) => <EventRow key={e.id} e={e} />)}</View>
          ) : (
            <View style={styles.centerBox}><Ionicons name="sad-outline" size={40} color={MUTED} /><Text style={styles.dim}>No concerts match those filters</Text></View>
          )
        ) : (
          <View>
            {/* One toggle, one kind. A search on Concerts used to render Artists, then
                Concerts, then Festivals — three answers to a question that named one of
                them. The toggles exist precisely to say which you meant, so honouring them
                is what makes the choice mean anything. Nothing is lost: the same term is
                still one tap away under the other two. */}
            {mode === "festivals" ? (
              festResults.length ? (
                <>
                  <Text style={styles.groupHead}>Festivals</Text>
                  {festResults.slice(0, 8).map((fest) => (
                    <Pressable key={fest.id} style={styles.row} onPress={() => setSelectedFest(fest.id)}>
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
                    </Pressable>
                  ))}
                </>
              ) : null
            ) : (
              <>
                {/* No header over an empty list: the "No results" box below already says it,
                    and a lone CONCERTS heading above nothing reads like a failed load. */}
                {loading || concerts.length ? <Text style={styles.groupHead}>Concerts</Text> : null}
                {loading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginVertical: 16 }} />
                ) : (
                  concerts.map((e) => <EventRow key={e.id} e={e} />)
                )}
              </>
            )}

            {nothing ? (
              <View style={styles.centerBox}>
                <Ionicons name="sad-outline" size={40} color={MUTED} />
                <Text style={styles.dim}>No results for “{q.trim()}”</Text>
                <Text style={styles.hint}>Try another artist, concert, festival or city.</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  header: { paddingHorizontal: 16, paddingTop: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  title: { color: "#f4f4f6", fontSize: 24, fontWeight: "800" },
  searchbar: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#14141b",
    borderWidth: 1, borderColor: "#26262f", borderRadius: 14, paddingHorizontal: 14, height: 46,
  },
  input: { flex: 1, color: "#f4f4f6", fontSize: 15, padding: 0 },

  segment: { flexDirection: "row", gap: 8, marginTop: 12 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: "#14141b", borderWidth: 1, borderColor: "#26262f" },
  segBtnOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  segText: { color: "#d6d6de", fontSize: 14, fontWeight: "800" },
  segTextOn: { color: "#0b0b0f" },

  feedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  feedChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: ACCENT, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
  },
  feedChipText: { color: "#0b0b0f", fontSize: 12.5, fontWeight: "800" },
  feedCount: { color: MUTED, fontSize: 12.5 },
  filterBar: { paddingTop: 10, borderBottomWidth: 1, borderBottomColor: "#1c1c24" },
  pillRow: { alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#14141b",
    borderWidth: 1, borderColor: "#26262f", borderRadius: 999, paddingLeft: 12, paddingRight: 10, paddingVertical: 8,
  },
  pillOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  pillText: { color: "#d6d6de", fontSize: 13, fontWeight: "700", maxWidth: 130 },
  pillTextOn: { color: "#0b0b0f" },
  clearPill: { paddingHorizontal: 10, paddingVertical: 8 },
  clearText: { color: ACCENT, fontSize: 13, fontWeight: "700" },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#14141b", borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34, borderTopWidth: 1, borderColor: "#26262f",
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#3a3a46", marginBottom: 12 },
  sheetTitle: { color: "#f4f4f6", fontSize: 18, fontWeight: "800", marginBottom: 6 },
  optRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1c1c24",
  },
  optText: { color: "#d6d6de", fontSize: 16, fontWeight: "600" },
  optTextOn: { color: ACCENT, fontWeight: "800" },

  body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 70 },
  dim: { color: "#f4f4f6", fontSize: 16, fontWeight: "700", marginTop: 6 },
  hint: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 19 },
  errText: { color: "#ff6b6b", fontSize: 13, textAlign: "center", marginTop: 6 },

  groupHead: { color: MUTED, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 18, marginBottom: 6 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  artistTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  thumb: { width: 56, height: 56, borderRadius: 8, overflow: "hidden", backgroundColor: "#14141b" },
  tileFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  rowSub: { color: MUTED, fontSize: 13, marginTop: 2 },
  rowMxs: { color: ACCENT, fontSize: 15, fontWeight: "800", marginLeft: 8 },

  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#1b1b24" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: MUTED, fontSize: 20, fontWeight: "800" },
  followBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: ACCENT },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3a3a46" },
  followText: { color: "#0b0b0f", fontSize: 13, fontWeight: "800" },
  followingText: { color: MUTED, fontSize: 13, fontWeight: "700" },
});
