import "server-only";
import { randomUUID } from "node:crypto";
import type { CatalogIndex } from "@/domain/catalog";
import { sameProductName } from "@/domain/import/map-ingredient";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import type { RecipeIngredient, Servings } from "@/domain/recipe";
import { must, type Db } from "../catalog";
import type { CatalogSuggester } from "./read-recipe";

/**
 * The database refused to store a recipe. Trying again would fail the same way, so the caller
 * must record it instead of putting the recipe back in the queue.
 */
export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

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

/** Tag key of a diet the import can tell from the ingredients. */
const DIET_TAG: Partial<Record<ExtractedRecipe["proteinType"], string>> = {
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
  const result = new Map<string, string>();
  if (names.length === 0) return result;

  const loadOpen = async () =>
    must(
      await db.from("ingredient_proposal").select("id, name").eq("status", "open"),
      "load open proposals",
    );
  // "Forellenfilet" and "Forellenfilets" are one question for the household, not two.
  const match = (open: { id: string; name: string }[]) => {
    for (const name of names) {
      const known = open.find((proposal) => sameProductName(proposal.name, name));
      if (known) result.set(name, known.id);
    }
  };
  match(await loadOpen());

  const fresh: string[] = [];
  for (const name of names.map((n) => n.trim())) {
    if (result.has(name) || fresh.some((other) => sameProductName(other, name))) continue;
    fresh.push(name);
  }
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
    match(await loadOpen());
  }
  return result;
}

function lineRows(
  householdId: string,
  recipeId: string,
  lines: StoredLine[],
  proposals: Map<string, string>,
) {
  const ids = lines.map(() => randomUUID());
  return lines.map((line, position) => {
    // A recipe that waits for review may contain anything a model read. What is stored must
    // still satisfy the database's rules, or the recipe could never be saved and reviewed.
    // The checks have already flagged each of these cases for the reviewer.
    const quantity = line.quantity !== null && line.quantity > 0 ? line.quantity : null;
    const quantityMax =
      quantity !== null && line.quantityMax !== null && line.quantityMax > quantity
        ? line.quantityMax
        : null;
    const secondary = line.secondary && line.secondary.quantity > 0 ? line.secondary : null;
    return {
      id: ids[position],
      household_id: householdId,
      recipe_id: recipeId,
      position,
      ingredient_id: line.ingredientId,
      proposal_id: line.ingredientId === null ? (proposals.get(line.readName) ?? null) : null,
      quantity,
      quantity_max: quantityMax,
      // An amount without a known unit is kept as a count rather than thrown away.
      unit: quantity === null ? null : (line.unit ?? ("Stück" as const)),
      is_approximate: line.approximate,
      is_optional: line.optional,
      secondary_quantity: secondary?.quantity ?? null,
      secondary_unit: secondary?.unit ?? null,
      secondary_scope: secondary?.scope ?? null,
      alternative_to:
        line.alternativeTo !== null && line.alternativeTo !== position
          ? (ids[line.alternativeTo] ?? null)
          : null,
      original_text: line.originalText,
      note: line.note,
    };
  });
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
  if (error) throw new StoreError(`save ingredient lines: ${error.message}`);
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
  const inserted = await db
    .from("recipe")
    .insert({
      household_id: householdId,
      kind: "cookbook",
      ...recipeColumns(recipe, input.status),
    })
    .select("id")
    .single();
  if (inserted.error) throw new StoreError(`save recipe: ${inserted.error.message}`);
  const created = inserted.data;
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
      if (photos.error) throw new StoreError(`save recipe photos: ${photos.error.message}`);
    }
    // The dish type is the key of its category tag. Tags are found by key, so the household
    // can rename a category without the import losing it.
    const tagKeys = [
      recipe.dishType === "unbekannt" ? null : recipe.dishType,
      DIET_TAG[recipe.proteinType] ?? null,
    ].filter((key): key is string => key !== null);
    if (tagKeys.length > 0) {
      const tags = must(await db.from("tag").select("id").in("key", tagKeys), "load tags");
      if (tags.length > 0) {
        const linked = await db.from("recipe_tag").insert(
          tags.map((tag) => ({
            household_id: householdId,
            recipe_id: created.id,
            tag_id: tag.id,
          })),
        );
        if (linked.error) throw new StoreError(`save recipe tags: ${linked.error.message}`);
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
  if (removed.error) throw new StoreError(`replace ingredient lines: ${removed.error.message}`);
  await writeLines(db, input.householdId, recipeId, recipe, input.index, input.suggest);
  const updated = await db
    .from("recipe")
    .update({ ...recipeColumns(recipe, "approved"), updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (updated.error) throw new StoreError(`save reviewed recipe: ${updated.error.message}`);
}
