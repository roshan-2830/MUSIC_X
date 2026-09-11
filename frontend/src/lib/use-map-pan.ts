import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureResponderEvent, PanResponder, Platform } from "react-native";

import { TILE, tileGrid, worldPixel } from "./slippy";

/**
 * Pan and zoom for the app's tile maps.
 *
 * Why a hook and not a map library
 * --------------------------------
 * The three maps here are not maps — they are grids of static tile images with markers
 * absolutely positioned on top, which is why none of them moved. But the maths to move them
 * was already written: tileGrid() takes a centre and works out which tiles cover the box,
 * and project() places a marker. Panning is nothing more than changing that centre.
 *
 * So this keeps the custom price pills and the venue anchor exactly as they are, and needs no
 * new native dependency — which on Expo would mean a fresh EAS development build before the
 * change could even be seen on a phone.
 *
 * WEB NEEDS ITS OWN LISTENERS
 * ---------------------------
 * PanResponder is built on React Native's TOUCH system, so on the web it answers to a finger
 * on a touchscreen and to nothing else — a mouse drag or a trackpad two-finger swipe produces
 * no touch events at all, and the map simply does not move. That is not a detail: the web is
 * where this app is developed and demoed.
 *
 * So on web the hook also binds real DOM listeners — mousedown/mousemove/mouseup for dragging
 * and wheel for zooming — to the element the caller hands it via `webRef`. Native keeps
 * PanResponder, which is the right tool there.
 *
 * Why PanResponder rather than react-native-gesture-handler
 * ---------------------------------------------------------
 * These maps live inside a vertically scrolling page, and the hard part is not the drag — it
 * is not stealing the page's scroll. PanResponder's onMoveShouldSetPanResponder runs on every
 * move and can decline, so the map claims the gesture only once the finger has moved further
 * horizontally than vertically, or far enough to be deliberate. A mostly-vertical swipe still
 * scrolls the page, which is what someone reading the Stay tab expects.
 *
 * Panning in WORLD PIXELS, not degrees
 * ------------------------------------
 * A drag is a pixel distance, and the same pixel distance is a different number of degrees at
 * different latitudes and zooms. Converting the centre to world pixels, moving it, and
 * converting back is exact at every zoom — whereas scaling degrees by a fudge factor drifts
 * badly north of about 60°.
 */

/** Web Mercator is undefined at the poles, and the tile grid has no rows past them. */
const MAX_LAT = 85.05112878;

function clampLat(lat: number) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

/** Degrees per world pixel, inverted from worldPixel() so the two can never disagree. */
function pixelToLatLng(x: number, y: number, zoom: number) {
  const world = Math.pow(2, zoom) * TILE;
  const lng = (x / world) * 360 - 180;
  const k = Math.PI - (2 * Math.PI * y) / world;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
  return { lat, lng };
}

export type MapView = {
  /** The centre to draw, which is the caller's until the map is dragged. */
  lat: number;
  lng: number;
  zoom: number;
  /** Spread onto the tile container — native touch dragging. */
  panHandlers: ReturnType<typeof PanResponder.create>["panHandlers"];
  /** Put on the same container as a `ref`. Web mouse and wheel listeners bind to it; on
   *  native it is never read. */
  webRef: React.MutableRefObject<any>;
  /** True once the view has been moved, so a "recentre" control can appear only when useful. */
  moved: boolean;
  recentre: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** The grid for the current view. Null until the box has been measured. */
  grid: ReturnType<typeof tileGrid> | null;
};

export function useMapPan({
  lat, lng, zoom, width, height, minZoom = 3, maxZoom = 18,
}: {
  /** Where the caller wants the map centred — the venue, or the middle of the hotels. */
  lat: number;
  lng: number;
  /** The zoom the caller computed to fit its markers. */
  zoom: number;
  width: number;
  height: number;
  minZoom?: number;
  maxZoom?: number;
}): MapView {
  // null means "wherever the caller says". Kept as an override rather than seeded from the
  // props, so a map whose markers arrive late — hotels land a few seconds after the tab
  // opens — re-centres itself instead of freezing on the first guess.
  const [view, setView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

  const cur = view ?? { lat, lng, zoom };

  // The gesture reads and writes these rather than state: a PanResponder is created once and
  // would otherwise close over the first render's values for its whole life.
  const start = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const live = useRef(cur);
  live.current = cur;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim on touch-down only for a pinch; a single finger has to prove itself in
        // onMove first, or the page can no longer be scrolled by starting on the map.
        onStartShouldSetPanResponder: (e: GestureResponderEvent) =>
          e.nativeEvent.touches?.length === 2,
        onMoveShouldSetPanResponder: (_e, g) => {
          const { dx, dy } = g;
          // Horizontal intent, or a deliberate drag in any direction. 6px of slop keeps a tap
          // on a price pill from being read as a drag.
          return Math.abs(dx) > Math.abs(dy) || Math.hypot(dx, dy) > 14 ? Math.hypot(dx, dy) > 6 : false;
        },
        onPanResponderGrant: () => {
          start.current = { ...live.current };
        },
        onPanResponderMove: (_e, g) => {
          const from = start.current;
          if (!from) return;
          const p = worldPixel(from.lat, from.lng, from.zoom);
          // Minus, because dragging the map right moves the viewport left.
          const next = pixelToLatLng(p.x - g.dx, p.y - g.dy, from.zoom);
          setView({ lat: clampLat(next.lat), lng: next.lng, zoom: from.zoom });
        },
        onPanResponderRelease: () => { start.current = null; },
        onPanResponderTerminate: () => { start.current = null; },
        // Let a parent scroll view take over if it really wants to; the map is an enhancement
        // and the page must always stay scrollable.
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );

  const step = useCallback((by: number) => {
    const c = live.current;
    const z = Math.max(minZoom, Math.min(maxZoom, c.zoom + by));
    if (z === c.zoom) return;
    // Zoom about the CENTRE, which is what a +/- button means. Zooming about the finger is a
    // pinch, and that is a different gesture.
    setView({ lat: c.lat, lng: c.lng, zoom: z });
  }, [minZoom, maxZoom]);

  // The DOM node to bind mouse and wheel listeners to. Only used on web; on native the ref
  // is simply never read.
  const webRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el: HTMLElement | null = webRef.current;
    if (!el) return;

    let from: { lat: number; lng: number; zoom: number; x: number; y: number } | null = null;

    const down = (e: MouseEvent) => {
      // Left button only: a right-click is a context menu and a middle-click is a scroll.
      if (e.button !== 0) return;
      const c = live.current;
      from = { ...c, x: e.clientX, y: e.clientY };
      el.style.cursor = "grabbing";
      // Stops the browser starting a text or image drag, which otherwise aborts the pan a
      // few pixels in and leaves a ghost tile stuck to the cursor.
      e.preventDefault();
    };

    const move = (e: MouseEvent) => {
      if (!from) return;
      const p = worldPixel(from.lat, from.lng, from.zoom);
      const next = pixelToLatLng(p.x - (e.clientX - from.x), p.y - (e.clientY - from.y), from.zoom);
      setView({ lat: clampLat(next.lat), lng: next.lng, zoom: from.zoom });
    };

    const up = () => {
      from = null;
      el.style.cursor = "grab";
    };

    // Zoom about the CURSOR, not the centre — dragging then zooming about the middle throws
    // away the thing you just dragged to. A trackpad pinch arrives here as a wheel event with
    // ctrlKey set, so it works too.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = live.current;
      const dir = e.deltaY > 0 ? -1 : 1;
      const z = Math.max(minZoom, Math.min(maxZoom, c.zoom + dir));
      if (z === c.zoom) return;
      const box = el.getBoundingClientRect();
      // Where the cursor is, as an offset from the box centre.
      const ox = e.clientX - box.left - box.width / 2;
      const oy = e.clientY - box.top - box.height / 2;
      const under = pixelToLatLng(
        worldPixel(c.lat, c.lng, c.zoom).x + ox,
        worldPixel(c.lat, c.lng, c.zoom).y + oy,
        c.zoom,
      );
      // Keep that point under the cursor at the new zoom.
      const q = worldPixel(under.lat, under.lng, z);
      const centre = pixelToLatLng(q.x - ox, q.y - oy, z);
      setView({ lat: clampLat(centre.lat), lng: centre.lng, zoom: z });
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    // Not passive: the handler calls preventDefault so the PAGE does not scroll while the
    // cursor is over the map.
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [minZoom, maxZoom]);

  const grid = width > 0 && height > 0
    ? tileGrid(cur.lat, cur.lng, cur.zoom, width, height)
    : null;

  return {
    lat: cur.lat,
    lng: cur.lng,
    zoom: cur.zoom,
    panHandlers: pan.panHandlers,
    webRef,
    moved: view !== null,
    recentre: useCallback(() => setView(null), []),
    zoomIn: useCallback(() => step(1), [step]),
    zoomOut: useCallback(() => step(-1), [step]),
    canZoomIn: cur.zoom < maxZoom,
    canZoomOut: cur.zoom > minZoom,
    grid,
  };
}
