import type { Amount, GramsPer, Unit } from "./units";
import { convert } from "./units";

/** Base servings as printed. A recipe "für 4-6 Portionen" has min 4 and max 6. */
export interface Servings {
  min: number;
  max: number;
}

/** A second printed measure for the same line: "(etwa 200 g)", "à 150 g". */
export interface SecondaryMeasure {
  quantity: number;
  unit: Unit;
  /** Null when the print does not say whether it is the total or per piece. */
  scope: "total" | "perPiece" | null;
}

export interface RecipeIngredient {
  /** Null while the line is not mapped to the catalog yet. */
  ingredientId: string | null;
  quantity: number | null;
  /** Upper bound of a printed range such as "2-3". */
  quantityMax: number | null;
  unit: Unit | null;
  secondary: SecondaryMeasure | null;
  /** Index of the line this one may replace ("oder Petersilie"). Null for normal lines. */
  alternativeTo: number | null;
  optional: boolean;
  /** The line as printed. Never changed by the household's edits. */
  originalText: string;
  note: string | null;
}

export type RecipeKind = "cookbook" | "quick_meal";

export interface Recipe {
  id: string;
  title: string;
  kind: RecipeKind;
  servings: Servings;
  ingredients: RecipeIngredient[];
}

/**
 * Factor to multiply a recipe's quantities with for a number of servings. Inside the printed
 * range the recipe is cooked as written. Outside it scales from the nearer end of the range.
 */
export function scaleFactor(base: Servings, servings: number): number {
  if (servings <= 0) throw new Error(`servings must be positive, got ${servings}`);
  if (servings < base.min) return servings / base.min;
  if (servings > base.max) return servings / base.max;
  return 1;
}

/**
 * The amount a recipe line asks to buy, before scaling, in a unit that converts to `target`
 * if any of its printed measures does.
 *
 * A range counts with its upper bound. The second printed measure is used only when the main
 * one does not convert and its scope is known, so "4 Steaks à 150 g" can become 600 g but an
 * ambiguous "(etwa 200 g)" is never guessed at.
 */
export function shoppingAmount(
  line: RecipeIngredient,
  target: Unit,
  gramsPer: GramsPer,
): Amount | null {
  if (line.quantity === null || line.unit === null) return null;
  const quantity = line.quantityMax ?? line.quantity;
  const primary: Amount = { quantity, unit: line.unit };
  if (convert(quantity, line.unit, target, gramsPer) !== null) return primary;

  const secondary = line.secondary;
  if (secondary && secondary.scope !== null) {
    const total =
      secondary.scope === "perPiece" ? secondary.quantity * quantity : secondary.quantity;
    if (convert(total, secondary.unit, target, gramsPer) !== null) {
      return { quantity: total, unit: secondary.unit };
    }
  }
  return primary;
}
