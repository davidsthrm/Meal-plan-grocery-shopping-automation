import "server-only";
import type { Turn } from "@/domain/import/frame";
import { must, type Db } from "../catalog";
import { framePage, type FramedPage } from "./frame";
import { cropImage } from "./normalize-image";
import { RecipeReadError, type PageFramer } from "./read-recipe";
import { downloadPhoto, storePhoto } from "./storage";

/**
 * Framing the page photos that are in storage: each page once, for all recipes that show it.
 */

export interface FramedStoredPage {
  path: string;
  turned: Turn;
  /** How many recipes got a cut-out view of their own. */
  cropped: number;
  usage: FramedPage["usage"];
}

/** Where the cut-out view of a recipe is stored: next to the pages of its batch. */
export function cropPath(pagePath: string, recipeId: string, sortOrder: number): string {
  return pagePath.replace(/\/pages\/[^/]+$/, `/crops/${recipeId}-${sortOrder}.jpg`);
}

/**
 * Frames one stored page that has not been looked at yet: turns the stored photo upright and
 * stores a cut-out view for each recipe that shares the page with others. Returns null when
 * no page is left, and "taken" when another request got to the page first. `pathPrefix`
 * narrows it to the pages of one batch.
 *
 * The page is claimed first, so several requests can work side by side. A page the model
 * cannot frame stays as it was photographed and is not tried again: the whole page is always
 * a valid view. Anything else is an outage: the page is put back and the caller sees the error.
 */
export async function frameNextPage(
  db: Db,
  householdId: string,
  frame: PageFramer,
  pathPrefix = `${householdId}/`,
): Promise<FramedStoredPage | "taken" | null> {
  const waiting = must(
    await db
      .from("recipe_photo")
      .select("storage_path")
      .eq("household_id", householdId)
      .is("framed_at", null)
      .like("storage_path", `${pathPrefix}%`)
      .limit(1),
    "find a page to frame",
  );
  if (waiting.length === 0) return null;
  const path = waiting[0].storage_path;
  const claimed = must(
    await db
      .from("recipe_photo")
      .update({ framed_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("storage_path", path)
      .is("framed_at", null)
      .select("id, recipe_id, sort_order"),
    "claim page to frame",
  );
  // Another request took it in the meantime.
  if (claimed.length === 0) return "taken";

  const recipes = must(
    await db
      .from("recipe")
      .select("id, title")
      .in(
        "id",
        claimed.map((row) => row.recipe_id),
      ),
    "load recipes of page",
  );
  const titleOf = new Map(recipes.map((recipe) => [recipe.id, recipe.title]));
  try {
    const framed = await framePage(
      await downloadPhoto(path),
      [...new Set(titleOf.values())],
      frame,
    );
    if (framed.turned !== 0) await storePhoto(path, framed.image);

    let cropped = 0;
    for (const row of claimed) {
      const crop = framed.crops.get(titleOf.get(row.recipe_id) ?? "") ?? null;
      if (!crop) continue;
      const target = cropPath(path, row.recipe_id, row.sort_order);
      await storePhoto(target, await cropImage(framed.image, crop));
      const stored = await db.from("recipe_photo").update({ crop_path: target }).eq("id", row.id);
      if (stored.error) throw new Error(`store view of recipe: ${stored.error.message}`);
      cropped++;
    }
    return { path, turned: framed.turned, cropped, usage: framed.usage };
  } catch (error) {
    if (!(error instanceof RecipeReadError)) {
      await db
        .from("recipe_photo")
        .update({ framed_at: null })
        .in(
          "id",
          claimed.map((row) => row.id),
        );
    }
    throw error;
  }
}
