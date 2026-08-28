import { useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Place } from "../lib/api";
import { metresBetween, TILE, tileGrid, zoomToFit } from "../lib/slippy";

const ACCENT = "#e8ff47";
const INK = "#17171c";
const LINE = "#26262f";
/** The tiles' own paper colour, so the frame matches while they load rather than flashing. */
const TILE_BG = "#e8e2d9";
/** Height follows width rather than being fixed. At phone width 260px is a good frame; on a
 *  wide browser the same number is a 1456x260 letterbox with the pins squashed into a strip.
 *  Clamped so it never gets so tall that the button below falls off the screen. */
const MIN_H = 230;
const MAX_H = 330;
const ASPECT = 0.52;
const heightFor = (w: number) =>
  Math.round(Math.min(MAX_H, Math.max(MIN_H, (w || 340) * ASPECT)));

/** Blue for somewhere to go, red for somewhere to eat — the same red the hotel map uses for
 *  lodging, because a person reading two maps in one app should not have to relearn the
 *  colours. The venue keeps the accent so the anchor is never in doubt. */
const DO = "#3f6fd8";
const EAT = "#c5321f";

/** Enough to read the shape of the neighbourhood; more is a smear at phone width. */
const MAX_PINS = 14;

const ICONS: Record<string, string> = {
  cafe: "cafe", restaurant: "restaurant", fast_food: "fast-food", bar: "wine", pub: "beer",
  biergarten: "beer", ice_cream: "ice-cream", park: "leaf", garden: "leaf", museum: "business",
  gallery: "color-palette", artwork: "brush", memorial: "flag", monument: "flag",
  viewpoint: "eye", attraction: "star", theatre: "film", cinema: "film", zoo: "paw",
  aquarium: "fish", castle: "shield", ruins: "shield",
};

/**
 * The neighbourhood around a venue, as a map.
 *
 * Same tiles, same projection and the same zoom-to-fit as the hotel map, deliberately: a list
 * tells you what is nearby, a map tells you whether it is all in one direction or scattered —
 * and that is the thing a list cannot say however long it gets.
 */
export default function PlacesMap({
  lat, lng, venue, places,
}: {
  lat: number;
  lng: number;
  venue: string | null;
  places: Place[];
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const height = heightFor(width);

  // Nearest first, then capped — the far ones are the least useful and the most likely to
  // stretch the map until the venue's own street is unreadable.
  const placeable = places
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ ...p, away: metresBetween(lat, lng, p.lat, p.lng) }))
    .sort((a, b) => a.away - b.away)
    .slice(0, MAX_PINS)
    .reverse();          // furthest drawn first, so the nearest sit on top

  const furthest = placeable.length ? Math.max(...placeable.map((p) => p.away)) : 500;
  const zoom = zoomToFit(Math.max(furthest * 2.4, 900), width || 340);
  const grid = width > 0 ? tileGrid(lat, lng, zoom, width, height) : null;

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      {grid ? (
        <View style={[styles.grid, { left: grid.gridLeft, top: grid.gridTop }]}>
          {grid.tiles.map((t) => (
            <Image key={t.key} source={{ uri: t.url }}
                   style={[styles.tile, { left: t.left, top: t.top }]} />
          ))}
        </View>
      ) : null}

      {grid
        ? placeable.map((p, i) => {
            const pt = grid.project(p.lat, p.lng);
            const eat = p.category in ICONS && ["cafe", "restaurant", "fast_food", "bar", "pub",
              "biergarten", "ice_cream"].includes(p.category);
            const colour = eat ? EAT : DO;
            return (
              <View key={`${p.name}-${i}`} style={[styles.pinWrap, { left: pt.x, top: pt.y }]}>
                <View style={[styles.pin, { backgroundColor: colour }]}>
                  <Ionicons name={(ICONS[p.category] ?? "location") as any} size={11} color="#fff" />
                </View>
                {/* The tail, so the pin points at its coordinate rather than floating over it. */}
                <View style={styles.tailWrap}>
                  <View style={[styles.tail, { backgroundColor: colour }]} />
                </View>
              </View>
            );
          })
        : null}

      {grid ? (
        <View style={styles.venueLayer} pointerEvents="none">
          <View style={styles.venuePill}>
            <Ionicons name="musical-notes" size={12} color={INK} />
            <Text style={styles.venueText} numberOfLines={1}>{venue || "Venue"}</Text>
          </View>
          <View style={styles.venueTailWrap}><View style={styles.venueTail} /></View>
        </View>
      ) : null}

      <Text style={styles.attr}>© OpenStreetMap</Text>
      {placeable.length ? (
        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: DO }]} />
          <Text style={styles.legendText}>To see</Text>
          <View style={[styles.dot, { backgroundColor: EAT, marginLeft: 8 }]} />
          <Text style={styles.legendText}>To eat</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative", borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: LINE, backgroundColor: TILE_BG, marginTop: 4,
  },
  grid: { position: "absolute" },
  tile: { position: "absolute", width: TILE, height: TILE },

  // Anchored so the TAIL lands on the coordinate: lifted by its own height, centred by half
  // its width.
  pinWrap: { position: "absolute", alignItems: "center", marginLeft: -13, marginTop: -30, zIndex: 2 },
  pin: {
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  tailWrap: { width: 10, height: 5, alignItems: "center", overflow: "hidden" },
  tail: { width: 8, height: 8, transform: [{ rotate: "45deg" }], marginTop: -5 },

  venueLayer: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 5,
    alignItems: "center", justifyContent: "center",
  },
  venuePill: {
    flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "72%",
    backgroundColor: ACCENT, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  venueText: { color: INK, fontSize: 11.5, fontWeight: "800", flexShrink: 1 },
  venueTailWrap: { width: 20, height: 8, alignItems: "center", overflow: "hidden", marginTop: -1 },
  venueTail: { width: 12, height: 12, backgroundColor: ACCENT, transform: [{ rotate: "45deg" }], marginTop: -7 },

  attr: {
    position: "absolute", right: 6, bottom: 5, zIndex: 6, fontSize: 9,
    color: "rgba(0,0,0,0.6)", backgroundColor: "rgba(255,255,255,0.75)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
  legend: {
    position: "absolute", left: 6, bottom: 5, zIndex: 6, flexDirection: "row",
    alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.82)",
    paddingVertical: 3, paddingHorizontal: 7, borderRadius: 7,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 9.5, fontWeight: "800", color: "rgba(0,0,0,0.7)" },
});
