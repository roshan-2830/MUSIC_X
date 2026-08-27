/** Slippy-map maths, shared by every map in the app.
 *
 *  Extracted from venue-map.tsx when the Stay tab needed a second map — one with a pin per
 *  hotel rather than a single one. Two copies of Web Mercator would drift, and a projection
 *  that disagrees with the tiles it is drawn over puts every marker in the wrong place.
 */

export const TILE = 256;

/** The tile host. Two have already failed this app, in different ways:
 *
 *   • tile.openstreetmap.org answers with HTTP 200 and a 6,987-byte "Access denied"
 *     placeholder — identical bytes for every tile, so nothing catches it and the map
 *     silently draws grey.
 *   • basemaps.cartocdn.com served real tiles this morning and by afternoon was burning
 *     "API KEY REQUIRED — carto.com/basemaps/apikey" diagonally across every one. Still
 *     HTTP 200, still ~33 KB, and unusable.
 *
 *  So a keyless public host is borrowed time, and the honest fix is a keyed provider with a
 *  free tier — MapTiler allows 100k tiles a month. TILE_HOST reads an env var so a key can
 *  be dropped in without touching this file; the default keeps the app working today.
 */
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? "";

export const tileUrl = (z: number, x: number, y: number) =>
  MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`
    : `https://tile.openstreetmap.de/${z}/${x}/${y}.png`;

/** Where a lat/lng falls, in pixels, across the whole world at this zoom. */
export function worldPixel(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const r = (lat * Math.PI) / 180;
  return {
    n,
    x: ((lng + 180) / 360) * n * TILE,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE,
  };
}

export type TileGrid = {
  tiles: { key: string; url: string; left: number; top: number }[];
  /** Offset of the tile grid inside the box, so the centre lat/lng lands dead centre. */
  gridLeft: number;
  gridTop: number;
  /** Where any lat/lng sits inside the box, for placing a marker over the tiles. */
  project: (lat: number, lng: number) => { x: number; y: number };
};

/** The tiles needed to cover a box of `width` x `height`, centred on a lat/lng. */
export function tileGrid(
  centerLat: number, centerLng: number, zoom: number, width: number, height: number,
): TileGrid {
  const { n, x: px, y: py } = worldPixel(centerLat, centerLng, zoom);

  // Anchor on the box's own top-left in world pixels. The first version anchored on the
  // CENTRE tile and added a tile of margin, which covers a phone-width box by luck and
  // fails as the box grows: at 340px the offset came out negative and covered fine, at
  // 1740px it came out +530 and left a 530px grey band down the left of the map.
  const worldLeft = px - width / 2;
  const worldTop = py - height / 2;
  const tx0 = Math.floor(worldLeft / TILE);
  const ty0 = Math.floor(worldTop / TILE);
  // Always in (-TILE, 0], so the grid can never start to the right of the box edge.
  const gridLeft = -(worldLeft - tx0 * TILE);
  const gridTop = -(worldTop - ty0 * TILE);
  const cols = Math.ceil((width - gridLeft) / TILE);
  const rows = Math.ceil((height - gridTop) / TILE);

  const tiles: TileGrid["tiles"] = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const ty = ty0 + ry;
      // Past either pole there is no tile. Wrap x so a place near the antimeridian still
      // draws a continuous map.
      if (ty < 0 || ty >= n) continue;
      const tx = (((tx0 + rx) % n) + n) % n;
      tiles.push({
        key: `${rx}-${ry}`, url: tileUrl(zoom, tx, ty),
        left: rx * TILE, top: ry * TILE,
      });
    }
  }

  return {
    tiles, gridLeft, gridTop,
    project: (lat: number, lng: number) => {
      const p = worldPixel(lat, lng, zoom);
      return { x: width / 2 + (p.x - px), y: height / 2 + (p.y - py) };
    },
  };
}

/** Metres between two points — for choosing a zoom that fits every marker. */
export function metresBetween(la1: number, lo1: number, la2: number, lo2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin((r(la2) - r(la1)) / 2) ** 2 +
    Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin((r(lo2) - r(lo1)) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** The closest zoom that still fits `spanMetres` across a box `pxWide` wide.
 *
 *  Fitting matters here: hotels come back up to 10 km out, and at the venue map's zoom 16
 *  every one of them would sit off-screen with nothing to show that they exist.
 */
export function zoomToFit(spanMetres: number, pxWide: number, min = 9, max = 16): number {
  for (let z = max; z >= min; z--) {
    // Ground resolution at the equator, good enough for choosing a zoom.
    const mPerPx = (156543.03392 * Math.cos(0)) / Math.pow(2, z);
    if (spanMetres <= mPerPx * pxWide * 0.8) return z;
  }
  return min;
}
