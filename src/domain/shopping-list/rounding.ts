import type { Ingredient } from "../catalog";
import { dimensionOf, tidy, type Amount, type Unit } from "../units";

/** Rounds up to a multiple of `step`, ignoring floating point noise below the step. */
export function roundUpTo(quantity: number, step: number): number {
  if (step <= 0) throw new Error(`step must be positive, got ${step}`);
  return tidy(Math.ceil(tidy(quantity / step)) * step);
}

/**
 * The step a weight or volume is rounded to when the catalog names none: just enough to
 * read well. 137,5 g of Feldsalat reads "140 g", 1234 ml of milk "1,25 l". Counted units
 * are rounded to whole pieces.
 */
export function naturalStep(quantity: number, unit: Unit): number {
  const dimension = dimensionOf(unit);
  if (dimension !== "mass" && dimension !== "volume") return 1;
  if (quantity <= 100) return 5;
  if (quantity <= 1000) return 10;
  return 50;
}

/**
 * Turns an exact sum (in the ingredient's default unit) into the amount that stands in front
 * of the name on the list. Every line shows the amount needed in the ingredient's own unit:
 * "200 g Crème fraîche", "1x Schalotte", "1 Bund Petersilie". Counts and weights are rounded
 * to the catalog's step; whatever else is rounded to whole pieces or a sensible weight. How
 * many packs that is, is said apart (`packsFor`).
 */
export function purchaseFor(ingredient: Ingredient, quantity: number): Amount {
  const unit = ingredient.defaultUnit;
  const step =
    ingredient.roundingStep ??
    (ingredient.buyingMode === "count" || ingredient.buyingMode === "weight"
      ? 1
      : naturalStep(quantity, unit));
  return { quantity: roundUpTo(quantity, step), unit };
}

/**
 * How many packs an ingredient bought in packs takes for an exact sum in its default unit.
 * Null for anything not bought in packs.
 */
export function packsFor(ingredient: Ingredient, quantity: number): number | null {
  if (ingredient.buyingMode !== "pack") return null;
  if (!ingredient.packSize) {
    throw new Error(`"${ingredient.name}" is bought in packs but has no pack size`);
  }
  return Math.max(1, roundUpTo(quantity / ingredient.packSize, 1));
}
