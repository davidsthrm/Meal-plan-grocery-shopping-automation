import "server-only";
import { mondayOf, type IsoDate } from "@/domain/dates";
import { recipeForMeal } from "@/domain/import/for-meal";
import type { Meal } from "@/domain/plan";
import { plannedServings } from "@/domain/recipe";
import { must, type Db } from "../catalog";
import { loadWeek, writeSlot } from "../planning/week";

/** The meal an upload was started from, and the recipe that now stands there. */
export interface PlacedRecipe {
  date: IsoDate;
  meal: Meal;
  title: string;
}

/** The meal a batch was uploaded for, while its recipe is not on the plan yet. */
export async function mealOfBatch(
  db: Db,
  batchId: string,
): Promise<{ date: IsoDate; meal: Meal; label: string | null } | null> {
  const batch = must(
    await db.from("import_batch").select("for_date, for_meal").eq("id", batchId).maybeSingle(),
    "load batch",
  );
  if (!batch?.for_date || !batch.for_meal) return null;
  const slot = (await loadWeek(db, mondayOf(batch.for_date))).find(
    (entry) => entry.date === batch.for_date && entry.meal === batch.for_meal,
  );
  return {
    date: batch.for_date,
    meal: batch.for_meal,
    label: slot?.kind === "free_text" ? slot.label : null,
  };
}

/**
 * Puts the recipe a batch was uploaded for on its meal, once every photo is read and the
 * recipe is approved. The meal must still be the text it was: a meal someone planned
 * otherwise in the meantime is left alone. Answers with what was planned, or null.
 *
 * Several requests may ask at once. Only the one that takes the meal off the batch plans it.
 */
export async function placeForMeal(
  db: Db,
  householdId: string,
  batchId: string,
): Promise<PlacedRecipe | null> {
  const target = await mealOfBatch(db, batchId);
  if (!target) return null;
  const [pages, jobs] = await Promise.all([
    db.from("import_page").select("status").eq("batch_id", batchId),
    db.from("import_job").select("status, recipe_id").eq("batch_id", batchId),
  ]);
  const unread = (row: { status: string }) =>
    row.status === "uploaded" || row.status === "processing";
  const jobRows = must(jobs, "load recipes of batch");
  if (must(pages, "load pages").some(unread) || jobRows.some(unread) || jobRows.length === 0) {
    return null;
  }

  const forget = () =>
    db
      .from("import_batch")
      .update({ for_date: null, for_meal: null })
      .eq("id", batchId)
      .not("for_date", "is", null)
      .select("id");
  // The meal was emptied or planned otherwise: the upload is a recipe like any other.
  if (target.label === null) {
    await forget();
    return null;
  }
  const recipeIds = jobRows.flatMap((job) => job.recipe_id ?? []);
  if (recipeIds.length === 0) return null;
  const recipes = must(
    await db
      .from("recipe")
      .select("id, title, servings_min, servings_max, servings_unit")
      .in("id", recipeIds)
      .eq("status", "approved"),
    "load recipes of batch",
  );
  const recipe = recipeForMeal(target.label, recipes);
  if (!recipe) return null;

  const [claimed, household] = await Promise.all([
    forget(),
    db.from("household").select("default_servings").eq("id", householdId).single(),
  ]);
  if (must(claimed, "take the meal off the batch").length === 0) return null;
  const base = {
    min: recipe.servings_min ?? 1,
    max: recipe.servings_max ?? recipe.servings_min ?? 1,
    unit: recipe.servings_unit,
  };
  await writeSlot(db, householdId, mondayOf(target.date), target.date, target.meal, {
    kind: "recipes",
    items: [
      {
        recipeId: recipe.id,
        servings: plannedServings(base, must(household, "load household").default_servings),
      },
    ],
  });
  return { date: target.date, meal: target.meal, title: recipe.title };
}
