import "server-only";
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

async function getJson(url: string, init: RequestInit = {}, seconds = 20): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "User-Agent": WHO, Accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(seconds * 1000),
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
 * service could be reached. `log` hears every step, for the command line.
 */
export async function searchSupermarkets(
  postalCode: string,
  log: (step: string) => void = () => {},
): Promise<SupermarketSearch | null> {
  const lookup = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    postalcode: postalCode,
    countrycodes: "de",
    format: "json",
    addressdetails: "1",
    limit: "1",
  })}`;
  log(`Postleitzahl nachschlagen: ${lookup}`);
  const area = readPostalArea(await getJson(lookup));
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
        45,
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
