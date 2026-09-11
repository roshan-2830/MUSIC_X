import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Theme } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/use-theme";
import { MapView } from "../lib/use-map-pan";

/**
 * Zoom and recentre, for every map in the app.
 *
 * One component so the three maps cannot drift apart in position or wording — the same
 * reason slippy.ts exists for the projection.
 *
 * The controls sit ON the map rather than under it, because a map you can drag needs its
 * controls where your thumb already is. Recentre only appears once the view has actually
 * been moved: a button that does nothing is worse than no button, and on first open the map
 * is already centred where the caller asked.
 *
 * Deliberately NOT a pinch gesture as well. Pinch is fiddly to get right inside a scrolling
 * page, and on the web it is the wrong gesture entirely — these buttons work identically on
 * a phone and in a browser, which is where this app is developed.
 */
export default function MapControls({ map, label = "venue" }: {
  map: MapView;
  /** What recentring returns you to, in the user's words — "venue" or "hotels". */
  label?: string;
}) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <>
      <View style={styles.zoomStack}>
        <Pressable
          style={[styles.btn, styles.btnTop, !map.canZoomIn && styles.btnOff]}
          onPress={map.zoomIn}
          disabled={!map.canZoomIn}
          hitSlop={6}
          accessibilityLabel="Zoom in"
        >
          <Ionicons name="add" size={18} color={map.canZoomIn ? th.text : th.faint} />
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnBottom, !map.canZoomOut && styles.btnOff]}
          onPress={map.zoomOut}
          disabled={!map.canZoomOut}
          hitSlop={6}
          accessibilityLabel="Zoom out"
        >
          <Ionicons name="remove" size={18} color={map.canZoomOut ? th.text : th.faint} />
        </Pressable>
      </View>

      {map.moved ? (
        <Pressable style={styles.recentre} onPress={map.recentre} hitSlop={6}
                   accessibilityLabel={`Back to the ${label}`}>
          <Ionicons name="locate" size={13} color={th.accentInk} />
          <Text style={styles.recentreT}>Back to the {label}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  // Top-right, the convention, and clear of the "© OpenStreetMap" credit and the count line
  // that both sit along the bottom.
  zoomStack: {
    // zIndex above every marker. The hotel pins carry 2 and the chosen one carries 4, so
    // without this the controls drew UNDERNEATH them and were invisible on a busy map.
    position: "absolute", top: 10, right: 10, zIndex: 10, borderRadius: 10, overflow: "hidden",
    // The tiles are a light basemap in BOTH themes — the map does not invert — so these are
    // deliberately fixed light-surface colours rather than theme tokens.
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.14)",
  },
  btn: { width: 34, height: 32, alignItems: "center", justifyContent: "center" },
  btnTop: { borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.12)" },
  btnBottom: {},
  btnOff: { opacity: 0.45 },

  recentre: {
    position: "absolute", top: 10, left: 10, zIndex: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: th.accentFill, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 11,
  },
  recentreT: { color: th.accentInk, fontSize: 11.5, fontWeight: "800" },
});
