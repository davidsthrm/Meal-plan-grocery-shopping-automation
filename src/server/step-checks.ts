import "server-only";
import { must, type Db } from "./catalog";
import { viewUrls } from "./import/storage";

/**
 * The recipes whose steps were read with doubts after they were in the library, to be compared
 * with their photo ("Arbeitsschritte prüfen"). Saving the steps there, corrected or as they
 * are, takes the doubts away.
 */

export interface StepCheck {
  id: string;
  title: string;
  sourceBook: string | null;
  sourcePage: number | null;
  steps: string[];
  doubts: string[];
  /** The recipe's own view of each page: its cut-out, or the page itself. */
  photos: { view: string; page: string }[];
}

/** How many recipes wait for their steps to be checked. */
export async function countStepChecks(db: Db): Promise<number> {
  const { count, error } = await db
    .from("recipe")
    .select("id", { count: "exact", head: true })
    .not("prep_steps_doubts", "eq", "{}");
  if (error) throw new Error(`count steps to check: ${error.message}`);
  return count ?? 0;
}

/** The first `limit` recipes with doubts about their steps, by title, with their photos. */
export async function loadStepChecks(db: Db, limit: number): Promise<StepCheck[]> {
  const recipes = must(
    await db
      .from("recipe")
      .select("id, title, source_book, source_page, prep_steps, prep_steps_doubts")
      .not("prep_steps_doubts", "eq", "{}")
      .order("title")
      .order("id")
      .limit(limit),
    "load steps to check",
  );
  if (recipes.length === 0) return [];
  const photos = must(
    await db
      .from("recipe_photo")
      .select("recipe_id, storage_path, crop_path, sort_order")
      .in(
        "recipe_id",
        recipes.map((recipe) => recipe.id),
      )
      .order("sort_order"),
    "load photos of steps to check",
  );
  const urls = await viewUrls(
    photos.flatMap((photo) => [photo.storage_path, ...(photo.crop_path ? [photo.crop_path] : [])]),
  );
  return recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    sourceBook: recipe.source_book,
    sourcePage: recipe.source_page,
    steps: recipe.prep_steps ?? [],
    doubts: recipe.prep_steps_doubts,
    photos: photos
      .filter((photo) => photo.recipe_id === recipe.id)
      .map((photo) => ({
        view: urls[photo.crop_path ?? photo.storage_path],
        page: urls[photo.storage_path],
      }))
      .filter((photo) => photo.view && photo.page),
  }));
}

/**
 * Stores steps a person has looked at, among the steps to check or on the recipe's page, and
 * takes the doubts away. Null keeps them unknown.
 */
export async function saveCheckedSteps(
  db: Db,
  recipeId: string,
  steps: string[] | null,
): Promise<void> {
  const saved = await db
    .from("recipe")
    .update({ prep_steps: steps, prep_steps_doubts: [], updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (saved.error) throw new Error(`save checked steps: ${saved.error.message}`);
}
