import { normalizeName } from "./catalog";

/**
 * Finding the supermarkets near the household: its postal code is looked up on
 * OpenStreetMap (Nominatim), the supermarkets inside that postal code's area are asked for
 * (Overpass), and each chain's logo comes from Wikidata and Wikimedia Commons. This file
 * reads their answers; `src/server/supermarket-search.ts` asks.
 */

/** How many supermarkets are shown first; the others found stand folded away below them. */
export const SUPERMARKETS_SHOWN = 5;

/** How many supermarkets of an area are kept at most. */
export const SUPERMARKETS_FOUND = 15;

/** A German postal code as typed, tidied, or null for anything else. */
export function readPostalCode(text: string): string | null {
  const typed = text.trim().replace(/\s+/g, "");
  return /^[0-9]{5}$/.test(typed) ? typed : null;
}

export interface Point {
  lat: number;
  lon: number;
}

/** Where a postal code is: its middle, the rectangle around it, and the place's name. */
export interface PostalArea {
  center: Point;
  /** south, west, north, east */
  box: [number, number, number, number];
  place: string | null;
}

/** Nominatim's answer to a search by postal code, as far as it is read here. */
interface NominatimPlace {
  lat?: string;
  lon?: string;
  boundingbox?: string[];
  address?: Record<string, string | undefined>;
}

/** The area of a postal code from Nominatim's answer, or null when it found none. */
export function readPostalArea(answer: unknown): PostalArea | null {
  const first = Array.isArray(answer) ? (answer[0] as NominatimPlace | undefined) : undefined;
  if (!first?.lat || !first.lon) return null;
  const center = { lat: Number(first.lat), lon: Number(first.lon) };
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return null;
  const [south, north, west, east] = (first.boundingbox ?? []).map(Number);
  // Without a usable rectangle: about five kilometres around the middle.
  const box: PostalArea["box"] =
    [south, north, west, east].every(Number.isFinite) && south < north && west < east
      ? [south, west, north, east]
      : [center.lat - 0.045, center.lon - 0.07, center.lat + 0.045, center.lon + 0.07];
  const address = first.address ?? {};
  const place = address.city ?? address.town ?? address.village ?? address.municipality ?? null;
  return { center, box, place };
}

/** One element of an Overpass answer: a shop drawn as a point or as a building. */
export interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: Point;
  tags?: Record<string, string | undefined>;
}

/** A supermarket found near the household. */
export interface FoundSupermarket {
  name: string;
  /** The street: "Biberacher Straße 12". Null where the map does not say. */
  address: string | null;
  /** The chain on Wikidata ("Q151954" for Lidl), which knows its logo. */
  brandWikidata: string | null;
  /** From the middle of the postal code's area. */
  distanceKm: number;
}

/** The distance between two points on the earth, in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * The supermarkets of an Overpass answer worth offering: each name once, the nearest of
 * its kind; the chains first (a shop the map knows a brand for: Aldi, Lidl, Rewe), then the
 * rest, each nearest first; at most `limit`. A shop without a name is left out. Showing
 * only the nearest five left out Aldi and Lidl in Laupheim, a kilometre further away.
 */
export function pickSupermarkets(
  elements: readonly OverpassElement[],
  center: Point,
  limit = SUPERMARKETS_FOUND,
): FoundSupermarket[] {
  const nearest = new Map<string, FoundSupermarket>();
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = (tags.name ?? tags.brand ?? "").trim();
    const at =
      element.lat !== undefined && element.lon !== undefined
        ? { lat: element.lat, lon: element.lon }
        : element.center;
    if (name === "" || !at) continue;
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const found: FoundSupermarket = {
      name: name.slice(0, 60),
      address: street === "" ? null : street.slice(0, 120),
      brandWikidata: /^Q[0-9]+$/.test(tags["brand:wikidata"] ?? "")
        ? (tags["brand:wikidata"] as string)
        : null,
      distanceKm: distanceKm(center, at),
    };
    const key = normalizeName(name);
    const known = nearest.get(key);
    // Two shops of one name are one chain: the nearer is offered, with what either knows.
    const [near, far] =
      !known || found.distanceKm < known.distanceKm ? [found, known] : [known, found];
    nearest.set(key, {
      ...near,
      address: near.address ?? far?.address ?? null,
      brandWikidata: near.brandWikidata ?? far?.brandWikidata ?? null,
    });
  }
  return [...nearest.values()]
    .sort(
      (a, b) =>
        Number(a.brandWikidata === null) - Number(b.brandWikidata === null) ||
        a.distanceKm - b.distanceKm,
    )
    .slice(0, limit);
}

/**
 * The logo files of chains from Wikidata's answer to `wbgetentities` (property P154,
 * "logo image"): chain id to file name on Wikimedia Commons.
 */
export function readLogoFiles(answer: unknown): Map<string, string> {
  const files = new Map<string, string>();
  const entities = (answer as { entities?: Record<string, unknown> } | null)?.entities ?? {};
  for (const [id, entity] of Object.entries(entities)) {
    const claims = (entity as { claims?: Record<string, unknown[]> }).claims ?? {};
    const value = (
      claims.P154?.[0] as { mainsnak?: { datavalue?: { value?: unknown } } } | undefined
    )?.mainsnak?.datavalue?.value;
    if (typeof value === "string" && value.trim() !== "") files.set(id, value);
  }
  return files;
}

/** A small picture of a file on Wikimedia Commons, also for an SVG. */
export function commonsImageUrl(file: string, width = 128): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file.replace(/ /g, "_"),
  )}?width=${width}`;
}
