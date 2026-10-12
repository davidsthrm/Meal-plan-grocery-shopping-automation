import "server-only";
import { randomUUID } from "node:crypto";
import type { CatalogIndex } from "@/domain/catalog";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import type { RecipeIngredient, Servings } from "@/domain/recipe";
import { must, type Db } from "../catalog";
import type { CatalogSuggester } from "./read-recipe";

/** A recipe line as it is stored: a domain line plus the name it was read with. */
export interface StoredLine extends RecipeIngredient {
  /** Name as read, used to propose the ingredient when the catalog does not know it. */
  readName: string;
}

export interface StoredRecipe {
  title: string;
  sourceTitle: string | null;
  sourceBook: string | null;
  sourcePage: number | null;
  servings: Servings | null;
  prepMinutes: number | null;
  dishType: ExtractedRecipe["dishType"];
  proteinType: ExtractedRecipe["proteinType"];
  lines: StoredLine[];
}

/** Tag a dish type is filed under, by the tag's name in the household's tag list. */
const DISH_TAG: Partial<Record<ExtractedRecipe["dishType"], string>> = {
  hauptgericht: "Hauptgericht",
  "suppe-eintopf": "Suppe & Eintopf",
  salat: "Salat",
  vesper: "Vesper",
  kuchen: "Kuchen & Süßes",
};
const PROTEIN_TAG: Partial<Record<ExtractedRecipe["proteinType"], string>> = {
  vegetarian: "vegetarisch",
  vegan: "vegan",
};

/**
 * Makes sure every unknown ingredient name has an open proposal and returns the proposal id
 * per name. A name that is already proposed is reused, so ten recipes with "Pak Choi" lead to
 * one question for the household, not ten.
 */
export async function ensureProposals(
  db: Db,
  householdId: string,
  names: string[],
  index: CatalogIndex,
  suggest: CatalogSuggester,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  if (names.length === 0) return byName;
  const key = (name: string) => name.trim().toLowerCase();

  const loadOpen = async () => {
    const open = must(
      await db.from("ingredient_proposal").select("id, name").eq("status", "open"),
      "load open proposals",
    );
    for (const proposal of open) byName.set(key(proposal.name), proposal.id);
  };
  await loadOpen();

  const fresh = [...new Set(names.map((name) => name.trim()))].filter(
    (name) => !byName.has(key(name)),
  );
  if (fresh.length > 0) {
    const proposals = await suggest(fresh, index);
    const { error } = await db.from("ingredient_proposal").insert(
      proposals.map((p) => ({
        household_id: householdId,
        name: p.name,
        same_as_ingredient_id: p.sameAsIngredientId,
        aisle_group_id: p.aisleGroupId,
        preferred_shop_id: p.preferredShopId,
        default_unit: p.defaultUnit,
        buying_mode: p.buyingMode,
        pack_size: p.packSize,
        is_pantry_staple: p.isPantryStaple,
        shelf_life_days: p.shelfLifeDays,
      })),
    );
    // Another recipe of the same batch may have proposed the name in the meantime. That is
    // fine: the open proposal is picked up below.
    if (error && error.code !== "23505") throw new Error(`save proposals: ${error.message}`);
    await loadOpen();
  }
  return new Map(names.map((name) => [name, byName.get(key(name)) as string]));
}

function lineRows(
  householdId: string,
  recipeId: string,
  lines: StoredLine[],
  proposals: Map<string, string>,
) {
  const ids = lines.map(() => randomUUID());
  return lines.map((line, position) => ({
    id: ids[position],
    household_id: householdId,
    recipe_id: recipeId,
    position,
    ingredient_id: line.ingredientId,
    proposal_id: line.ingredientId === null ? (proposals.get(line.readName) ?? null) : null,
    quantity: line.quantity,
    quantity_max: line.quantityMax,
    unit: line.quantity === null ? null : line.unit,
    is_approximate: line.approximate,
    is_optional: line.optional,
    secondary_quantity: line.secondary?.quantity ?? null,
    secondary_unit: line.secondary?.unit ?? null,
    secondary_scope: line.secondary?.scope ?? null,
    alternative_to:
      line.alternativeTo !== null && line.alternativeTo !== position
        ? (ids[line.alternativeTo] ?? null)
        : null,
    original_text: line.originalText,
    note: line.note,
  }));
}

async function writeLines(
  db: Db,
  householdId: string,
  recipeId: string,
  recipe: StoredRecipe,
  index: CatalogIndex,
  suggest: CatalogSuggester,
) {
  const unknown = recipe.lines.filter((l) => l.ingredientId === null).map((l) => l.readName);
  const proposals = await ensureProposals(db, householdId, unknown, index, suggest);
  const rows = lineRows(householdId, recipeId, recipe.lines, proposals);
  if (rows.length === 0) return;
  const { error } = await db.from("recipe_ingredient").insert(rows);
  if (error) throw new Error(`save ingredient lines: ${error.message}`);
}

function recipeColumns(recipe: StoredRecipe, status: "approved" | "needs_review") {
  return {
    title: recipe.title,
    source_title: recipe.sourceTitle,
    source_book: recipe.sourceBook,
    source_page: recipe.sourcePage,
    servings_min: recipe.servings?.min ?? null,
    servings_max: recipe.servings?.max ?? null,
    prep_minutes: recipe.prepMinutes,
    protein_type: recipe.proteinType === "unknown" ? null : recipe.proteinType,
    status,
  };
}

/** Stores a freshly imported recipe with its lines, photos and tags. Returns its id. */
export async function saveImportedRecipe(
  db: Db,
  input: {
    householdId: string;
    recipe: StoredRecipe;
    status: "approved" | "needs_review";
    photoPaths: string[];
    index: CatalogIndex;
    suggest: CatalogSuggester;
  },
): Promise<string> {
  const { householdId, recipe } = input;
  const created = must(
    await db
      .from("recipe")
      .insert({
        household_id: householdId,
        kind: "cookbook",
        ...recipeColumns(recipe, input.status),
      })
      .select("id")
      .single(),
    "save recipe",
  );
  try {
    await writeLines(db, householdId, created.id, recipe, input.index, input.suggest);
    if (input.photoPaths.length > 0) {
      const photos = await db.from("recipe_photo").insert(
        input.photoPaths.map((path, sort_order) => ({
          household_id: householdId,
          recipe_id: created.id,
          storage_path: path,
          sort_order,
        })),
      );
      if (photos.error) throw new Error(`save recipe photos: ${photos.error.message}`);
    }
    const tagNames = [DISH_TAG[recipe.dishType], PROTEIN_TAG[recipe.proteinType]].filter(
      (name): name is string => Boolean(name),
    );
    if (tagNames.length > 0) {
      const tags = must(await db.from("tag").select("id").in("name", tagNames), "load tags");
      if (tags.length > 0) {
        const linked = await db.from("recipe_tag").insert(
          tags.map((tag) => ({
            household_id: householdId,
            recipe_id: created.id,
            tag_id: tag.id,
          })),
        );
        if (linked.error) throw new Error(`save recipe tags: ${linked.error.message}`);
      }
    }
  } catch (error) {
    // The steps above are separate requests. Do not leave half a recipe behind.
    await db.from("recipe").delete().eq("id", created.id);
    throw error;
  }
  return created.id;
}

/** Replaces a recipe's fields and lines with what the household confirmed in review. */
export async function saveReviewedRecipe(
  db: Db,
  input: {
    householdId: string;
    recipeId: string;
    recipe: StoredRecipe;
    index: CatalogIndex;
    suggest: CatalogSuggester;
  },
): Promise<void> {
  const { recipeId, recipe } = input;
  // Lines first: if writing them fails, the recipe is still marked as waiting for review.
  const removed = await db.from("recipe_ingredient").delete().eq("recipe_id", recipeId);
  if (removed.error) throw new Error(`replace ingredient lines: ${removed.error.message}`);
  await writeLines(db, input.householdId, recipeId, recipe, input.index, input.suggest);
  const updated = await db
    .from("recipe")
    .update({ ...recipeColumns(recipe, "approved"), updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (updated.error) throw new Error(`save reviewed recipe: ${updated.error.message}`);
}
