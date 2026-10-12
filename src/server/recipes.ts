import "server-only";
import type { TypedRecipe, TypedRecipeInput } from "@/domain/library/typed-recipe";
import { loadCatalogIndex, must, type Db } from "./catalog";
import { importModels } from "./import/models";
import { saveImportedRecipe, saveReviewedRecipe } from "./import/save-recipe";

/**
 * Recipes the household types in or corrects by hand. They go the same way into the library
 * as imported ones: lines are mapped to the catalog, and an ingredient the catalog does not
 * know becomes a proposal instead of a silent new entry.
 */

/** Stores a typed recipe, approved at once: the household wrote it. Returns its id. */
export async function createTypedRecipe(
  db: Db,
  householdId: string,
  recipe: TypedRecipe,
): Promise<string> {
  return saveImportedRecipe(db, {
    householdId,
    recipe: { ...recipe, sourceTitle: null, lines: recipe.lines ?? [] },
    status: "approved",
    photoPaths: [],
    index: await loadCatalogIndex(db),
    suggest: importModels().suggest,
    kind: recipe.sourceBook ? "cookbook" : "quick_meal",
  });
}

/**
 * Changes a recipe: always what stands above its ingredients, and the ingredients themselves
 * when they were typed (`recipe.lines` is not null).
 */
export async function updateTypedRecipe(
  db: Db,
  householdId: string,
  recipeId: string,
  recipe: TypedRecipe,
): Promise<void> {
  const existing = must(
    await db.from("recipe").select("source_title").eq("id", recipeId).single(),
    "load recipe",
  );
  if (recipe.lines !== null) {
    await saveReviewedRecipe(db, {
      householdId,
      recipeId,
      recipe: { ...recipe, sourceTitle: existing.source_title, lines: recipe.lines },
      index: await loadCatalogIndex(db),
      suggest: importModels().suggest,
    });
  } else {
    const updated = await db
      .from("recipe")
      .update({
        title: recipe.title,
        source_book: recipe.sourceBook,
        source_page: recipe.sourcePage,
        servings_min: recipe.servings.min,
        servings_max: recipe.servings.max,
        servings_unit: recipe.servings.unit,
        prep_minutes: recipe.prepMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipeId);
    if (updated.error) throw new Error(`update recipe: ${updated.error.message}`);
  }
  const kind = await db
    .from("recipe")
    .update({ protein_type: recipe.proteinType === "unknown" ? null : recipe.proteinType })
    .eq("id", recipeId);
  if (kind.error) throw new Error(`update recipe kind: ${kind.error.message}`);

  // A recipe has at most one category: the old one goes, the chosen one comes.
  const categories = must(
    await db.from("tag").select("id, key").eq("group_name", "Kategorie"),
    "load categories",
  );
  const removed = await db
    .from("recipe_tag")
    .delete()
    .eq("recipe_id", recipeId)
    .in(
      "tag_id",
      categories.map((tag) => tag.id),
    );
  if (removed.error) throw new Error(`clear category: ${removed.error.message}`);
  const chosen = categories.find((tag) => tag.key === recipe.dishType);
  if (chosen) {
    const linked = await db
      .from("recipe_tag")
      .insert({ household_id: householdId, recipe_id: recipeId, tag_id: chosen.id });
    if (linked.error) throw new Error(`set category: ${linked.error.message}`);
  }
}

export interface RecipeFormData {
  values: TypedRecipeInput;
  /** True when the ingredients were typed by the household and can be typed again. */
  typed: boolean;
}

/** A recipe as the form shows it. Null when it does not exist for this household. */
export async function loadRecipeForm(db: Db, recipeId: string): Promise<RecipeFormData | null> {
  const { data: recipe } = await db
    .from("recipe")
    .select(
      "id, title, kind, source_book, source_page, servings_min, servings_unit, prep_minutes, protein_type",
    )
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return null;
  const [lines, links, categories, photos] = await Promise.all([
    db
      .from("recipe_ingredient")
      .select("original_text")
      .eq("recipe_id", recipeId)
      .order("position"),
    db.from("recipe_tag").select("tag_id").eq("recipe_id", recipeId),
    db.from("tag").select("id, key").eq("group_name", "Kategorie"),
    db.from("recipe_photo").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId),
  ]);
  const own = new Set(must(links, "load recipe tags").map((link) => link.tag_id));
  const category = must(categories, "load categories").find((tag) => own.has(tag.id));
  // What was read from a photo keeps its printed lines; only typed recipes are typed again.
  const typed = (photos.count ?? 0) === 0;
  return {
    typed,
    values: {
      title: recipe.title,
      category: category?.key ?? "",
      protein: recipe.protein_type ?? "",
      servings: recipe.servings_min?.toString() ?? "",
      servingsUnit: recipe.servings_unit ?? "",
      minutes: recipe.prep_minutes?.toString() ?? "",
      book: recipe.source_book ?? "",
      page: recipe.source_page?.toString() ?? "",
      lines: typed
        ? must(lines, "load lines")
            .map((line) => line.original_text)
            .join("\n")
        : null,
    },
  };
}
