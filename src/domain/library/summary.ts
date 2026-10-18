import type { IsoDate } from "../dates";
import type { Meal } from "../plan";
import type { RecipeKind, Servings } from "../recipe";

export type ProteinType = "red_meat" | "poultry" | "fish" | "vegetarian" | "vegan" | "none";

/** What the library, the planner and the recommendations need to know about a recipe. */
export interface RecipeSummary {
  id: string;
  title: string;
  kind: RecipeKind;
  /** Key of its category tag ("hauptgericht"). Null without a category. */
  category: string | null;
  proteinType: ProteinType | null;
  prepMinutes: number | null;
  isFavorite: boolean;
  /** The cookbook, or the magazine whose editions are one stack ("Einfach Hausgemacht"). */
  sourceBook: string | null;
  /** The edition of a magazine ("06/2020"). Null for a cookbook. */
  sourceEdition: string | null;
  sourcePage: number | null;
  servings: Servings | null;
  /** The day it entered the library. */
  addedOn: IsoDate;
  /** What else describes it: effort, kind of dish, cuisine, season, occasion. See `tags.ts`. */
  tags: readonly string[];
  /** Someone marked it as "want to cook this". */
  wanted: boolean;
}

/** A category as the household named it. The key is what the app goes by. */
export interface Category {
  key: string;
  name: string;
}

/** The last day each recipe was planned, by recipe id. */
export type History = ReadonlyMap<string, IsoDate>;

/** Categories that are a meal by themselves. A cake or a side dish is planned, not suggested. */
const MEAL_CATEGORIES = new Set(["hauptgericht", "suppe-eintopf", "salat", "vesper"]);

/**
 * Whether a recipe is a meal in its own right. Recipes without a category count: quick meals
 * the household typed in have none.
 */
export function isMeal(recipe: Pick<RecipeSummary, "category">): boolean {
  return recipe.category === null || MEAL_CATEGORIES.has(recipe.category);
}

/** What is eaten in the evening rather than cooked for lunch. */
const EVENING_ONLY = new Set(["vesper", "salat"]);
/** What goes with coffee in the afternoon. */
const SWEET = new Set(["kuchen", "dessert"]);

/** A cake or a dessert: never shown or counted as a vegetarian meal. */
export function isSweet(recipe: Pick<RecipeSummary, "category">): boolean {
  return recipe.category !== null && SWEET.has(recipe.category);
}

/**
 * Whether a recipe is something to suggest for this meal. In this household lunch is the
 * cooked meal; a cold supper or a salad is suggested for the evening only. Planning one for
 * lunch by hand is always possible.
 */
export function suitsMeal(recipe: Pick<RecipeSummary, "category">, meal: Meal): boolean {
  // Cakes and desserts are never suggested for lunch or dinner, only for coffee.
  if (meal === "coffee") return isSweet(recipe);
  if (!isMeal(recipe)) return false;
  return meal === "dinner" || recipe.category === null || !EVENING_ONLY.has(recipe.category);
}
