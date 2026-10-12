import type { IsoDate } from "../dates";
import type { Meal } from "../plan";
import type { Amount, Unit } from "../units";

/** "main" is bought on the shopping day, "later" shortly before it is needed. */
export type Trip = "main" | "later";

export type ContributionSource =
  | {
      type: "recipe";
      slotId: string;
      date: IsoDate;
      meal: Meal;
      recipeId: string;
      recipeTitle: string;
    }
  /** A recipe the week needs outside its meals. */
  | { type: "extra"; recipeId: string; recipeTitle: string; note: string | null }
  /** Something to buy for a meal without a recipe: bread for the "Vesper". */
  | { type: "food"; slotId: string; date: IsoDate; meal: Meal; mealLabel: string }
  | { type: "manual"; entryId: string };

/** One reason an ingredient is on the list, with the amount that reason asks for. */
export interface Contribution {
  source: ContributionSource;
  /** Scaled amount in the unit the recipe uses. Null when the recipe gives no quantity. */
  amount: Amount | null;
  /** The recipe line or free entry as written. */
  originalText: string;
  optional: boolean;
}

/** A line the household typed in by hand, e.g. "Milch WS 1.29" or "Geschenkpapier". */
export interface ManualEntry {
  id: string;
  text: string;
  /** Only used when the text matches no catalog ingredient. */
  shopId?: string | null;
  aisleGroupId?: string | null;
}

export interface ShoppingLine {
  /** Stable across regeneration. Notes, overrides and check-offs are stored against it. */
  key: string;
  ingredientId: string | null;
  label: string;
  trip: Trip;
  /** For "later" lines: the first day the ingredient is needed. */
  neededBy: IsoDate | null;
  shopId: string;
  aisleGroupId: string;
  /** What to show before the name. Null means the name alone is enough. */
  purchase: Amount | null;
  /** Exact sums, one per dimension that could not be merged. Shown on tap. */
  amounts: Amount[];
  /** True when at least one recipe asks for this without a quantity ("Salz"). */
  hasUnquantified: boolean;
  contributions: Contribution[];
  note: string | null;
  /** Pre-ticked in the "Haben wir schon?" step. */
  defaultAtHome: boolean;
  /** True when every recipe that asks for it marks it optional. */
  optional: boolean;
}

/** What the household changed on a line. Stored per line key, survives regeneration. */
export interface LineState {
  atHome?: boolean;
  checked?: boolean;
  note?: string | null;
  shopId?: string | null;
}

export type { Amount, Unit };
