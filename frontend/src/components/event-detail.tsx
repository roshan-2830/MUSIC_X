import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { EventDetail, fetchEvent, getGoing, Going, getNearbyPlaces, NearbyPlaces} from "../lib/api";
import ArtistDetail from "./artist-detail";
import AroundVenue from "./around-venue";
import GoingRow from "./going-row";
import GoingSheet from "./going-sheet";
import InviteSheet from "./invite-sheet";
import ExploreNearby from "./explore-nearby";
import PlanTrip from "./plan-trip";
import { coverColor, flagEmoji, hashHue } from "../lib/format";
import { useProfile } from "../lib/profile";
import { useSaves } from "../lib/saves";

const ACCENT = "#e8ff47";
const MUTED = "#9a9aa6";
const GREEN = "#7ef0b2";
const WARN = "#f0d47e";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function countdown(iso: string | null): string {
  if (!iso) return "";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return "Already happened";
  if (days === 0) return "Live tonight";
  if (days === 1) return "Live tomorrow";
  if (days <= 45) return `Live in ${days} days`;
  return `Live in ${Math.round(days / 30)} months`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  return `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}
function fmtFans(b: Record<string, any> | null): string {
  const n = b?.fans;
  if (!n) return "a notable following";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M fans`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K fans`;
  return `${n} fans`;
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
const avatarColor = (name: string) => `hsl(${hashHue(name)} 55% 42%)`;

function aboutText(ev: EventDetail): string {
  if (ev.description) return ev.description;      // Ticketmaster's own event write-up
  if (ev.artist_bio) return ev.artist_bio;        // real cited bio (Wikipedia)
  const head = ev.lineup.find((a) => a.is_headliner)?.name ?? ev.lineup[0]?.name;
  const g = ev.genres.slice(0, 2).join(" & ") || "live music";
  const where = `${ev.venue_name ?? "the venue"}${ev.city ? ` in ${ev.city}` : ""}`;
  const when = fmtDate(ev.starts_at);
  return head
    ? `${head} brings ${g} to ${where} on ${when}.`
    : `A night of ${g} at ${where} on ${when}.`;
}
function aboutCredit(ev: EventDetail): string | null {
  if (ev.description) return "From Ticketmaster";
  if (ev.artist_bio) return `Bio from ${ev.artist_bio_source ?? "Wikipedia"}`;
  return null;
}
function lineupTitle(ev: EventDetail): string {
  const head = ev.lineup.find((a) => a.is_headliner)?.name ?? ev.lineup[0]?.name ?? "TBA";
  const others = ev.lineup.length - 1;
  return others > 0 ? `${head}  +${others}` : head;
}
const COUNTRY_NAMES: Record<string, string> = {
  US: "the US", GB: "the UK", IN: "India", AU: "Australia", CA: "Canada",
  DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
  IE: "Ireland", TR: "Türkiye", MX: "Mexico", BR: "Brazil", JP: "Japan",
  SG: "Singapore", PL: "Poland", FI: "Finland", BE: "Belgium", SE: "Sweden",
};
const countryName = (cc?: string | null) => (cc ? COUNTRY_NAMES[cc] ?? cc : "");

const CONF_LABEL: Record<string, string> = {
  high: "Checked & confirmed",
  medium: "Mostly confirmed",
  low: "Not fully confirmed yet",
};
const confColor = (c?: string | null) => (c === "high" ? GREEN : c === "medium" ? "#f0d47e" : MUTED);

function Avatar({ name, size = 34, imageUrl }: { name: string; size?: number; imageUrl?: string | null }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  // A real face when we hold one, initials when we do not. Never a stand-in photo: 29% of
  // artists have no exact Deezer match, and a letter is honest where another act's face
  // would be a claim we cannot back.
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.avatar, box]} contentFit="cover" transition={120} />;
  }
  return (
    <View style={[styles.avatar, box, { backgroundColor: avatarColor(name) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

export default function EventDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  // The artist page opened from the line-up. Same nesting the artist page itself uses
  // for its similar-artists strip, so tapping through feels identical wherever you are.
  const [artistName, setArtistName] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutLines, setAboutLines] = useState<number | null>(null);
  const { isSaved, toggle } = useSaves();
  const [going, setGoing] = useState<Going | null>(null);
  const [places, setPlaces] = useState<NearbyPlaces | null>(null);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [goingOpen, setGoingOpen] = useState(false);
  const [invitedToast, setInvitedToast] = useState<string | null>(null);
  const { homeCountry, homeCity } = useProfile();

  useEffect(() => {
    setLoading(true); setError(null); setEv(null); setShowWhy(false); setShowTrust(false);
    setAboutOpen(false); setAboutLines(null);
    fetchEvent(id).then(setEv).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, [id]);

  // Asked separately from the event itself, and after it: it needs the caller's identity where
  // the event does not, and a slow or failed social lookup must never keep the show off screen.
  useEffect(() => {
    let alive = true;
    getGoing(id).then((g) => { if (alive) setGoing(g); });
    // The first person to open a given venue waits on Overpass; everybody after them does not,
    // because the server caches it for 90 days.
    setPlacesLoading(true);
    getNearbyPlaces(id).then((p) => {
      if (!alive) return;
      setPlaces(p);
      setPlacesLoading(false);
    });
    return () => { alive = false; };
  }, [id]);

  async function onShare() {
    if (!ev) return;
    try {
      await Share.share({ message: `${ev.title} — ${ev.venue_name ?? ""}${ev.city ? `, ${ev.city}` : ""}` });
    } catch {}
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={ACCENT} size="large" /></View>;
  if (error) return <View style={styles.centerPad}><Text style={styles.error}>{error}</Text></View>;
  if (!ev) return null;

  const saved = isSaved(ev.id);
  const scheduled = ev.status === "scheduled";
  const offer = ev.offers.find((o) => o.is_official) ?? ev.offers[0];
  const sourceLink = ev.facts?.find((f) => f.source_url)?.source_url ?? offer?.url ?? null;
  const isAbroad = !!(ev.country && homeCountry && ev.country !== homeCountry);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* hero */}
        <View style={styles.hero}>
          {ev.image_url ? (
            <Image source={{ uri: ev.image_url }} style={styles.fill} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.fill, { backgroundColor: coverColor(ev.id) }]} />
          )}
          <Pressable style={[styles.heroBtn, { left: 12 }]} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Pressable style={[styles.heroBtn, { right: 12 }]} onPress={onShare} hitSlop={8}>
            <Ionicons name="share-outline" size={20} color="#fff" />
          </Pressable>
          {/* A scrim, so chips over a bright photo stay readable. Without it the genre
              text sat directly on the artwork and vanished on pale images. */}
          <LinearGradient
            colors={["transparent", "rgba(11,11,15,0.35)", "rgba(11,11,15,0.92)"]}
            style={styles.heroScrim}
            pointerEvents="none"
          />
          {!scheduled && (
            <View style={styles.statusBadge}><Text style={styles.statusText}>{ev.status.toUpperCase()}</Text></View>
          )}
          {/* Genres belong on the artwork: they say what KIND of night this is, which is
              the first thing you want while looking at the picture — not a footnote below
              a paragraph of prose. */}
          {ev.genres.length > 0 && (
            <View style={[styles.heroChips, !scheduled && { bottom: 46 }]}>
              {ev.genres.slice(0, 3).map((g) => (
                <View key={g} style={styles.heroChip}><Text style={styles.heroChipText}>{g}</Text></View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.body}>
          {countdown(ev.starts_at) ? (
            <View style={styles.cdPill}><Text style={styles.cdText}>{countdown(ev.starts_at)}</Text></View>
          ) : null}
          <Text style={styles.title}>{ev.title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={15} color={MUTED} />
            <Text style={styles.meta}>{fmtDate(ev.starts_at)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color={MUTED} />
            <Text style={styles.meta}>
              {ev.venue_name ?? "Venue TBA"}{ev.city ? `  ·  ${flagEmoji(ev.country)} ${ev.city}` : ""}
            </Text>
          </View>

          {/* action row */}
          <View style={styles.segrow}>
            <Pressable style={styles.segcell} onPress={() => setShowWhy((v) => !v)}>
              <Text style={styles.segScore}>{ev.mxs != null ? ev.mxs.toFixed(1) : "—"}</Text>
              <Text style={styles.segLabel}>Rating</Text>
            </Pressable>
            <Pressable style={[styles.segcell, saved && styles.segcellOn]} onPress={() => toggle(ev)}>
              <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? ACCENT : "#f4f4f6"} />
              <Text style={[styles.segLabel, saved && styles.segLabelOn]}>{saved ? "Saved" : "Save"}</Text>
            </Pressable>
            {/* Beside Save, before Share: inviting somebody is a decision about this show,
                where Share is a generic escape hatch to any app on the phone. */}
            <Pressable style={styles.segcell} onPress={() => setInviteOpen(true)}>
              <Ionicons name="person-add-outline" size={20} color="#f4f4f6" />
              <Text style={styles.segLabel}>Invite</Text>
            </Pressable>
            {/* Share used to sit here as well. Two share buttons on one screen is one
                button too many: the header already has it, at the top right, where every other
                screen in the app puts it. Invite takes the place it was occupying. */}
          </View>

          {/* MXS "why" meter */}
          {showWhy && (
            <View style={styles.whyBox}>
              {ev.mxs != null ? (
                <>
                  <View style={styles.barRow}>
                    <Text style={styles.barLabel}>Line-up popularity</Text>
                    <Text style={styles.barVal}>{ev.mxs.toFixed(1)}</Text>
                  </View>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${ev.mxs * 10}%` }]} /></View>
                  <Text style={styles.whyText}>
                    Based on the headliner's following — {fmtFans(ev.mxs_breakdown)} on Deezer. Bigger, more in-demand acts
                    score higher. This scores the <Text style={{ fontWeight: "800" }}>show</Text>, never you — and it can
                    never be bought.
                  </Text>
                </>
              ) : (
                <Text style={styles.whyText}>
                  We don't have enough trusted info to rate this yet — so we show no rating rather than a guess. Save it and
                  we'll update you.
                </Text>
              )}
            </View>
          )}

          {/* Directly under the rating, because it answers the same question in a different
              currency: the score says whether the show is good, this says whether anyone you
              know will be there. */}
          <GoingRow going={going} onPress={() => setGoingOpen(true)} />

          {invitedToast ? (
            <View style={styles.invited}>
              <Ionicons name="checkmark-circle" size={15} color="#7ef0b2" />
              <Text style={styles.invitedText}>{invitedToast}</Text>
            </View>
          ) : null}

          {/* line-up widget */}
          {ev.lineup.length > 0 && (
            <>
              <Text style={styles.section}>Line-up</Text>
              {/* One artist means there is no list to choose from, so the card goes straight
                  to their page. A real bill opens the full line-up first. */}
              <Pressable
                style={styles.lineupCard}
                onPress={() =>
                  ev.lineup.length > 1
                    ? setLineupOpen(true)
                    : setArtistName(ev.lineup[0].name)
                }
              >
                <View style={styles.avStack}>
                  {ev.lineup.slice(0, 3).map((a, i) => (
                    <View key={i} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 3 - i }}>
                      <Avatar name={a.name} imageUrl={a.image_url} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineupTitle} numberOfLines={1}>{lineupTitle(ev)}</Text>
                  <Text style={styles.lineupSub}>
                    {ev.lineup.length > 1
                      ? `${ev.lineup.length} artists · tap for full line-up`
                      : ev.lineup[0].is_headliner ? "Headliner · tap for their page" : "Tap for their page"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              </Pressable>
            </>
          )}

          {/* about */}
          <Text style={styles.section}>About the event</Text>
          <Text
            style={styles.about}
            numberOfLines={aboutLines != null && aboutLines > 5 ? 5 : undefined}
            onTextLayout={(e) => {
              if (aboutLines == null) setAboutLines(e.nativeEvent.lines.length);
            }}
          >
            {aboutText(ev)}
          </Text>
          {aboutLines != null && aboutLines > 5 ? (
            <Pressable style={styles.readMore} onPress={() => setAboutOpen(true)}>
              <Text style={styles.readMoreText}>Read more</Text>
              <Ionicons name="chevron-forward" size={14} color={ACCENT} />
            </Pressable>
          ) : aboutCredit(ev) ? (
            <Text style={styles.aboutSource}>ⓘ {aboutCredit(ev)}</Text>
          ) : null}

          {/* Plan your trip — the mockup's three tabs, with the venue map as one of them.
              It replaced a standalone Venue section now that flights and hotels have a data
              path: the map opens first because it is the one tab that always has an answer,
              so the card is never introduced by an apology.

              The map is still drawn only when the venue's location is actually known. 0,0 is
              excluded explicitly — 8 venues carry it and it is the Atlantic off Africa, not
              a missing value a null check would catch. Deliberately NOT excluded: a venue
              far from its recorded city. That looks like the bug and usually is not — of the
              four worst, three had the VENUE right to within a kilometre while the CITY was
              wrong (Hollywood holding Florida's coordinates, Portland holding Oregon's).
              Dropping those maps would discard correct ones. */}
          {/* Before the trip card, as the mockup orders it: what is around the venue is a
              reason to go early, and it should be read before the logistics of getting there.
              Renders nothing at all when we know neither the venue's location nor a city to
              search — an empty heading is worse than no heading. */}
          <AroundVenue places={places} loading={placesLoading} />

          {/* Bookable activities, which is a different thing from the free places above and is
              kept in its own card for exactly that reason: everything in "Around the venue" is
              unpaid, and this one pays us. Merging them would put a commissioned list and an
              uncommissioned one under one heading and one disclosure, which is the kind of blur
              the app's covenant exists to prevent.

              Coordinates are passed because the component's map fallback uses them. The widget
              itself cannot take them — verified against the live endpoint, which ignores
              latitude/longitude entirely — so it is asked for the venue and city by name. */}
          <ExploreNearby
            lat={ev.venue_lat ?? null}
            lng={ev.venue_lng ?? null}
            venueName={ev.venue_name}
            city={ev.city}
            places={places}
            // The show's own currency where the seller published one, so an activity price
            // sits in the same money as the ticket beside it.
            currency={ev.price_from_currency ?? "EUR"}
          />

          <PlanTrip
            eventId={ev.id}
            venueName={ev.venue_name}
            city={ev.city}
            lat={ev.venue_lat ?? null}
            lng={ev.venue_lng ?? null}
            homeCity={homeCity}
          />

          {isAbroad ? (
            <View style={styles.abroad}>
              <Ionicons name="airplane-outline" size={16} color="#f0d47e" />
              <Text style={styles.abroadText}>
                This show is in {countryName(ev.country)}. Tickets sell on {countryName(ev.country)}’s official
                site — booking may not be available from {countryName(homeCountry)}.
              </Text>
            </View>
          ) : null}

          <View style={styles.greenLine}>
            <Ionicons name="shield-checkmark" size={14} color={GREEN} />
            <Text style={styles.greenText}>We never sell tickets or add a markup — the button below opens the official seller.</Text>
          </View>

          {/* how we know this — the real receipts, one row per sourced fact */}
          <Pressable style={styles.trustCard} onPress={() => setShowTrust((v) => !v)}>
            <View style={styles.trustHead}>
              <Ionicons name="checkmark-circle" size={16} color={confColor(ev.confidence)} />
              <Text style={styles.trustTitle}>How we know this</Text>
              <Ionicons name={showTrust ? "chevron-up" : "chevron-down"} size={14} color={MUTED} style={{ marginLeft: "auto" }} />
            </View>

            <Text style={styles.trustSummary}>
              {CONF_LABEL[ev.confidence ?? "low"]} · last checked{" "}
              {ev.last_verified ? fmtDate(ev.last_verified) : "not yet"}
              {ev.facts?.length ? ` · ${ev.facts.length} detail${ev.facts.length === 1 ? "" : "s"} traced to a source` : ""}
            </Text>

            {showTrust && (
              <View style={{ marginTop: 12 }}>
                {ev.facts?.length ? (
                  ev.facts.map((f) => (
                    <View key={f.key} style={styles.factRow}>
                      <Text style={styles.factLabel}>{f.label}</Text>
                      <Text style={styles.factValue}>{f.display}</Text>
                      <View style={styles.factSrc}>
                        <View style={[styles.tierDot, { backgroundColor: f.derived ? WARN : GREEN }]} />
                        <Text style={styles.factSrcText}>
                          {f.source_name ?? "source"}
                          {f.last_verified ? ` · checked ${fmtDate(f.last_verified)}` : ""}
                          {f.derived ? " · read from the listing text" : ""}
                        </Text>
                      </View>
                      {f.derived && f.snapshot ? (
                        <Text style={styles.factProof} numberOfLines={2}>“…{f.snapshot}…”</Text>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text style={styles.trustBody}>
                    We have no per-detail sources on record for this show yet. It will fill in the
                    next time we re-check it against the seller.
                  </Text>
                )}

                {ev.missing_facts?.length ? (
                  <View style={styles.gapBox}>
                    <Text style={styles.gapTitle}>Not published by the source</Text>
                    <Text style={styles.gapBody}>
                      {ev.missing_facts.map((m) => m.label).join(" · ")}
                    </Text>
                    <Text style={styles.gapNote}>
                      We could fill these in from a similar show and you would never know. We leave
                      them blank instead — check with the venue.
                    </Text>
                  </View>
                ) : null}

                {sourceLink ? (
                  <Pressable style={styles.srcBtn} onPress={() => Linking.openURL(sourceLink)}>
                    <Ionicons name="open-outline" size={14} color={ACCENT} />
                    <Text style={styles.srcBtnText}>See the source listing</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* sticky ticket bar */}
      <View style={styles.ticketBar}>
        {scheduled && offer ? (
          <>
            {ev.price_from_amount != null ? (
              <View>
                <Text style={styles.ticketCap}>Tickets from</Text>
                <Text style={styles.ticketPrice}>{ev.price_from_currency ?? ""} {ev.price_from_amount}</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.ticketCap}>Official tickets</Text>
                <Text style={styles.ticketVia}>via Ticketmaster</Text>
              </View>
            )}
            <Pressable style={styles.ticketBtn} onPress={() => offer.url && Linking.openURL(offer.url)}>
              <Ionicons name="ticket-outline" size={16} color="#0b0b0f" />
              <Text style={styles.ticketBtnText}>Get tickets</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.ticketStatus}>
            {scheduled ? "No official seller listed yet." : ev.status === "cancelled" ? "This show was cancelled." : "This show is postponed."}
          </Text>
        )}
      </View>

      {/* full "about" sheet */}
      <Modal visible={aboutOpen} transparent animationType="slide" onRequestClose={() => setAboutOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setAboutOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>About the event</Text>
              <Pressable onPress={() => setAboutOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={MUTED} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.aboutFull}>{aboutText(ev)}</Text>
              {aboutCredit(ev) ? <Text style={styles.aboutSource}>ⓘ {aboutCredit(ev)}</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* full line-up sheet */}
      <Modal visible={lineupOpen} transparent animationType="slide" onRequestClose={() => setLineupOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setLineupOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Line-up</Text>
            <Text style={styles.sheetSub}>
              {ev.title} · {ev.lineup.length} artist{ev.lineup.length > 1 ? "s" : ""} · tap an artist for their page
            </Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {ev.lineup.map((a, i) => (
                <Pressable
                  key={i}
                  style={styles.artistRow}
                  onPress={() => { setLineupOpen(false); setArtistName(a.name); }}
                >
                  <Avatar name={a.name} size={40} imageUrl={a.image_url} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>{a.name}</Text>
                    <Text style={[styles.artistRole, a.is_headliner && styles.artistRoleHead]}>
                      {a.is_headliner ? "Headliner" : "Support"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={MUTED} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* The artist page, reached from the line-up. Rendered after the sheet so it stacks
          above it, and onClose returns you to the event rather than dumping you home. */}
      <Modal visible={!!artistName} animationType="slide" onRequestClose={() => setArtistName(null)}>
        {artistName ? (
          <ArtistDetail name={artistName} onClose={() => setArtistName(null)} />
        ) : null}
      </Modal>

      <GoingSheet
        visible={goingOpen}
        onClose={() => setGoingOpen(false)}
        going={going}
        eventTitle={ev?.title ?? null}
      />

      <InviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        eventId={id}
        eventTitle={ev?.title ?? null}
        onSent={(n) => {
          // Re-read after sending: somebody who was already going should join the line
          // immediately rather than on the next open.
          getGoing(id).then(setGoing);
          setInvitedToast(
            n > 0 ? `Invited ${n} ${n === 1 ? "person" : "people"}` : "They were already invited",
          );
          setTimeout(() => setInvitedToast(null), 4000);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  center: { flex: 1, backgroundColor: "#0b0b0f", alignItems: "center", justifyContent: "center", padding: 40 },
  centerPad: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", padding: 40 },
  error: { color: "#ff6b6b", fontSize: 14, textAlign: "center" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

  hero: { width: "100%", height: 280 },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 130 },
  heroChips: { position: "absolute", left: 16, right: 16, bottom: 14, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  heroChip: { backgroundColor: "rgba(11,11,15,0.62)", borderColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  heroChipText: { color: "#f4f4f6", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  heroBtn: { position: "absolute", top: 44, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  statusBadge: { position: "absolute", bottom: 14, left: 16, backgroundColor: "#ff6b6b", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  body: { padding: 16 },
  cdPill: { alignSelf: "flex-start", backgroundColor: "#1b1b24", borderColor: "#2a2a38", borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, marginBottom: 8 },
  cdText: { color: ACCENT, fontSize: 12, fontWeight: "800" },
  title: { color: "#f4f4f6", fontSize: 25, fontWeight: "800", marginBottom: 10, lineHeight: 30 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  meta: { color: "#c8c8d0", fontSize: 14, flex: 1 },

  segrow: { flexDirection: "row", gap: 10, marginTop: 16 },
  segcell: { flex: 1, backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 5, minHeight: 62, justifyContent: "center" },
  segcellOn: { borderColor: ACCENT },
  segScore: { color: ACCENT, fontSize: 20, fontWeight: "800" },
  segLabel: { color: "#c8c8d0", fontSize: 12, fontWeight: "700" },
  // The confirmation after sending. A sheet that just closes leaves somebody wondering whether
  // it worked, and an invite is not something to be unsure about.
  invited: {
    flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10,
    backgroundColor: "rgba(126,240,178,0.10)", borderRadius: 11,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  invitedText: { color: "#7ef0b2", fontSize: 13, fontWeight: "700", flex: 1 },
  segLabelOn: { color: ACCENT },

  whyBox: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  barRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { color: "#c8c8d0", fontSize: 13, fontWeight: "600" },
  barVal: { color: ACCENT, fontSize: 13, fontWeight: "800" },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: "#26262f", overflow: "hidden" },
  barFill: { height: 7, borderRadius: 4, backgroundColor: ACCENT },
  whyText: { color: "#c8c8d0", fontSize: 13, lineHeight: 19, marginTop: 12 },

  section: { color: "#f4f4f6", fontSize: 17, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  lineupCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 14, padding: 12 },
  avStack: { flexDirection: "row" },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#14141b" },
  avatarText: { color: "#fff", fontWeight: "800" },
  lineupTitle: { color: "#f4f4f6", fontSize: 15, fontWeight: "800" },
  lineupSub: { color: MUTED, fontSize: 12, marginTop: 2 },
  about: { color: "#c8c8d0", fontSize: 14, lineHeight: 21 },
  aboutFull: { color: "#c8c8d0", fontSize: 15, lineHeight: 23 },
  readMore: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8 },
  readMoreText: { color: ACCENT, fontSize: 14, fontWeight: "700" },
  aboutSource: { color: MUTED, fontSize: 11, marginTop: 8, fontStyle: "italic" },


  abroad: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#1f1b10", borderColor: "#3a3320", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 22 },
  abroadText: { color: "#e8d9a8", fontSize: 12.5, lineHeight: 18, flex: 1 },
  greenLine: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 16 },
  greenText: { color: GREEN, fontSize: 12, flex: 1, lineHeight: 17 },

  trustCard: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, borderRadius: 14, padding: 15, marginTop: 16 },
  trustHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  trustTitle: { color: "#f4f4f6", fontSize: 14, fontWeight: "700" },
  trustSummary: { color: MUTED, fontSize: 12.5, lineHeight: 18, marginTop: 9 },
  factRow: { borderTopColor: "#26262f", borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  factLabel: { color: MUTED, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  factValue: { color: "#f4f4f6", fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  factSrc: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  tierDot: { width: 6, height: 6, borderRadius: 3 },
  factSrcText: { color: MUTED, fontSize: 11, flex: 1 },
  factProof: { color: "#8f8f9c", fontSize: 11, fontStyle: "italic", marginTop: 4, lineHeight: 15 },
  gapBox: { backgroundColor: "#101017", borderColor: "#26262f", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14 },
  gapTitle: { color: WARN, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  gapBody: { color: "#e2e2e8", fontSize: 13, lineHeight: 19, marginTop: 5 },
  gapNote: { color: MUTED, fontSize: 11.5, lineHeight: 16.5, marginTop: 7 },
  srcBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  srcBtnText: { color: ACCENT, fontSize: 12.5, fontWeight: "700" },
  trustBody: { color: "#c8c8d0", fontSize: 13, lineHeight: 19, marginTop: 12 },

  ticketBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#101016", borderTopColor: "#26262f", borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 26 },
  ticketCap: { color: MUTED, fontSize: 11, fontWeight: "600" },
  ticketPrice: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  ticketVia: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  ticketBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  ticketBtnText: { color: "#0b0b0f", fontSize: 15, fontWeight: "800" },
  ticketStatus: { color: MUTED, fontSize: 14, fontWeight: "600" },

  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#14141b", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34, borderTopWidth: 1, borderColor: "#26262f" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#3a3a46", marginBottom: 12 },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sheetTitle: { color: "#f4f4f6", fontSize: 18, fontWeight: "800" },
  sheetSub: { color: MUTED, fontSize: 13, marginTop: 2, marginBottom: 10 },
  artistRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1c1c24" },
  artistName: { color: "#f4f4f6", fontSize: 15, fontWeight: "700" },
  artistRole: { color: MUTED, fontSize: 12, marginTop: 2 },
  artistRoleHead: { color: ACCENT, fontWeight: "700" },
});
