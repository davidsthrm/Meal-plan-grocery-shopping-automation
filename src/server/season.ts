import "server-only";
import type { RecipeSummary } from "@/domain/library/summary";
import {
  foodsByRecipe,
  foodsOfCatalog,
  seasonFit,
  type Month,
  type SeasonalFood,
} from "@/domain/season/calendar";
import { seasonalFoods } from "../../supabase/seed/seasons";
import { allRows, loadIngredientNames, type Db } from "./catalog";

/** The calendar of what is in season (`supabase/seed/seasons.ts`). */
export const CALENDAR: readonly SeasonalFood[] = seasonalFoods;

/** How many ids fit into the address of one request. */
const IDS_PER_REQUEST = 100;

/**
 * Per recipe, the foods of the calendar it is made with. Only the lines of ingredients the
 * calendar knows are read, a few hundred ingredients of the catalog's thousand.
 */
export async function loadSeasonalFoods(db: Db): Promise<Map<string, SeasonalFood[]>> {
  const foods = foodsOfCatalog(CALENDAR, await loadIngredientNames(db));
  const ids = [...foods.keys()];
  const parts: string[][] = [];
  for (let at = 0; at < ids.length; at += IDS_PER_REQUEST) {
    parts.push(ids.slice(at, at + IDS_PER_REQUEST));
  }
  const lines = await Promise.all(
    parts.map((part) =>
      allRows(
        (from, to) =>
          db
            .from("recipe_ingredient")
            .select("id, recipe_id, ingredient_id")
            .in("ingredient_id", part)
            .order("id")
            .range(from, to),
        "load seasonal ingredient lines",
      ),
    ),
  );
  return foodsByRecipe(foods, lines.flat());
}

/** The recipes with how each fits the season of a month. */
export function withSeason(
  recipes: readonly RecipeSummary[],
  foods: ReadonlyMap<string, SeasonalFood[]>,
  month: Month,
): RecipeSummary[] {
  return recipes.map((recipe) => ({
    ...recipe,
    season: seasonFit(foods.get(recipe.id) ?? [], recipe.tags, month),
  }));
}
