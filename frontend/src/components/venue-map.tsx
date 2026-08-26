import { useState } from "react";
import { Image, LayoutChangeEvent, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const ACCENT = "#e8ff47";
const INK = "#1a1a20";
const LINE = "#26262f";
/** The ground colour of the tiles, so the frame matches while they load instead of
 *  flashing a black box on a light map. */
const TILE_BG = "#e8e2d9";

/** Street level — close enough to read the surrounding roads, wide enough to place the
 *  venue in its neighbourhood. */
const ZOOM = 16;
const TILE = 256;
const HEIGHT = 200;

/** Pin geometry. The POINT marks the venue, not the middle of the photo, so the whole
 *  assembly is lifted by half its height to sit the tip on the map centre. */
const PHOTO = 44;
const POINTER = 9;

/** CARTO's Voyager basemap, drawn from OpenStreetMap data. Plain images, no API key — and
 *  unlike an embed they cache with the screen, so a saved show-day kit still draws its map
 *  with no signal.
 *
 *  NOT tile.openstreetmap.org. Measured 2026-08-26: that host answers this app with HTTP
 *  200 and a 6,987-byte "Access denied" placeholder carrying an `x-blocked` header —
 *  identical bytes for every tile, whatever the User-Agent. Because the status is 200,
 *  nothing catches it; the map simply draws grey.
 *
 *  Voyager over CARTO's dark style because it is what the reference looks like: a cream
 *  ground, yellow main roads, white side streets, green parks. Compared against
 *  light_all (too grey) and OSM's own render (much pinker, busier) on the same Bengaluru
 *  tile before choosing.
 *
 *  One constant, so moving to a paid host (MapTiler, Thunderforest, Stadia) is a one-line
 *  change — worth doing before real traffic: CARTO's CDN is free for light use, not a
 *  licence for an app at scale.
 */
const TILE_URL = (z: number, x: number, y: number) =>
  `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;

/** Web Mercator: where this lat/lng falls, in pixels, across the whole world at this zoom. */
function worldPixel(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const r = (lat * Math.PI) / 180;
  return {
    n,
    x: ((lng + 180) / 360) * n * TILE,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE,
  };
}

type Props = {
  lat: number;
  lng: number;
  venue: string;
  city?: string | null;
  /** The headliner's photo, falling back to the event artwork. Together those cover every
   *  mappable event we hold — 56% have an artist photo, all have artwork. */
  imageUrl?: string | null;
};

export default function VenueMap({ lat, lng, venue, city, imageUrl }: Props) {
  // The grid has to be laid out in real pixels, and only the parent knows how wide the
  // card is. Until it reports, draw the frame and no tiles — never a half-placed map.
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const { n, x: px, y: py } = worldPixel(lat, lng, ZOOM);
  // Enough tiles to cover the box whatever its width, plus one either side so a partial
  // tile never leaves a gap at the edge.
  const cols = Math.ceil(width / TILE) + 2;
  const rows = Math.ceil(HEIGHT / TILE) + 2;
  const tx0 = Math.floor(px / TILE) - 1;
  const ty0 = Math.floor(py / TILE) - 1;
  // Put the grid's top-left at the box centre, then pull it back by where the venue sits
  // inside the grid — so the venue lands exactly in the middle.
  const left = width / 2 - (px - tx0 * TILE);
  const top = HEIGHT / 2 - (py - ty0 * TILE);

  const tiles = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const ty = ty0 + ry;
      // Above the north pole or below the south there is no tile. Wrap x so a venue near
      // the antimeridian still draws a continuous map.
      if (ty < 0 || ty >= n) continue;
      const tx = ((((tx0 + rx) % n) + n) % n);
      tiles.push(
        <Image
          key={`${rx}-${ry}`}
          source={{ uri: TILE_URL(ZOOM, tx, ty) }}
          style={[styles.tile, { left: rx * TILE, top: ry * TILE }]}
        />,
      );
    }
  }

  const directions = () =>
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${venue}${city ? `, ${city}` : ""}`,
      )}`,
    );

  return (
    <>
      <View style={styles.frame} onLayout={onLayout}>
        {width > 0 ? <View style={[styles.grid, { left, top }]}>{tiles}</View> : null}

        {/* Centred by a full-bleed flex layer rather than a percentage transform —
            percentage translate is a recent React Native addition, and getting it wrong
            would misplace the pin silently while the map underneath looked fine. */}
        <View style={styles.pinLayer} pointerEvents="none">
          <View style={styles.pinCol}>
            <View style={styles.photoRing}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoBlank]}>
                  <Ionicons name="location" size={20} color={INK} />
                </View>
              )}
            </View>
            {/* The tip. A square rotated 45° and clipped to its lower point — React Native
                has no polygon, and a rotated box is the one shape that gives a clean point. */}
            <View style={styles.pointerWrap}>
              <View style={styles.pointer} />
            </View>
          </View>
        </View>

        <Text style={styles.attr}>© OpenStreetMap · CARTO</Text>
      </View>

      <Pressable style={styles.dirRow} onPress={directions}>
        <Ionicons name="location-outline" size={18} color="#f4f4f6" />
        <Text style={styles.dirText}>Directions</Text>
        <Ionicons name="open-outline" size={16} color="#9a9aa6" />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative", height: HEIGHT, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: LINE, backgroundColor: TILE_BG,
  },
  grid: { position: "absolute" },
  // Full opacity: this is a light basemap shown as it was designed. The dark theme is
  // carried by the frame around it, not by dimming the map into illegibility.
  tile: { position: "absolute", width: TILE, height: TILE },

  pinLayer: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 3,
    alignItems: "center", justifyContent: "center",
  },
  // Lift the pin so the POINT lands on the map centre, not the photo's middle.
  pinCol: { alignItems: "center", transform: [{ translateY: -(PHOTO + POINTER) / 2 }] },
  photoRing: {
    width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, borderWidth: 3,
    borderColor: ACCENT, backgroundColor: ACCENT, overflow: "hidden", zIndex: 2,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  photo: { width: "100%", height: "100%" },
  photoBlank: { alignItems: "center", justifyContent: "center", backgroundColor: ACCENT },
  // Clips the rotated square to just its lower point, so no corners show past the ring.
  pointerWrap: { width: PHOTO, height: POINTER, alignItems: "center", overflow: "hidden", marginTop: -2 },
  pointer: {
    width: 14, height: 14, backgroundColor: ACCENT, transform: [{ rotate: "45deg" }],
    marginTop: -8,
  },
  attr: {
    position: "absolute", right: 6, bottom: 5, zIndex: 5, fontSize: 9,
    color: "rgba(0,0,0,0.6)", backgroundColor: "rgba(255,255,255,0.7)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
  dirRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10,
    backgroundColor: "#14141b", borderColor: LINE, borderWidth: 1, borderRadius: 14, padding: 14,
  },
  dirText: { color: "#f4f4f6", fontSize: 15, fontWeight: "700", flex: 1 },
});
