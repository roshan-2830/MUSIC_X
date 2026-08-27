import { useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Stay } from "../lib/api";
import { metresBetween, tileGrid, TILE, zoomToFit } from "../lib/slippy";

const ACCENT = "#e8ff47";
const INK = "#17171c";
const LINE = "#26262f";
const TILE_BG = "#e8e2d9";
const HEIGHT = 220;

/** How many hotels get a pin. Twenty came back and twenty pins is a smear, not a map — the
 *  nearest few answer the only question this map is asked: "is there anywhere by the venue?" */
const MAX_PINS = 8;

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

  // Only hotels we can actually place. One with no coordinates is not a pin at an arbitrary
  // spot — it is a hotel this map cannot show, and the count below says so.
  const placeable = stays
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ ...s, away: metresBetween(lat, lng, s.lat!, s.lng!) }))
    .sort((a, b) => a.away - b.away)
    .slice(0, MAX_PINS);

  // Fit the furthest pin, so nothing sits silently off the edge.
  const span = placeable.length ? Math.max(...placeable.map((s) => s.away)) * 2.2 : 1500;
  const zoom = zoomToFit(span, width || 340);
  const grid = width > 0 ? tileGrid(lat, lng, zoom, width, HEIGHT) : null;

  const money = (s: Stay) =>
    s.price_amount == null ? null
      : s.price_currency === "INR" ? `₹${Math.round(s.price_amount / 1000)}k`
      : `${Math.round(s.price_amount)}`;

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

      {/* Hotels first so the venue marker draws on top of them — the venue is the anchor the
          whole map is about, and a hotel pin covering it would hide the point. */}
      {grid
        ? placeable.map((s, i) => {
            const p = grid.project(s.lat!, s.lng!);
            const label = money(s);
            return (
              <View key={`${s.name}-${i}`} style={[styles.hotelWrap, { left: p.x, top: p.y }]}>
                <View style={styles.hotelPin}>
                  {label ? (
                    <Text style={styles.hotelPinText}>{label}</Text>
                  ) : (
                    <Ionicons name="bed" size={10} color="#fff" />
                  )}
                </View>
              </View>
            );
          })
        : null}

      {grid ? (
        <View style={styles.venueWrap} pointerEvents="none">
          <View style={styles.venuePin}>
            <Ionicons name="musical-notes" size={13} color={INK} />
            <Text style={styles.venuePinText} numberOfLines={1}>{venue || "Venue"}</Text>
          </View>
          <View style={styles.pointerWrap}><View style={styles.pointer} /></View>
        </View>
      ) : null}

      <Text style={styles.attr}>© OpenStreetMap · CARTO</Text>
      {placeable.length ? (
        <Text style={styles.count}>
          {placeable.length} of {stays.length} nearest
        </Text>
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

  // Placed by its centre, so the pin sits ON the coordinate rather than beside it.
  hotelWrap: { position: "absolute", marginLeft: -19, marginTop: -11, zIndex: 2 },
  hotelPin: {
    minWidth: 38, alignItems: "center", justifyContent: "center",
    backgroundColor: "#17171c", borderColor: "#fff", borderWidth: 1.5,
    borderRadius: 999, paddingVertical: 3, paddingHorizontal: 7,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3, elevation: 3,
  },
  hotelPinText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  venueWrap: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 4,
    alignItems: "center", justifyContent: "center",
  },
  venuePin: {
    flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "72%",
    backgroundColor: ACCENT, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
    shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  venuePinText: { color: INK, fontSize: 11, fontWeight: "800", flexShrink: 1 },
  pointerWrap: { width: 20, height: 8, alignItems: "center", overflow: "hidden", marginTop: -1 },
  pointer: { width: 12, height: 12, backgroundColor: ACCENT, transform: [{ rotate: "45deg" }], marginTop: -7 },

  attr: {
    position: "absolute", right: 6, bottom: 5, zIndex: 5, fontSize: 9,
    color: "rgba(0,0,0,0.6)", backgroundColor: "rgba(255,255,255,0.7)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
  count: {
    position: "absolute", left: 6, bottom: 5, zIndex: 5, fontSize: 9,
    color: "rgba(0,0,0,0.6)", backgroundColor: "rgba(255,255,255,0.7)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
});
