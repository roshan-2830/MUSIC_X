import { useState } from "react";
import { Image, LayoutChangeEvent, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";
import { Ionicons } from "@expo/vector-icons";

import { TILE } from "../lib/slippy";
import { useMapPan } from "../lib/use-map-pan";

import MapControls from "./map-controls";

const INK = "#1a1a20";
/** The ground colour of the tiles, so the frame matches while they load instead of
 *  flashing a black box on a light map. */
const TILE_BG = "#e8e2d9";

/** Street level — close enough to read the surrounding roads, wide enough to place the
 *  venue in its neighbourhood. */
const ZOOM = 16;
const HEIGHT = 200;

/** Pin geometry. The POINT marks the venue, not the middle of the photo, so the whole
 *  assembly is lifted by half its height to sit the tip on the map centre. */
const PHOTO = 44;
const POINTER = 9;



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
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The grid has to be laid out in real pixels, and only the parent knows how wide the
  // card is. Until it reports, draw the frame and no tiles — never a half-placed map.
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  // Draggable, via the shared hook. It owns the grid — which still comes from lib/slippy, so
  // the projection stays the one every map uses — plus the pan gesture and the zoom buttons.
  const map = useMapPan({ lat, lng, zoom: ZOOM, width, height: HEIGHT });
  const grid = map.grid;

  const directions = () =>
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${venue}${city ? `, ${city}` : ""}`,
      )}`,
    );

  return (
    <>
      <View
        style={styles.frame}
        onLayout={onLayout}
        // The FRAME, not the tile grid: the grid is absolutely positioned and slides as you
        // pan, so its bounding box is wrong for the wheel-zoom maths and it stops being the
        // surface under the cursor. The frame is fixed and covers the whole map.
        {...map.panHandlers}
        ref={map.webRef}
      >
        {/* The handlers go on the tile layer, not the frame, so the Directions row below and
            the zoom buttons above stay tappable. */}
        {grid ? (
          <View style={[styles.grid, { left: grid.gridLeft, top: grid.gridTop }]}
                >
            {grid.tiles.map((t) => (
              <Image key={t.key} source={{ uri: t.url }}
                     style={[styles.tile, { left: t.left, top: t.top }]} />
            ))}
          </View>
        ) : null}

        {/* PROJECTED, not flex-centred. It used to sit in the middle of a full-bleed layer,
            which is right only while the venue IS the centre — the moment the map can be
            dragged, a centred pin follows the finger and claims the venue moved. */}
        {grid ? (() => {
          const pt = grid.project(lat, lng);
          return (
        <View style={[styles.pinLayer, { left: pt.x, top: pt.y }]} pointerEvents="none">
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
          );
        })() : null}

        <MapControls map={map} label="venue" />
        <Text style={styles.attr}>© OpenStreetMap · CARTO</Text>
      </View>

      <Pressable style={styles.dirRow} onPress={directions}>
        <Ionicons name="location-outline" size={18} color={th.text} />
        <Text style={styles.dirText}>Directions</Text>
        <Ionicons name="open-outline" size={16} color={th.muted} />
      </Pressable>
    </>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  frame: {
    position: "relative", height: HEIGHT, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: th.line, backgroundColor: TILE_BG,
  },
  grid: { position: "absolute" },
  // Full opacity: this is a light basemap shown as it was designed. The dark theme is
  // carried by the frame around it, not by dimming the map into illegibility.
  tile: { position: "absolute", width: TILE, height: TILE },

  // Anchored at the projected point; the column below is shifted so the pin's TIP lands on
  // it rather than its middle.
  pinLayer: {
    position: "absolute", width: 0, height: 0, zIndex: 3,
    alignItems: "center", justifyContent: "center",
  },
  // Lift the pin so the POINT lands on its projected spot, not the photo's middle.
  pinCol: { alignItems: "center", transform: [{ translateY: -(PHOTO + POINTER) / 2 }] },
  photoRing: {
    width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, borderWidth: 3,
    borderColor: th.accentFill, backgroundColor: th.accentFill, overflow: "hidden", zIndex: 2,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  photo: { width: "100%", height: "100%" },
  photoBlank: { alignItems: "center", justifyContent: "center", backgroundColor: th.accentFill },
  // Clips the rotated square to just its lower point, so no corners show past the ring.
  pointerWrap: { width: PHOTO, height: POINTER, alignItems: "center", overflow: "hidden", marginTop: -2 },
  pointer: {
    width: 14, height: 14, backgroundColor: th.accentFill, transform: [{ rotate: "45deg" }],
    marginTop: -8,
  },
  attr: {
    position: "absolute", right: 6, bottom: 5, zIndex: 5, fontSize: 9,
    color: th.scrim, backgroundColor: "rgba(255,255,255,0.7)",
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6, overflow: "hidden",
  },
  dirRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10,
    backgroundColor: th.panel, borderColor: th.line, borderWidth: 1, borderRadius: 14, padding: 14,
  },
  dirText: { color: th.text, fontSize: 15, fontWeight: "700", flex: 1 },
});
