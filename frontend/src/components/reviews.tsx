/**
 * Reviews for a show — the mockup's screen, with two deliberate departures.
 *
 * DEPARTURE 1: THE SUBTITLE. The mockup reads "each review is analyzed and shapes the
 * show's rating." Both halves would be untrue today: analysing means an LLM bill nobody
 * has approved, and MXS has five fixed components with no slot for a fan rating. Copy
 * that promises what the app does not do is the one thing this product cannot afford, so
 * it says what is actually happening instead.
 *
 * DEPARTURE 2: WHAT FILLS AN EMPTY SCREEN. There is nowhere to import concert reviews
 * from — setlist.fm holds none, Ticketmaster's API exposes none, Songkick is closed,
 * Google reviews the building rather than the night. Every concert happens once and
 * nobody keeps a library of opinions. So before any review exists the screen opens with
 * a fact: what the artist actually played at their last show. It answers the same
 * question a review answers, without borrowing anybody's words.
 *
 * Each review carries the night it was written about, because a review aggregated onto a
 * future date is only fair if the reader can see it came from a different room.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getReviews, LiveFacts, postReview, ReviewItem, ReviewsPage, setReviewHelpful,
} from "../lib/api";
import { coverColor } from "../lib/format";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const STAR_OFF = "#3a3a46";
const MAX_BODY = 1500;

function initials(name: string | null): string {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** "2 days ago" — the mockup's phrasing. Exact timestamps on a review are noise. */
function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 61) return "Last month";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return "Over a year ago";
}

function Stars({ n, size = 13 }: { n: number; size?: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name="star" size={size} color={i <= n ? ACCENT : STAR_OFF} />
      ))}
    </View>
  );
}

function Avatar({ name, uri, size = 38 }: { name: string | null; uri?: string | null; size?: number }) {
  const s = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={s} contentFit="cover" transition={120} />;
  return (
    <View style={[s, { backgroundColor: coverColor(name || "?"), alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.34 }}>{initials(name)}</Text>
    </View>
  );
}

/** What the artist played last time. Not a review — evidence, clearly sourced. */
function LiveFactsCard({ facts, artist }: { facts: LiveFacts; artist: string | null }) {
  const where = [facts.venue_name, facts.city].filter(Boolean).join(", ");
  const when = facts.seen_on
    ? new Date(facts.seen_on + "T12:00:00").toLocaleDateString("en-GB",
        { day: "numeric", month: "short", year: "numeric" })
    : null;
  // Tappable, and not only because somebody will try: setlist.fm's terms ask for a link
  // back to the setlist a number came from, and a reader who wants the other 23 songs
  // should be able to get to them.
  const open = () => { if (facts.url) Linking.openURL(facts.url).catch(() => {}); };

  return (
    <Pressable
      style={styles.factsCard}
      onPress={open}
      disabled={!facts.url}
      accessibilityRole={facts.url ? "link" : undefined}
      accessibilityLabel={facts.url ? "Open the full setlist on setlist.fm" : undefined}
    >
      <View style={styles.factsHead}>
        <Ionicons name="musical-notes" size={15} color={ACCENT} />
        <Text style={styles.factsTitle}>
          What {artist ?? "they"} played last time
        </Text>
        {facts.url ? <Ionicons name="open-outline" size={15} color={MUTED} /> : null}
      </View>
      <Text style={styles.factsBig}>
        {facts.songs} songs
        {facts.encores > 0 ? ` · ${facts.encores} encore${facts.encores > 1 ? "s" : ""}` : ""}
      </Text>
      {where || when ? (
        <Text style={styles.factsWhere}>
          {[where, when].filter(Boolean).join(" · ")}
          {facts.tour ? ` · ${facts.tour}` : ""}
        </Text>
      ) : null}
      {facts.opener || facts.closer ? (
        <Text style={styles.factsSongs}>
          {facts.opener ? `Opened with “${facts.opener}”` : ""}
          {facts.opener && facts.closer ? " · " : ""}
          {facts.closer ? `closed with “${facts.closer}”` : ""}
        </Text>
      ) : null}
      {/* Where the number came from, and that there is more of it. */}
      <Text style={styles.factsSource}>
        From setlist.fm — fan-recorded setlists
        {facts.url ? " · tap for the full setlist" : ""}
      </Text>
    </Pressable>
  );
}

function WriteSheet({
  visible, artist, onClose, onSubmit,
}: {
  visible: boolean; artist: string | null;
  onClose: () => void;
  onSubmit: (rating: number, body: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setRating(0); setBody(""); setError(null); setBusy(false); }
  }, [visible]);

  async function send() {
    if (!rating || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(rating, body.trim());
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#f4f4f6" />
          </Pressable>
          <Text style={styles.headTitle}>Your review</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text style={styles.sheetQ}>How was {artist ?? "the show"}?</Text>
          <View style={styles.starPick}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Pressable key={i} onPress={() => setRating(i)} hitSlop={6}
                         accessibilityLabel={`${i} star${i > 1 ? "s" : ""}`}>
                <Ionicons name="star" size={38} color={i <= rating ? ACCENT : STAR_OFF} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.sheetLabel}>Anything you want to add?</Text>
          <TextInput
            style={styles.sheetInput}
            value={body}
            onChangeText={(t) => setBody(t.slice(0, MAX_BODY))}
            placeholder="The sound, the crowd, whether it started on time…"
            placeholderTextColor={MUTED}
            multiline
            textAlignVertical="top"
            editable={!busy}
          />
          <Text style={styles.count}>{body.length}/{MAX_BODY}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.sheetFoot}>
          <Pressable
            style={[styles.cta, (!rating || busy) && styles.ctaOff]}
            disabled={!rating || busy}
            onPress={send}
          >
            {busy ? <ActivityIndicator color="#0b0b0f" />
                  : <Text style={styles.ctaText}>{rating ? "Post review" : "Pick a rating"}</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function Reviews({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [page, setPage] = useState<ReviewsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getReviews(eventId)
      .then(setPage)
      .catch(() => setError("Couldn’t load reviews just now."))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(load, [load]);

  async function helpful(r: ReviewItem) {
    // Flipped locally first: a tap that waits on the network reads as a broken button.
    setPage((p) => p && {
      ...p,
      reviews: p.reviews.map((x) => x.id === r.id
        ? { ...x, liked_by_me: !x.liked_by_me,
            likes_count: x.likes_count + (x.liked_by_me ? -1 : 1) }
        : x),
    });
    try { await setReviewHelpful(r.id, !r.liked_by_me); } catch { load(); }
  }

  const total = page?.summary.count ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color="#f4f4f6" />
        </Pressable>
        <Text style={styles.headTitle}>Reviews</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={30} color={MUTED} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* Says what is true. The mockup's "each review is analyzed and shapes the
              show's rating" describes a feature that does not exist yet. */}
          <Text style={styles.sub}>
            What fans are saying about {page?.artist_name ?? "this show"} — written only by
            people who were there.
          </Text>

          {/* Before any review exists this is the only thing on the screen that is about
              people rather than absence. It is also the honest prompt: somebody has been,
              so a review is possible. */}
          {(page?.seen_by ?? 0) > 0 ? (
            <View style={styles.seenRow}>
              <Ionicons name="people-outline" size={15} color={ACCENT} />
              <Text style={styles.seenT}>
                {page?.seen_by === 1
                  ? `1 person here has seen ${page?.artist_name ?? "them"} live`
                  : `${page?.seen_by} people here have seen ${page?.artist_name ?? "them"} live`}
              </Text>
            </View>
          ) : null}

          {total > 0 ? (
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <Text style={styles.big}>{page?.summary.average?.toFixed(1)}</Text>
                <Stars n={Math.round(page?.summary.average ?? 0)} size={15} />
                <Text style={styles.count}>{total} review{total === 1 ? "" : "s"}</Text>
              </View>
              <View style={styles.hist}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = page?.summary.histogram?.[String(n)] ?? 0;
                  return (
                    <View key={n} style={styles.histRow}>
                      <Text style={styles.histN}>{n}</Text>
                      <Ionicons name="star" size={9} color={MUTED} />
                      <View style={styles.histTrack}>
                        <View style={[styles.histFill,
                          { width: `${total ? (c / total) * 100 : 0}%` }]} />
                      </View>
                      <Text style={styles.histC}>{c}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Before any review exists, a fact rather than an empty box. */}
          {page?.live_facts ? (
            <LiveFactsCard facts={page.live_facts} artist={page.artist_name} />
          ) : null}

          {page?.can_review ? (
            <Pressable style={styles.writeRow} onPress={() => setWriting(true)}>
              <Avatar name={null} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.writeTitle}>Write a review</Text>
                <Text style={styles.writeSub}>
                  Share your take on {page?.artist_name ?? "this show"}
                </Text>
              </View>
              <Ionicons name="chatbubble-ellipses-outline" size={19} color={ACCENT} />
            </Pressable>
          ) : (
            /* The reason, not a hidden control — otherwise nobody learns where reviews
               come from, and the rule looks like a bug. */
            <View style={styles.lockedRow}>
              <Ionicons name="lock-closed-outline" size={16} color={MUTED} />
              <Text style={styles.lockedText}>
                {page?.cannot_review_reason ?? "You can’t review this show."}
              </Text>
            </View>
          )}

          {total > 0 ? <Text style={styles.section}>All reviews</Text> : null}

          {page?.reviews.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Avatar name={r.author_name} uri={r.author_avatar} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.author_name || "Someone"}
                  </Text>
                  <Text style={styles.when}>
                    {ago(r.created_at)}
                    {/* Which night. A review of a different room on a different tour is
                        still useful, but only if the reader can tell. */}
                    {r.show_label && !r.is_this_event ? ` · ${r.show_label}` : ""}
                  </Text>
                </View>
                <Stars n={r.rating} />
              </View>
              {r.body ? <Text style={styles.cardBody}>{r.body}</Text> : null}
              <Pressable
                style={[styles.helpful, r.liked_by_me && styles.helpfulOn]}
                onPress={() => helpful(r)}
              >
                <Ionicons name={r.liked_by_me ? "heart" : "heart-outline"} size={13}
                          color={r.liked_by_me ? ACCENT : MUTED} />
                <Text style={[styles.helpfulT, r.liked_by_me && styles.helpfulTOn]}>
                  Helpful{r.likes_count ? ` (${r.likes_count})` : ""}
                </Text>
              </Pressable>
            </View>
          ))}

          {total === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubble-outline" size={30} color={MUTED} />
              {/* Says where reviews come FROM, not just that there are none. A review
                  written about any of this artist's shows lands here, which is the part
                  that is not obvious from an empty box. */}
              <Text style={styles.emptyText}>
                {page?.can_review
                  ? `No reviews yet. You were at this show — you could be the first.`
                  : `No reviews of ${page?.artist_name ?? "this artist"} yet. Reviews from any of their shows appear here, written by people who were in the room.`}
              </Text>
            </View>
          ) : null}

          <View style={styles.promise}>
            <Ionicons name="checkmark" size={14} color={MUTED} />
            <Text style={styles.promiseT}>
              Reviews come from real fans who attended — we never edit, buy or import them.
            </Text>
          </View>
        </ScrollView>
      )}

      <WriteSheet
        visible={writing}
        artist={page?.artist_name ?? null}
        onClose={() => setWriting(false)}
        onSubmit={async (rating, body) => {
          await postReview(eventId, rating, body || null);
          load();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0b0f" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingVertical: 12 },
  headTitle: { color: "#f4f4f6", fontSize: 17, fontWeight: "800" },

  body: { paddingHorizontal: 16, paddingBottom: 40 },
  sub: { color: MUTED, fontSize: 13.5, lineHeight: 19, marginBottom: 16 },

  seenRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#14141b",
             borderColor: "#26262f", borderWidth: 1, borderRadius: 12, paddingVertical: 11,
             paddingHorizontal: 13, marginBottom: 14 },
  seenT: { color: "#d6d6de", fontSize: 13, fontWeight: "600", flex: 1 },
  summary: { flexDirection: "row", gap: 18, backgroundColor: "#14141b", borderColor: "#26262f",
             borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 },
  summaryLeft: { alignItems: "center", justifyContent: "center", gap: 5, minWidth: 92 },
  big: { color: "#f4f4f6", fontSize: 40, fontWeight: "800", lineHeight: 44 },
  starRow: { flexDirection: "row", gap: 1.5 },
  count: { color: MUTED, fontSize: 12 },

  hist: { flex: 1, justifyContent: "center", gap: 5 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  histN: { color: MUTED, fontSize: 10.5, width: 8, textAlign: "right" },
  histTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#26262f", overflow: "hidden" },
  histFill: { height: 5, borderRadius: 3, backgroundColor: ACCENT },
  histC: { color: MUTED, fontSize: 10.5, width: 14, textAlign: "right" },

  factsCard: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
               borderRadius: 14, padding: 14, marginBottom: 14, gap: 4 },
  factsHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  factsTitle: { color: "#f4f4f6", fontSize: 14, fontWeight: "800", flex: 1 },
  factsBig: { color: ACCENT, fontSize: 17, fontWeight: "800" },
  factsWhere: { color: "#c8c8d0", fontSize: 12.5 },
  factsSongs: { color: MUTED, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  factsSource: { color: MUTED, fontSize: 11, fontStyle: "italic", marginTop: 4 },

  writeRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#14141b",
              borderColor: "#26262f", borderWidth: 1, borderRadius: 14, padding: 13,
              marginBottom: 18 },
  writeTitle: { color: "#f4f4f6", fontSize: 14.5, fontWeight: "800" },
  writeSub: { color: MUTED, fontSize: 12, marginTop: 2 },

  lockedRow: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#121218",
               borderColor: "#22222b", borderWidth: 1, borderRadius: 14, padding: 13,
               marginBottom: 18 },
  lockedText: { color: MUTED, fontSize: 12.5, flex: 1, lineHeight: 18 },

  section: { color: "#f4f4f6", fontSize: 16, fontWeight: "800", marginBottom: 10 },

  card: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1,
          borderRadius: 14, padding: 13, marginBottom: 10, gap: 9 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: "#f4f4f6", fontSize: 14, fontWeight: "800" },
  when: { color: MUTED, fontSize: 11.5, marginTop: 1 },
  cardBody: { color: "#d6d6de", fontSize: 13.5, lineHeight: 20 },
  helpful: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
             backgroundColor: "#1b1b24", borderRadius: 999, paddingVertical: 6,
             paddingHorizontal: 11 },
  helpfulOn: { backgroundColor: "#1e2410" },
  helpfulT: { color: MUTED, fontSize: 12, fontWeight: "700" },
  helpfulTOn: { color: ACCENT },

  empty: { alignItems: "center", gap: 10, paddingVertical: 30, paddingHorizontal: 20 },
  emptyText: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 19 },

  promise: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 18 },
  promiseT: { color: MUTED, fontSize: 11.5, lineHeight: 17, flex: 1 },

  sheetBody: { padding: 20, gap: 10 },
  sheetQ: { color: "#f4f4f6", fontSize: 19, fontWeight: "800", textAlign: "center" },
  starPick: { flexDirection: "row", gap: 10, justifyContent: "center", marginVertical: 14 },
  sheetLabel: { color: MUTED, fontSize: 12.5, fontWeight: "700" },
  sheetInput: { minHeight: 130, backgroundColor: "#14141b", borderColor: "#26262f",
                borderWidth: 1, borderRadius: 12, padding: 13, color: "#f4f4f6",
                fontSize: 14.5, lineHeight: 21 },
  error: { color: "#ff8b8b", fontSize: 12.5, marginTop: 4 },
  sheetFoot: { padding: 16, borderTopWidth: 1, borderTopColor: "#1c1c24" },
  cta: { backgroundColor: ACCENT, paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  ctaOff: { backgroundColor: "#1b1b24" },
  ctaText: { color: "#0b0b0f", fontSize: 15, fontWeight: "800" },
});
