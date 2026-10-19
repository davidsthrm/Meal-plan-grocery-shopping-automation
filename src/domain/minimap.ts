/**
 * A small map of the household's supermarkets: map tiles of OpenStreetMap laid side by side
 * and a mark where each market stands. Worked out here, drawn as plain elements: the map
 * needs no script, and moving or zooming it is not what it is for.
 */

/** The side of one map tile, in pixels of the map. */
const TILE = 256;

/** Closer than this, a single market or two next door would fill the map with one street. */
const CLOSEST = 16;
/** Further out than this, the map would show a region rather than a town. */
const FURTHEST = 9;

export interface Place {
  id: string;
  lat: number;
  lon: number;
}

/** Where on the map something lies, as a share of its width and height: 0 to 100. */
export interface At {
  left: number;
  top: number;
}

export interface MapTile extends At {
  url: string;
  /** Its width and height as a share of the map's. */
  width: number;
  height: number;
}

export interface Minimap {
  zoom: number;
  tiles: MapTile[];
  marks: (At & { id: string })[];
}

/** A point on the map of the whole world at a zoom, in its pixels (Web Mercator). */
function project(place: Place, zoom: number): { x: number; y: number } {
  const size = TILE * 2 ** zoom;
  const sin = Math.sin((place.lat * Math.PI) / 180);
  return {
    x: ((place.lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/**
 * The map that shows every place with room around it, as close as that allows. Its size is
 * the one it is laid out for, in pixels; drawn larger or smaller it keeps its proportions.
 * Null without any place.
 */
export function minimap(
  places: readonly Place[],
  { width = 600, height = 300, margin = 36 } = {},
): Minimap | null {
  if (places.length === 0) return null;
  let zoom = CLOSEST;
  for (; zoom > FURTHEST; zoom--) {
    const points = places.map((place) => project(place, zoom));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const fits =
      Math.max(...xs) - Math.min(...xs) <= width - 2 * margin &&
      Math.max(...ys) - Math.min(...ys) <= height - 2 * margin;
    if (fits) break;
  }
  const points = places.map((place) => project(place, zoom));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = (Math.min(...xs) + Math.max(...xs)) / 2 - width / 2;
  const top = (Math.min(...ys) + Math.max(...ys)) / 2 - height / 2;
  const count = 2 ** zoom;

  const tiles: MapTile[] = [];
  for (let x = Math.floor(left / TILE); x * TILE < left + width; x++) {
    for (let y = Math.floor(top / TILE); y * TILE < top + height; y++) {
      if (y < 0 || y >= count) continue;
      // Round the world: a map across the date line takes its tiles from the other side.
      const wrapped = ((x % count) + count) % count;
      tiles.push({
        url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`,
        left: ((x * TILE - left) / width) * 100,
        top: ((y * TILE - top) / height) * 100,
        width: (TILE / width) * 100,
        height: (TILE / height) * 100,
      });
    }
  }
  return {
    zoom,
    tiles,
    marks: places.map((place, at) => ({
      id: place.id,
      left: ((points[at].x - left) / width) * 100,
      top: ((points[at].y - top) / height) * 100,
    })),
  };
}
