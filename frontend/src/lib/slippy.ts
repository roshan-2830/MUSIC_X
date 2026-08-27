/** Slippy-map maths, shared by every map in the app.
 *
 *  Extracted from venue-map.tsx when the Stay tab needed a second map — one with a pin per
 *  hotel rather than a single one. Two copies of Web Mercator would drift, and a projection
 *  that disagrees with the tiles it is drawn over puts every marker in the wrong place.
 */

export const TILE = 256;

/** CARTO's Voyager basemap, from OpenStreetMap data. Plain images, no API key.
 *
 *  NOT tile.openstreetmap.org: measured 2026-08-26, that host answers this app with HTTP 200
 *  and a 6,987-byte "Access denied" placeholder — identical bytes for every tile — so the map
 *  would silently draw grey with nothing to catch it.
 */
export const tileUrl = (z: number, x: number, y: number) =>
  `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;

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
  // One extra tile each side, so a partial tile never leaves a gap at the edge.
  const cols = Math.ceil(width / TILE) + 2;
  const rows = Math.ceil(height / TILE) + 2;
  const tx0 = Math.floor(px / TILE) - 1;
  const ty0 = Math.floor(py / TILE) - 1;
  const gridLeft = width / 2 - (px - tx0 * TILE);
  const gridTop = height / 2 - (py - ty0 * TILE);

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
