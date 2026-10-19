/**
 * Addresses offered while someone types the street of a market: "Biberacher Straße 12",
 * or a shop's own name that OpenStreetMap knows with its street ("Dilgers Hofladen"). Read
 * from an answer of Photon, the search of OpenStreetMap that is made for search as you type
 * (Nominatim's rules forbid it). What a suggestion holds is enough to put the market on the
 * map without asking again.
 */

export interface AddressSuggestion {
  /** What goes into the field: the street and its number, "Biberacher Straße 12". */
  address: string;
  /** The name of what stands there, where it is a shop or a building: "Dilgers Hofladen". */
  name: string | null;
  /** Where it lies, for the second line of a suggestion: "88471 Laupheim". */
  place: string | null;
  lat: number;
  lon: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    countrycode?: string;
    osm_key?: string;
    type?: string;
  };
}

/** How many suggestions the field shows at most. */
const MOST = 5;

/** What OpenStreetMap files a plain house, a road or a town under: no name of a shop. */
const NOT_A_NAME = new Set(["building", "highway", "place", "boundary"]);

/**
 * The suggestions in a Photon answer: only what lies in Germany and has a street, each
 * address once, those in the household's postal code first and otherwise in Photon's order.
 * A town, a district or a county is no address for a market and is left out.
 */
export function readAddressSuggestions(
  answer: unknown,
  postalCode: string | null = null,
): AddressSuggestion[] {
  const features = (answer as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const ordered = postalCode
    ? [...features].sort(
        (a, b) =>
          Number(b.properties?.postcode === postalCode) -
          Number(a.properties?.postcode === postalCode),
      )
    : features;
  const found: AddressSuggestion[] = [];
  for (const feature of ordered) {
    const props = feature.properties ?? {};
    const [lon, lat] = Array.isArray(feature.geometry?.coordinates)
      ? (feature.geometry.coordinates as unknown[]).map(Number)
      : [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (props.countrycode && props.countrycode.toUpperCase() !== "DE") continue;
    const street =
      props.street ?? (props.type === "street" || props.osm_key === "highway" ? props.name : null);
    if (!street) continue;
    const address = props.housenumber ? `${street} ${props.housenumber}` : street;
    const name =
      props.name && props.name !== street && !NOT_A_NAME.has(props.osm_key ?? "")
        ? props.name
        : null;
    const town = props.city ?? props.district ?? null;
    const place = [props.postcode, town].filter(Boolean).join(" ") || null;
    const key = `${name ?? ""}|${address}|${place ?? ""}`;
    if (found.some((each) => `${each.name ?? ""}|${each.address}|${each.place ?? ""}` === key)) {
      continue;
    }
    found.push({ address, name, place, lat, lon });
    if (found.length === MOST) break;
  }
  return found;
}

/**
 * The middle of the places the household's markets stand at, to look for an address near
 * them first. Null without any.
 */
export function middleOf(
  places: readonly { lat: number; lon: number }[],
): { lat: number; lon: number } | null {
  if (places.length === 0) return null;
  return {
    lat: places.reduce((sum, place) => sum + place.lat, 0) / places.length,
    lon: places.reduce((sum, place) => sum + place.lon, 0) / places.length,
  };
}
