import { formatAmount } from "@/domain/shopping-list/format";
import type { Unit } from "@/domain/units";

/** "4" or "4–6" servings, as recipes print it. */
export function servingsText(min: number | null, max: number | null): string {
  if (min === null || max === null) return "?";
  return min === max ? String(min) : `${min}–${max}`;
}

/** "Speed Cooking, S. 97", or what is known of it. */
export function sourceText(book: string | null, page: number | null): string {
  if (book && page !== null) return `${book}, S. ${page}`;
  if (book) return book;
  if (page !== null) return `S. ${page}`;
  return "";
}

/** The amount of a recipe line: "250 g", "2–3 Stück", or nothing. */
export function amountText(
  quantity: number | null,
  quantityMax: number | null,
  unit: Unit | null,
): string {
  if (quantity === null || unit === null) return "";
  if (quantityMax === null) return formatAmount({ quantity, unit });
  const upper = formatAmount({ quantity: quantityMax, unit });
  return `${String(quantity).replace(".", ",")}–${upper}`;
}
