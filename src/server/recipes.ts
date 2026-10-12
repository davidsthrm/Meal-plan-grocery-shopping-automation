import "server-only";
import { chosenTags, OWN_GROUP, TAG_GROUPS } from "@/domain/library/tags";
import type { TypedRecipe } from "@/domain/library/typed-recipe";
import { loadCatalogIndex, loadIngredientNames, must, type Db } from "./catalog";
import type { ReviewLine } from "./import/review";
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

/**
 * Sets the tags that describe a recipe beyond its category, replacing the ones it had. Names
 * the household typed become tags of its own group, unless a tag of that name exists.
 */
export async function saveRecipeTags(
  db: Db,
  householdId: string,
  recipeId: string,
  chosen: readonly string[],
  ownNames: readonly string[],
): Promise<void> {
  const rows = must(await db.from("tag").select("id, key, name, group_name"), "load tags");
  const described = rows.filter((row) =>
    (TAG_GROUPS as readonly string[]).includes(row.group_name),
  );
  const all = described.map((row) => ({
    ref: row.key ?? row.id,
    name: row.name,
    group: row.group_name,
  }));
  const idOf = new Map(described.map((row) => [row.key ?? row.id, row.id]));
  const ids = chosenTags(chosen, all).map((ref) => idOf.get(ref) as string);

  for (const name of ownNames) {
    const existing = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      // A name that is a category or a diet is not a tag to put on a recipe here.
      if (described.includes(existing) && !ids.includes(existing.id)) ids.push(existing.id);
      continue;
    }
    const created = must(
      await db
        .from("tag")
        .insert({ household_id: householdId, name, group_name: OWN_GROUP })
        .select("id")
        .single(),
      "create tag",
    );
    ids.push(created.id);
  }

  const removed = await db
    .from("recipe_tag")
    .delete()
    .eq("recipe_id", recipeId)
    .in(
      "tag_id",
      described.map((row) => row.id),
    );
  if (removed.error) throw new Error(`clear tags: ${removed.error.message}`);
  if (ids.length === 0) return;
  const linked = await db
    .from("recipe_tag")
    .insert(ids.map((tag_id) => ({ household_id: householdId, recipe_id: recipeId, tag_id })));
  if (linked.error) throw new Error(`set tags: ${linked.error.message}`);
}

export interface RecipeFormData {
  title: string;
  /** Key of the category, or empty. */
  category: string;
  /** Protein type, or empty for "not said". */
  protein: string;
  sourceBook: string;
  sourcePage: number | null;
  servingsMin: number | null;
  servingsMax: number | null;
  servingsUnit: string;
  prepMinutes: number | null;
  /** The tags that describe it beyond its category, as the app refers to them. */
  tags: string[];
  lines: ReviewLine[];
}

/** A recipe as the form for changing it shows it. Null when this household has no such recipe. */
export async function loadRecipeForm(db: Db, recipeId: string): Promise<RecipeFormData | null> {
  const { data: recipe } = await db
    .from("recipe")
    .select(
      "id, title, source_book, source_page, servings_min, servings_max, servings_unit, prep_minutes, protein_type",
    )
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return null;
  const [lines, links, categories, ingredients] = await Promise.all([
    db
      .from("recipe_ingredient")
      .select(
        "id, position, ingredient_id, quantity, quantity_max, unit, is_optional, is_approximate, alternative_to, original_text, note, secondary_quantity, secondary_unit, secondary_scope",
      )
      .eq("recipe_id", recipeId)
      .order("position"),
    db.from("recipe_tag").select("tag_id").eq("recipe_id", recipeId),
    db.from("tag").select("id, key, group_name"),
    loadIngredientNames(db),
  ]);
  const own = new Set(must(links, "load recipe tags").map((link) => link.tag_id));
  const ownTags = must(categories, "load tags").filter((tag) => own.has(tag.id));
  const category = ownTags.find((tag) => tag.group_name === "Kategorie");
  const names = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const rows = must(lines, "load lines");
  const positionOf = new Map(rows.map((row, at) => [row.id, at]));
  return {
    title: recipe.title,
    category: category?.key ?? "",
    protein: recipe.protein_type ?? "",
    sourceBook: recipe.source_book ?? "",
    sourcePage: recipe.source_page,
    servingsMin: recipe.servings_min,
    servingsMax: recipe.servings_max,
    servingsUnit: recipe.servings_unit ?? "",
    prepMinutes: recipe.prep_minutes,
    tags: ownTags
      .filter((tag) => (TAG_GROUPS as readonly string[]).includes(tag.group_name))
      .map((tag) => tag.key ?? tag.id),
    lines: rows.map((row) => ({
      // A line the catalog does not know shows as it was printed, to be corrected or kept.
      ingredient: row.ingredient_id ? (names.get(row.ingredient_id) ?? "") : row.original_text,
      known: row.ingredient_id !== null,
      quantity: row.quantity,
      quantityMax: row.quantity_max,
      unit: row.unit,
      note: row.note ?? "",
      optional: row.is_optional,
      approximate: row.is_approximate,
      alternativeTo: row.alternative_to ? (positionOf.get(row.alternative_to) ?? null) : null,
      originalText: row.original_text,
      secondary:
        row.secondary_quantity !== null && row.secondary_unit !== null
          ? {
              quantity: row.secondary_quantity,
              unit: row.secondary_unit,
              scope: row.secondary_scope,
            }
          : null,
    })),
  };
}
