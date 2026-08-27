import { useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Stay } from "../lib/api";
import { metresBetween, TILE, tileGrid, zoomToFit } from "../lib/slippy";

const ACCENT = "#e8ff47";
const INK = "#17171c";
const LINE = "#26262f";
/** The tiles' own paper colour, so the frame matches while they load rather than flashing. */
const TILE_BG = "#e8e2d9";
/** Hotel pills. Red is the convention for lodging on a map and it reads at a glance against
 *  a light basemap — the venue keeps the app's accent so the anchor stays distinguishable. */
const HOTEL = "#c5321f";
const HEIGHT = 300;

/** Every hotel we can place, not a curated few.
 *
 *  An earlier version showed eight, reasoning that twenty pins on a phone-width map is a
 *  smear. The reference disagrees: Google's hotel search draws every result and lets them
 *  overlap, because the value is in the SHAPE of the cluster — where the hotels are, and what
 *  they cost — not in reading each label. Twenty is what the search returns.
 */
const MAX_PINS = 20;

/** Exact, with separators: ₹1,148 as the reference shows, not a rounded ₹1k.
 *
 *  Rounding to thousands was the wrong economy. The whole point of a price on a pin is
 *  comparing one against another, and ₹1k beside ₹2k hides that they are ₹1,148 and ₹1,865.
 */
function priceLabel(s: Stay): string | null {
  if (s.price_amount == null) return null;
  const sym = s.price_currency === "INR" ? "₹"
    : s.price_currency === "GBP" ? "£"
    : s.price_currency === "EUR" ? "€"
    : s.price_currency === "USD" ? "$" : "";
  return `${sym}${Math.round(s.price_amount).toLocaleString()}`;
}

export default function StayMap({
  lat,
  lng,
  venue,
  stays,
}: {
  lat: number;
  lng: number;
  venue: string | null;
  stays: Stay[];
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  // Only hotels we can actually place. One without coordinates gets no pin rather than a pin
  // at an arbitrary spot — a hotel in the wrong street is worse than a hotel not shown.
  const placeable = stays
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ ...s, away: metresBetween(lat, lng, s.lat!, s.lng!) }))
    .sort((a, b) => b.away - a.away)      // furthest first, so the NEAREST draw on top
    .slice(-MAX_PINS);

  // Fit the furthest pin so nothing sits silently off the edge, with a floor of 1.2 km so a
  // cluster of hotels next door does not zoom into a single street.
  const furthest = placeable.length ? Math.max(...placeable.map((s) => s.away)) : 600;
  const zoom = zoomToFit(Math.max(furthest * 2.4, 1200), width || 340);
  const grid = width > 0 ? tileGrid(lat, lng, zoom, width, HEIGHT) : null;

  return (
    <View style={styles.frame} onLayout={onLayout}>
      {grid ? (
        <View style={[styles.grid, { left: grid.gridLeft, top: grid.gridTop }]}>
          {grid.tiles.map((t) => (
            <Image key={t.key} source={{ uri: t.url }}
                   style={[styles.tile, { left: t.left, top: t.top }]} />
          ))}
        </View>
      ) : null}

      {grid
        ? placeable.map((s, i) => {
            const p = grid.project(s.lat!, s.lng!);
            const label = priceLabel(s);
            return (
              <View key={`${s.name}-${i}`} style={[styles.pinWrap, { left: p.x, top: p.y }]}>
                <View style={styles.pill}>
                  <Ionicons name="bed" size={10} color="#fff" />
                  {label ? <Text style={styles.pillText}>{label}</Text> : null}
                </View>
                {/* The tail, so the pill points at its coordinate instead of floating over
                    it — the same reason the venue marker has one. */}
                <View style={styles.tailWrap}><View style={styles.tail} /></View>
              </View>
            );
          })
        : null}

      {grid ? (
        <View style={styles.venueLayer} pointerEvents="none">
          <View style={styles.venuePill}>
            <Ionicons name="musical-notes" size={13} color={INK} />
            <Text style={styles.venueText} numberOfLines={1}>{venue || "Venue"}</Text>
          </View>
          <View style={styles.venueTailWrap}><View style={styles.venueTail} /></View>
        </View>
      ) : null}

      <Text style={styles.attr}>© OpenStreetMap</Text>
      {placeable.length ? (
        <Text style={styles.count}>{placeable.length} stays near the venue</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative", height: HEIGHT, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: LINE, backgroundColor: TILE_BG, marginTop: 14,
  },
  grid: { position: "absolute" },
  tile: { position: "absolute", width: TILE, height: TILE },

  // Anchored so the TAIL sits on the coordinate: the pill is lifted by its own height, and
  // centred horizontally by half its minimum width.
  pinWrap: { position: "absolute", alignItems: "center", marginLeft: -30, marginTop: -30, zIndex: 2 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: HOTEL, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6,
    minWidth: 60, justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  pillText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  tailWrap: { width: 10, height: 5, alignItems: "center", overflow: "hidden" },
  tail: { width: 8, height: 8, backgroundColor: HOTEL, transform: [{ rotate: "45deg" }], marginTop: -5 },

  venueLayer: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 5,
    alignItems: "center", justifyContent: "center",
  },
  venuePill: {
    flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "70%",
    backgroundColor: ACCENT, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  venueText: { color: INK, fontSize: 11, fontWeight: "800", flexShrink: 1 },
  venueTailWrap: { width: 20, height: 8, alignItems: "center", overflow: "hidden", marginTop: -1 },
  venueTail: { width: 12, height: 12, backgroundColor: ACCENT, transform: [{ rotate: "45deg" }], marginTop: -7 },

  attr: {
    position: "absolute", right: 6, bottom: 5, zIndex: 6, fontSize: 9,
    color: "rgba(0,0,0,0.6)", backgroundColor: "rgba(255,255,255,0.75)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
  count: {
    position: "absolute", left: 6, bottom: 5, zIndex: 6, fontSize: 9,
    color: "rgba(0,0,0,0.6)", backgroundColor: "rgba(255,255,255,0.75)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
});
