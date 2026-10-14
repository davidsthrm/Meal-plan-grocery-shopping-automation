import type { Place } from "../catalog";
import type { IsoDate } from "../dates";
import type { Meal } from "../plan";
import type { Amount, Unit } from "../units";

/**
 * "main" is bought on the shopping day whose list the line is on, "later" shortly before it
 * is needed: because it would not keep, or because the meal was planned after that day.
 */
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
  /** A recipe the week needs outside its meals, on a day or (null) on none in particular. */
  | {
      type: "extra";
      recipeId: string;
      recipeTitle: string;
      note: string | null;
      date: IsoDate | null;
    }
  /** Something to buy for a meal without a recipe: bread for the "Vesper". */
  | { type: "food"; slotId: string; date: IsoDate; meal: Meal; mealLabel: string }
  | { type: "manual"; entryId: string };

/** The day what a source buys for is eaten or needed. Null for what belongs to no day. */
export function dayOf(source: ContributionSource): IsoDate | null {
  return source.type === "manual" ? null : source.date;
}

/** One reason an ingredient is on the list, with the amount that reason asks for. */
export interface Contribution {
  source: ContributionSource;
  /** Scaled amount in the unit the recipe uses. Null when the recipe gives no quantity. */
  amount: Amount | null;
  /** The recipe line or free entry as written. */
  originalText: string;
  optional: boolean;
  /**
   * The note this would be on by itself: a place on a day. Where it differs from the note
   * of its line, the household moved it there.
   */
  origin?: { date: IsoDate; place: Place };
}

/** A line the household typed in by hand, e.g. "Milch WS 1.29" or "Geschenkpapier". */
export interface ManualEntry {
  id: string;
  text: string;
  /** The note it was written on: a place on a day. Without one, the first. */
  shoppingDate?: IsoDate;
  place?: Place;
  /** Only used when the text matches no catalog ingredient. */
  shopId?: string | null;
  aisleGroupId?: string | null;
}

export interface ShoppingLine {
  /**
   * Stable across regeneration, and unique on the list of one shopping day. Notes, overrides
   * and check-offs are stored against it.
   */
  key: string;
  ingredientId: string | null;
  /** The name the line goes by for its amount: "Schalotte" for one, "Schalotten" else. */
  label: string;
  /**
   * The catalog's name for one piece and for more, so that an amount changed by hand is
   * named right. Null for a line without a catalog ingredient.
   */
  forms: { one: string; many: string } | null;
  /** The note the line is on: a place on a day. */
  shoppingDate: IsoDate;
  place: Place;
  trip: Trip;
  /**
   * For a "later" line of something that goes bad: the first day it is needed. The line
   * says so: "für Do. 15. Oktober". Null for what keeps, which is simply on the list.
   */
  neededBy: IsoDate | null;
  shopId: string;
  /** True when the shop was named on purpose: bread for a cold supper from the bakery. */
  shopByChoice?: boolean;
  aisleGroupId: string;
  /**
   * The amount needed, in the ingredient's own unit, as it stands before the name. Null when
   * no recipe gives one ("Petersilie") or all ask for a spoonful only ("Salz").
   */
  purchase: Amount | null;
  /** For what is bought in packs: how many. Said with the exact amount, not on the line. */
  packs: number | null;
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
  /** The supermarket it is bought at this week, where it is not the household's main one. */
  shopId?: string | null;
  /** The amount the household wrote over the one worked out from the plan. */
  amount?: Amount | null;
}

export type { Amount, Unit };
