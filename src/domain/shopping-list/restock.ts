import type { CatalogIndex } from "../catalog";
import type { IsoDate } from "../dates";
import { parseFreeEntry } from "./free-entry";
import { nextTrip, type FreshPlace, type ShoppingDay, type ShoppingTrip } from "./trips";

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
 * Where an entry is bought fresh, going by the catalog: at the market, at the butcher, or
 * null for the supermarket and for what the catalog does not know. Looked up once, when the
 * entry is written.
 */
export function freshPlaceOf(text: string, index: CatalogIndex): FreshPlace | null {
  const { ingredient } = parseFreeEntry(text, index);
  return ingredient
    ? (index.aisleGroupById.get(ingredient.aisleGroupId)?.freshPlace ?? null)
    : null;
}

/**
 * The errand an entry goes to: the next one from `today` on that sells it. Something not
 * sold fresh elsewhere waits for the supermarket.
 */
export function restockTrip(
  item: Pick<RestockItem, "freshPlace">,
  days: readonly ShoppingDay[],
  today: IsoDate,
): ShoppingTrip | null {
  return nextTrip(days, today, item.freshPlace);
}
