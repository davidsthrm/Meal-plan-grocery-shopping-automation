import type { RecipeSummary } from "@/domain/library/summary";
import { effortOf, type Effort } from "@/domain/library/tags";
import { formatNumber, formatPurchase } from "@/domain/shopping-list/format";
import type { Unit } from "@/domain/units";

const EFFORT_NAME: Record<Effort, string> = {
  schnell: "Schnell",
  alltag: "Alltagsküche",
  aufwendig: "Braucht Zeit",
};

/**
 * How long a recipe takes, as a card says it: the printed minutes, or where the cookbook
 * prints none, how much work it is. Null when neither is known.
 */
export function timeText(recipe: Pick<RecipeSummary, "tags" | "prepMinutes">): string | null {
  if (recipe.prepMinutes !== null) return `${recipe.prepMinutes} Min.`;
  const effort = effortOf(recipe);
  return effort && EFFORT_NAME[effort];
}

/**
 * What a recipe's amounts are for: "4 Portionen", "4–6 Portionen", or what it makes when that
 * is not persons, "1 Springform (Ø 26 cm)".
 */
export function servingsText(min: number | null, max: number | null, unit: string | null): string {
  if (min === null || max === null) return "? Portionen";
  return `${min === max ? min : `${min}–${max}`} ${unit ?? "Portionen"}`;
}

/** "Speed Cooking, S. 97", or what is known of it. */
export function sourceText(book: string | null, page: number | null): string {
  if (book && page !== null) return `${book}, S. ${page}`;
  if (book) return book;
  if (page !== null) return `S. ${page}`;
  return "";
}

/**
 * The amount of a recipe line as it stands in front of the ingredient: "250 g", "3x",
 * "2–3x", "½ Bund", or nothing. Pieces are counted with an "x", never as "3 Stück".
 */
export function amountText(
  quantity: number | null,
  quantityMax: number | null,
  unit: Unit | null,
): string {
  if (quantity === null || unit === null) return "";
  if (quantityMax === null) return formatPurchase({ quantity, unit });
  const upper = formatPurchase({ quantity: quantityMax, unit });
  return `${formatNumber(quantity)}–${upper}`;
}
