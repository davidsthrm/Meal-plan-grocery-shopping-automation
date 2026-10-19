import "server-only";
import { readAddressSuggestions, type AddressSuggestion } from "@/domain/address-search";
import {
  commonsImageUrl,
  pickSupermarkets,
  readLogoFiles,
  readPostalArea,
  type FoundSupermarket,
  type OverpassElement,
} from "@/domain/supermarket-search";

/**
 * Asks OpenStreetMap for the supermarkets in a German postal code's area, and Wikidata for
 * their logos. All three services are free and need no key; they ask for a name that says
 * who is asking, and for few requests: this runs only when a member enters the postal code
 * or searches again.
 */

const WHO =
  "Essensplan/1.0 (private household meal planner; https://github.com/dazzlingdolphin/Meal-plan-grocery-shopping-automation)";

/**
 * Overpass servers, tried in this order. The main one is often busy and then answers 429 or
 * 504, or not in time; the others carry the same map.
 */
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** What went wrong with one request, in a few words: "overpass-api.de: 504". */
function why(url: string, error: unknown): string {
  const host = new URL(url).host;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return `${host}: keine Antwort`;
  }
  // Node's fetch says only "fetch failed"; the cause says why (ENOTFOUND, a certificate).
  const cause =
    error instanceof Error ? (error.cause as { code?: string; message?: string }) : null;
  const detail = cause?.code ?? cause?.message;
  const message = error instanceof Error ? error.message : String(error);
  return `${host}: ${detail ? `${message} (${detail})` : message}`;
}

/**
 * How long a whole search may take, its street lookups included. A function on Vercel is cut
 * off after 300 seconds; the rest is left for storing what was found.
 */
export const SEARCH_BUDGET_MS = 240_000;

async function getJson(
  url: string,
  init: RequestInit = {},
  seconds = 20,
  until = Number.POSITIVE_INFINITY,
): Promise<unknown> {
  // Never wait past the end of the search: what is left is not asked at all.
  const left = Math.min(seconds * 1000, until - Date.now());
  if (left < 1000) throw new Error(`${new URL(url).host}: keine Zeit mehr`);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "User-Agent": WHO, Accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(left),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(why(url, error));
  }
  if (!response.ok) throw new Error(`${new URL(url).host}: ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${new URL(url).host}: keine Daten`);
  }
}

export interface SupermarketSearch {
  /** The place the postal code belongs to: "Laupheim". */
  place: string | null;
  supermarkets: (FoundSupermarket & { logoUrl: string | null })[];
}

/**
 * The supermarkets in a postal code's area, nearest first, with their logos where Wikidata
 * knows them. Null when the postal code was not found. Throws, with what went wrong, when no
 * service could be reached. `log` hears every step, for the command line. Nothing is asked
 * after `until`.
 */
export async function searchSupermarkets(
  postalCode: string,
  log: (step: string) => void = () => {},
  until = Date.now() + SEARCH_BUDGET_MS,
): Promise<SupermarketSearch | null> {
  const lookup = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    postalcode: postalCode,
    countrycodes: "de",
    format: "json",
    addressdetails: "1",
    limit: "1",
  })}`;
  log(`Postleitzahl nachschlagen: ${lookup}`);
  const area = readPostalArea(await getJson(lookup, {}, 20, until));
  if (!area) {
    log("Nominatim kennt die Postleitzahl nicht.");
    return null;
  }
  log(`Gefunden: ${area.place ?? "ohne Ortsnamen"}, Mitte ${area.center.lat}, ${area.center.lon}`);

  const [south, west, north, east] = area.box;
  const query = `[out:json][timeout:30];nwr["shop"="supermarket"](${south},${west},${north},${east});out center tags;`;
  let elements: OverpassElement[] | null = null;
  const failures: string[] = [];
  for (const server of OVERPASS) {
    log(`Supermärkte suchen: ${server}`);
    try {
      const answer = (await getJson(
        server,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        },
        30,
        until,
      )) as { elements?: OverpassElement[] };
      elements = answer.elements ?? [];
      break;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      log(`  ging nicht: ${failures[failures.length - 1]}`);
    }
  }
  if (elements === null) throw new Error(failures.join("; "));
  log(`${elements.length} Supermärkte im Gebiet`);
  const found = pickSupermarkets(elements, area.center);

  // A missing logo is no reason to fail: the tile shows the name's first letter instead.
  const brands = [...new Set(found.flatMap((shop) => shop.brandWikidata ?? []))];
  let logos = new Map<string, string>();
  if (brands.length > 0) {
    try {
      logos = readLogoFiles(
        await getJson(
          `https://www.wikidata.org/w/api.php?${new URLSearchParams({
            action: "wbgetentities",
            ids: brands.join("|"),
            props: "claims",
            format: "json",
          })}`,
          {},
          20,
          until,
        ),
      );
    } catch (error) {
      log(`Logos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    place: area.place,
    supermarkets: found.map((shop) => {
      const file = shop.brandWikidata ? logos.get(shop.brandWikidata) : undefined;
      return { ...shop, logoUrl: file ? commonsImageUrl(file) : null };
    }),
  };
}

/**
 * Where a street of the household's postal code is, for a market the household typed in or
 * corrected: "Biberacher Straße 12". Null when OpenStreetMap does not know it, or cannot be
 * reached: the market is then simply not on the map.
 */
export async function findStreet(
  street: string,
  postalCode: string,
  until = Number.POSITIVE_INFINITY,
): Promise<{ lat: number; lon: number } | null> {
  const lookup = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    street,
    postalcode: postalCode,
    countrycodes: "de",
    format: "json",
    limit: "1",
  })}`;
  try {
    const answer = (await getJson(lookup, {}, 20, until)) as { lat?: string; lon?: string }[];
    const lat = Number(answer[0]?.lat);
    const lon = Number(answer[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && answer.length > 0 ? { lat, lon } : null;
  } catch (error) {
    console.error(`find street ${street}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** Nominatim asks for at most one request a second. */
const NOMINATIM_GAP_MS = 1100;

/**
 * Where each of these markets stands, found by its street, one after the other at the pace
 * Nominatim asks for. For markets found before their place was kept, when Overpass cannot
 * be reached: they stand on the map all the same. A street that is not found is left out,
 * and so are the ones still waiting at `until`: the next search places them.
 */
export async function findStreets(
  shops: readonly { id: string; address: string }[],
  postalCode: string,
  until = Number.POSITIVE_INFINITY,
): Promise<Map<string, { lat: number; lon: number }>> {
  const found = new Map<string, { lat: number; lon: number }>();
  for (const [at, shop] of shops.entries()) {
    if (Date.now() + NOMINATIM_GAP_MS + 1000 > until) break;
    if (at > 0) await new Promise((done) => setTimeout(done, NOMINATIM_GAP_MS));
    const position = await findStreet(shop.address, postalCode, until);
    if (position) found.set(shop.id, position);
  }
  return found;
}

/** How far around the household's markets an address is looked for, in degrees: about 9 km. */
const NEAR_LAT = 0.08;
const NEAR_LON = 0.12;

/**
 * Addresses for what someone is typing into the street of a market, from Photon: near the
 * household's markets where any stands on the map, otherwise in its postal code's town.
 * Empty when Photon cannot be reached: the field then takes what is typed, as before.
 */
export async function searchAddresses(
  typed: string,
  around: {
    near: { lat: number; lon: number } | null;
    postalCode: string | null;
    place: string | null;
  },
): Promise<AddressSuggestion[]> {
  const { near, postalCode, place } = around;
  const params = new URLSearchParams({ q: typed, lang: "de", limit: "10" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
    params.set(
      "bbox",
      [near.lon - NEAR_LON, near.lat - NEAR_LAT, near.lon + NEAR_LON, near.lat + NEAR_LAT]
        .map((value) => value.toFixed(4))
        .join(","),
    );
  } else {
    const town = [postalCode, place].filter(Boolean).join(" ");
    if (town) params.set("q", `${typed}, ${town}`);
  }
  try {
    return readAddressSuggestions(
      await getJson(`https://photon.komoot.io/api/?${params}`, {}, 5),
      postalCode,
    );
  } catch (error) {
    console.error(`search addresses: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
