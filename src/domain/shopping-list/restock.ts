import type { CatalogIndex } from "../catalog";
import type { IsoDate } from "../dates";
import { parseFreeEntry } from "./free-entry";
import { nextTrip, type ShoppingDay, type ShoppingTrip } from "./trips";

/**
 * The note for what ran out at home. Anyone writes on it when they notice: flour, dishwasher
 * tabs. An entry is put on a shopping list when the household decides to buy it, and then
 * it is a line typed onto that list.
 */

export interface RestockItem {
  id: string;
  /** As written: "Mehl", "Spülmittel", "Milch WS 1.29". */
  text: string;
}

const MAX_LENGTH = 120;

/** An entry as it is stored: without stray spaces. Empty when nothing was written. */
export function readRestock(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
}

/**
 * The shopping day an entry goes to: the next one from `today` on. Something the market
 * does not sell, or the catalog does not know, waits for the supermarket.
 */
export function restockTrip(
  text: string,
  index: CatalogIndex,
  days: readonly ShoppingDay[],
  today: IsoDate,
): ShoppingTrip | null {
  const { ingredient } = parseFreeEntry(text, index);
  const market = ingredient
    ? (index.aisleGroupById.get(ingredient.aisleGroupId)?.market ?? false)
    : false;
  return nextTrip(days, today, market);
}
