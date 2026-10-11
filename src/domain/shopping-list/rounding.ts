import type { Ingredient } from "../catalog";
import { tidy, type Amount } from "../units";

/** Rounds up to a multiple of `step`, ignoring floating point noise below the step. */
export function roundUpTo(quantity: number, step: number): number {
  if (step <= 0) throw new Error(`step must be positive, got ${step}`);
  return tidy(Math.ceil(tidy(quantity / step)) * step);
}

/**
 * Turns an exact sum (in the ingredient's default unit) into what goes on the list.
 * Returns null when the name alone is enough: buying mode "none", or a single pack.
 */
export function purchaseFor(ingredient: Ingredient, quantity: number): Amount | null {
  switch (ingredient.buyingMode) {
    case "none":
      return null;
    case "count":
      return {
        quantity: roundUpTo(quantity, ingredient.roundingStep ?? 1),
        unit: ingredient.defaultUnit,
      };
    case "weight":
      return {
        quantity: roundUpTo(quantity, ingredient.roundingStep ?? 1),
        unit: ingredient.defaultUnit,
      };
    case "pack": {
      if (!ingredient.packSize) {
        throw new Error(`"${ingredient.name}" is bought in packs but has no pack size`);
      }
      const packs = roundUpTo(quantity / ingredient.packSize, 1);
      return packs > 1 ? { quantity: packs, unit: "Packung" } : null;
    }
  }
}
