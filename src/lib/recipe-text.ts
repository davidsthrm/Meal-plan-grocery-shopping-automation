import { dayAndMonth, type IsoDate } from "@/domain/dates";
import type { RecipeSummary } from "@/domain/library/summary";
import { EFFORT_NAME, effortOf } from "@/domain/library/tags";
import { nameForOne, type Ingredient } from "@/domain/catalog";
import { VOLUME_UNIT } from "@/domain/import/servings";
import { formatAmount, formatNumber } from "@/domain/shopping-list/format";
import type { Unit } from "@/domain/units";

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
  if (unit === VOLUME_UNIT) return volumeText(min, max);
  return `${min === max ? min : `${min}–${max}`} ${unit ?? "Portionen"}`;
}

/** A volume kept in millilitres, as a drink's recipe prints it: "750 ml", "2,25 l". */
export function volumeText(min: number, max: number = min): string {
  const litres = max >= 1000;
  const one = (ml: number) =>
    litres ? (ml / 1000).toLocaleString("de-DE", { maximumFractionDigits: 3 }) : String(ml);
  return `${min === max ? one(min) : `${one(min)}–${one(max)}`} ${litres ? "l" : "ml"}`;
}

/**
 * When a recipe was last cooked, as its page says it: "Zuletzt gekocht am 12. Oktober", with
 * the year when it was another year than today's, or "Noch nie gekocht".
 */
export function lastCookedText(day: IsoDate | null, today: IsoDate): string {
  if (day === null) return "Noch nie gekocht";
  const year = day.slice(0, 4) === today.slice(0, 4) ? "" : ` ${day.slice(0, 4)}`;
  return `Zuletzt gekocht am ${dayAndMonth(day)}${year}`;
}

/** "Speed Cooking, S. 97", or what is known of it. */
export function sourceText(book: string | null, page: number | null): string {
  if (book && page !== null) return `${book}, S. ${page}`;
  if (book) return book;
  if (page !== null) return `S. ${page}`;
  return "";
}

/**
 * The amount of a recipe line: "250 g", "2–3 Zehen", or nothing. Pieces are a bare number,
 * as a cookbook prints them: "1 Schalotte", not "1 Stück Schalotten".
 */
export function amountText(
  quantity: number | null,
  quantityMax: number | null,
  unit: Unit | null,
): string {
  if (quantity === null || unit === null) return "";
  const amount = (value: number) =>
    unit === "Stück" ? formatNumber(value) : formatAmount({ quantity: value, unit });
  if (quantityMax === null) return amount(quantity);
  return `${formatNumber(quantity)}–${amount(quantityMax)}`;
}

/**
 * The name of a recipe line's ingredient: one piece in the singular where the catalog knows
 * the word ("1 Schalotte"), anything else by the catalog's name.
 */
export function ingredientText(
  ingredient: Pick<Ingredient, "name" | "synonyms">,
  quantity: number | null,
  quantityMax: number | null,
  unit: Unit | null,
): string {
  const most = quantityMax ?? quantity;
  return unit === "Stück" && most !== null && most <= 1 ? nameForOne(ingredient) : ingredient.name;
}
