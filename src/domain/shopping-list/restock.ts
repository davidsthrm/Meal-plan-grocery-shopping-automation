import type { CatalogIndex } from "../catalog";
import { addDays, isoWeekday, type IsoDate } from "../dates";
import { isDrugstoreItem, nextDrugstoreTrip } from "./drugstore";
import { parseFreeEntry } from "./free-entry";
import {
  freshPlaceFor,
  nextTrip,
  tripsBetween,
  type FreshPlace,
  type ShoppingDay,
  type ShoppingTrip,
} from "./trips";

/**
 * The note for what ran out at home. Anyone writes on it when they notice: flour, dishwasher
 * tabs. An entry is put on a shopping list when the household decides to buy it, and then
 * it is a line typed onto that list.
 */

export interface RestockItem {
  id: string;
  /** As written: "Mehl", "Spülmittel", "Milch WS 1.29". */
  text: string;
  /** Where it is bought fresh, if not at the supermarket. */
  freshPlace: FreshPlace | null;
}

const MAX_LENGTH = 120;

/** An entry as it is stored: without stray spaces. Empty when nothing was written. */
export function readRestock(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
}

/**
 * Where an entry is bought fresh, going by the catalog: at the market, the butcher or the
 * bakery, or null for the supermarket, for packed bread and for what the catalog does not
 * know. Looked up once, when the entry is written.
 */
export function freshPlaceOf(text: string, index: CatalogIndex): FreshPlace | null {
  const { ingredient } = parseFreeEntry(text, index);
  if (!ingredient) return null;
  const fresh = index.aisleGroupById.get(ingredient.aisleGroupId)?.freshPlace ?? null;
  return freshPlaceFor(fresh, ingredient.shelfLifeDays ?? null);
}

/**
 * The errand an entry goes to: the next one from `today` on that sells it. What the
 * drugstore sells goes to its note ("Zahnpasta", "Duschgel"), also where the food catalog
 * knows it too. Bread that ran out is fetched from the bakery that day, on a Sunday on the
 * Monday: the bakery has no day of its own to wait for. Something not sold fresh elsewhere
 * waits for the supermarket.
 */
export function restockTrip(
  item: Pick<RestockItem, "freshPlace" | "text">,
  days: readonly ShoppingDay[],
  today: IsoDate,
): ShoppingTrip | null {
  if (isDrugstoreItem(item.text)) {
    const drugstore = nextDrugstoreTrip(tripsBetween(days, today, addDays(today, 13)), today);
    if (drugstore) return drugstore;
  }
  if (item.freshPlace === "bakery" && days.length > 0) {
    return { date: isoWeekday(today) === 7 ? addDays(today, 1) : today, place: "bakery" };
  }
  return nextTrip(days, today, item.freshPlace);
}
