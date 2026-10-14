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

const WHO = "Essensplan (private household meal planner)";

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": WHO, Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

export interface SupermarketSearch {
  /** The place the postal code belongs to: "Laupheim". */
  place: string | null;
  supermarkets: (FoundSupermarket & { logoUrl: string | null })[];
}

/**
 * The supermarkets in a postal code's area, nearest first, with their logos where Wikidata
 * knows them. Null when the postal code was not found. Throws when a service cannot be
 * reached.
 */
export async function searchSupermarkets(postalCode: string): Promise<SupermarketSearch | null> {
  const area = readPostalArea(
    await getJson(
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        postalcode: postalCode,
        country: "de",
        format: "json",
        addressdetails: "1",
        limit: "1",
      })}`,
    ),
  );
  if (!area) return null;

  const [south, west, north, east] = area.box;
  const query = `[out:json][timeout:25];nwr["shop"="supermarket"](${south},${west},${north},${east});out center tags;`;
  const answer = (await getJson("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }).toString(),
  })) as { elements?: OverpassElement[] };
  const found = pickSupermarkets(answer.elements ?? [], area.center);

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
    } catch {
      logos = new Map();
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
