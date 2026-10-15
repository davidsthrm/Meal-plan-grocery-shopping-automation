import "server-only";
import { PROTEIN_TYPES } from "@/domain/import/extraction";
import {
  comparableIngredients,
  findDuplicates,
  orderedPair,
  pairKey,
  type DuplicatePair,
} from "@/domain/library/duplicates";
import { searchKey } from "@/domain/library/filter";
import {
  checkLibrary,
  isCheckedField,
  type CheckedField,
  type QualityRecipe,
  type RecipeCheck,
} from "@/domain/library/quality";
import type { Category, ProteinType, RecipeSummary } from "@/domain/library/summary";
import { EFFORTS } from "@/domain/library/tags";
import { UNITS } from "@/domain/units";
import { allRows, must, type Db } from "./catalog";
import { loadLibrary, loadTagIds } from "./library";
import { setCategory } from "./recipes";

/**
 * The checks of the library on the import's "Prüfen" page: fields the import assigned that do
 * not fit the rest of a recipe, and recipes that are the same dish twice. Both are worked out
 * from the library every time they are shown; stored are only the household's decisions
 * (`recipe.checked_fields`, `recipe_pair_kept`).
 */

/** A recipe as both checks see it, with what the pages show of it. */
export interface CheckedRecipe {
  summary: RecipeSummary;
  /** Ingredient names: the catalog's, or the printed line. Alternatives left out. */
  ingredients: string[];
  /** The same with the key each is compared by, in the printed order. */
  lines: { name: string; key: string }[];
  /** Ingredient keys for the comparison of duplicates. */
  comparable: string[];
  checked: CheckedField[];
}

export interface LibraryChecks {
  recipes: Map<string, CheckedRecipe>;
  categories: Category[];
}

/** "200 g Lachsfilet, in Würfeln" → "lachsfilet". */
function printedName(line: string): string {
  const units = new Set(UNITS.map((unit) => unit.toLowerCase()));
  const words = line.split(",")[0].trim().split(/\s+/);
  while (words.length > 1 && /^[\d.,/½¼¾⅓⅔–-]+$/.test(words[0])) words.shift();
  if (words.length > 1 && units.has(words[0].toLowerCase().replace(/\.$/, ""))) words.shift();
  return searchKey(words.join(" "));
}

/** Loads the approved recipes with their ingredients, as both checks need them. */
export async function loadLibraryChecks(db: Db): Promise<LibraryChecks> {
  const [library, checkedRows, lines, catalog, proposals] = await Promise.all([
    loadLibrary(db),
    allRows(
      (from, to) =>
        db
          .from("recipe")
          .select("id, checked_fields")
          .eq("status", "approved")
          .order("id")
          .range(from, to),
      "load checked fields",
    ),
    allRows(
      (from, to) =>
        db
          .from("recipe_ingredient")
          .select("recipe_id, ingredient_id, proposal_id, original_text, alternative_to")
          .order("recipe_id")
          .order("position")
          .range(from, to),
      "load ingredient lines",
    ),
    allRows(
      (from, to) =>
        db.from("ingredient").select("id, name, is_pantry_staple").order("id").range(from, to),
      "load ingredients",
    ),
    allRows(
      (from, to) => db.from("ingredient_proposal").select("id, name").order("id").range(from, to),
      "load proposals",
    ),
  ]);
  const ingredientOf = new Map(catalog.map((row) => [row.id, row]));
  const proposalName = new Map(proposals.map((row) => [row.id, row.name]));
  const checkedOf = new Map(
    checkedRows.map((row) => [row.id, row.checked_fields.filter(isCheckedField)]),
  );
  const linesOf = new Map<string, { name: string; key: string; staple: boolean }[]>();
  for (const line of lines) {
    // "oder Petersilie" is not what the dish is made of.
    if (line.alternative_to !== null) continue;
    const known = line.ingredient_id ? ingredientOf.get(line.ingredient_id) : undefined;
    const proposed = line.proposal_id ? proposalName.get(line.proposal_id) : undefined;
    const entry = known
      ? { name: known.name, key: known.id, staple: known.is_pantry_staple }
      : {
          name: proposed ?? line.original_text,
          key: proposed ? searchKey(proposed) : printedName(line.original_text),
          staple: false,
        };
    linesOf.set(line.recipe_id, [...(linesOf.get(line.recipe_id) ?? []), entry]);
  }
  const recipes = new Map<string, CheckedRecipe>();
  for (const summary of library.recipes) {
    const own = linesOf.get(summary.id) ?? [];
    recipes.set(summary.id, {
      summary,
      ingredients: own.map((line) => line.name),
      lines: own.map(({ name, key }) => ({ name, key })),
      comparable: comparableIngredients(own),
      checked: checkedOf.get(summary.id) ?? [],
    });
  }
  return { recipes, categories: library.categories };
}

function qualityRecipe(recipe: CheckedRecipe): QualityRecipe {
  const { summary } = recipe;
  return {
    id: summary.id,
    title: summary.title,
    category: summary.category,
    proteinType: summary.proteinType,
    prepMinutes: summary.prepMinutes,
    servings: summary.servings,
    tags: summary.tags,
    ingredients: recipe.ingredients,
    checked: recipe.checked,
  };
}

/** The household's name for a category key. */
export function categoryNamer(categories: readonly Category[]): (key: string) => string {
  const names = new Map(categories.map((category) => [category.key, category.name]));
  return (key) => names.get(key) ?? key;
}

/** The recipes whose assigned fields do not fit, the least trustworthy first. */
export function recipeChecks(checks: LibraryChecks): RecipeCheck[] {
  return checkLibrary(
    [...checks.recipes.values()].map(qualityRecipe),
    categoryNamer(checks.categories),
  );
}

/** The pairs of recipes that are probably the same dish, without those kept both of. */
export async function duplicatePairs(db: Db, checks: LibraryChecks): Promise<DuplicatePair[]> {
  const kept = await allRows(
    (from, to) =>
      db
        .from("recipe_pair_kept")
        .select("recipe_a, recipe_b")
        .order("recipe_a")
        .order("recipe_b")
        .range(from, to),
    "load kept pairs",
  );
  return findDuplicates(
    [...checks.recipes.values()].map((recipe) => ({
      id: recipe.summary.id,
      title: recipe.summary.title,
      sourceBook: recipe.summary.sourceBook,
      sourcePage: recipe.summary.sourcePage,
      ingredients: recipe.comparable,
    })),
    new Set(kept.map((pair) => pairKey(pair.recipe_a, pair.recipe_b))),
  );
}

/** How often each of these recipes was on a plan, as a meal or an extra. */
export async function timesPlanned(db: Db, ids: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const [meals, extras] = await Promise.all([
    allRows(
      (from, to) =>
        db
          .from("plan_slot_item")
          .select("recipe_id")
          .in("recipe_id", ids)
          .order("id")
          .range(from, to),
      "load planned meals",
    ),
    allRows(
      (from, to) =>
        db.from("plan_extra").select("recipe_id").in("recipe_id", ids).order("id").range(from, to),
      "load planned extras",
    ),
  ]);
  for (const row of [...meals, ...extras]) {
    counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1);
  }
  return counts;
}

/** A field as it is set by hand. Anything not understood is null. */
export type FieldValue =
  | { field: "protein"; protein: ProteinType | null }
  | { field: "category"; category: string | null }
  /** Minutes left out stay as they are. */
  | { field: "time"; minutes?: number | null; effort: string | null }
  | {
      field: "servings";
      servings: { min: number; max: number; unit: string | null };
    };

const PROTEINS = PROTEIN_TYPES.filter((type) => type !== "unknown") as readonly ProteinType[];

export function isProtein(value: string): value is ProteinType {
  return (PROTEINS as readonly string[]).includes(value);
}

export function isEffort(value: string): boolean {
  return (EFFORTS as readonly string[]).includes(value);
}

/** Adds fields to what a person checked of these recipes. */
export async function markChecked(
  db: Db,
  marks: readonly { recipeId: string; fields: readonly CheckedField[] }[],
): Promise<void> {
  const wanted = marks.filter((mark) => mark.fields.length > 0);
  if (wanted.length === 0) return;
  const rows = must(
    await db
      .from("recipe")
      .select("id, checked_fields")
      .in(
        "id",
        wanted.map((mark) => mark.recipeId),
      ),
    "load checked fields",
  );
  const before = new Map(rows.map((row) => [row.id, row.checked_fields]));
  await Promise.all(
    wanted.map(async (mark) => {
      const had = before.get(mark.recipeId);
      if (!had) return;
      const fields = [...new Set([...had, ...mark.fields])];
      if (fields.length === had.length) return;
      const updated = await db
        .from("recipe")
        .update({ checked_fields: fields })
        .eq("id", mark.recipeId);
      if (updated.error) throw new Error(`mark fields checked: ${updated.error.message}`);
    }),
  );
}

/** Sets the effort of recipes, by its key, replacing the one they had. */
async function setEffort(
  db: Db,
  householdId: string,
  recipeIds: readonly string[],
  effort: string | null,
): Promise<void> {
  const tagIds = await loadTagIds(db);
  const effortIds = EFFORTS.flatMap((key) => tagIds.get(key) ?? []);
  const removed = await db
    .from("recipe_tag")
    .delete()
    .in("recipe_id", recipeIds)
    .in("tag_id", effortIds);
  if (removed.error) throw new Error(`clear effort: ${removed.error.message}`);
  const chosen = effort ? tagIds.get(effort) : undefined;
  if (!chosen) return;
  const linked = await db
    .from("recipe_tag")
    .insert(
      recipeIds.map((recipe_id) => ({ household_id: householdId, recipe_id, tag_id: chosen })),
    );
  if (linked.error) throw new Error(`set effort: ${linked.error.message}`);
}

/**
 * Sets one field of recipes by hand, and marks it as checked: a person decided it. The same
 * value for all of them, for a change of several at once.
 */
export async function setField(
  db: Db,
  householdId: string,
  recipeIds: readonly string[],
  value: FieldValue,
): Promise<void> {
  if (recipeIds.length === 0) return;
  const now = new Date().toISOString();
  if (value.field === "protein") {
    const updated = await db
      .from("recipe")
      .update({ protein_type: value.protein, updated_at: now })
      .in("id", recipeIds);
    if (updated.error) throw new Error(`set kind: ${updated.error.message}`);
  } else if (value.field === "category") {
    await setCategory(db, householdId, recipeIds, value.category);
  } else if (value.field === "time") {
    if (value.minutes !== undefined) {
      const updated = await db
        .from("recipe")
        .update({ prep_minutes: value.minutes, updated_at: now })
        .in("id", recipeIds);
      if (updated.error) throw new Error(`set time: ${updated.error.message}`);
    }
    await setEffort(db, householdId, recipeIds, value.effort);
  } else {
    const updated = await db
      .from("recipe")
      .update({
        servings_min: value.servings.min,
        servings_max: value.servings.max,
        servings_unit: value.servings.unit,
        updated_at: now,
      })
      .in("id", recipeIds);
    if (updated.error) throw new Error(`set servings: ${updated.error.message}`);
  }
  await markChecked(
    db,
    recipeIds.map((recipeId) => ({ recipeId, fields: [value.field] })),
  );
}

/**
 * Takes what a check suggests for each of these recipes: the kind, the category or the
 * effort it names. Findings without a suggestion stay.
 */
export async function takeSuggestions(
  db: Db,
  householdId: string,
  checks: readonly RecipeCheck[],
  only: CheckedField | null,
): Promise<void> {
  // Recipes that get the same value are changed together.
  const groups = new Map<string, { value: FieldValue; ids: string[] }>();
  for (const check of checks) {
    for (const finding of check.findings) {
      if (finding.suggestion === null || (only && finding.field !== only)) continue;
      const value = suggestedValue(finding.field, finding.suggestion);
      if (!value) continue;
      const key = JSON.stringify(value);
      const group = groups.get(key) ?? { value, ids: [] };
      group.ids.push(check.recipe.id);
      groups.set(key, group);
    }
  }
  for (const { value, ids } of groups.values()) await setField(db, householdId, ids, value);
}

/** The value a suggestion stands for, with the rest of the field as it is. */
export function suggestedValue(field: CheckedField, suggestion: string): FieldValue | null {
  if (field === "protein") return isProtein(suggestion) ? { field, protein: suggestion } : null;
  if (field === "category") return { field, category: suggestion };
  if (field === "time" && isEffort(suggestion)) return { field, effort: suggestion };
  return null;
}

/** The household keeps both recipes of a pair: it is not shown as duplicates again. */
export async function keepBoth(db: Db, householdId: string, one: string, other: string) {
  const [recipe_a, recipe_b] = orderedPair(one, other);
  const kept = await db
    .from("recipe_pair_kept")
    .upsert({ household_id: householdId, recipe_a, recipe_b }, { ignoreDuplicates: true });
  if (kept.error) throw new Error(`keep both recipes: ${kept.error.message}`);
}

/**
 * Merges a duplicate into the recipe that is kept and deletes the duplicate, in one
 * transaction (`merge_recipes`): its meals, extras, favourite, wish and the household's own
 * tags go to the kept one.
 */
export async function mergeRecipes(db: Db, keepId: string, dropId: string): Promise<void> {
  const merged = await db.rpc("merge_recipes", { keep_id: keepId, drop_id: dropId });
  if (merged.error) throw new Error(`merge recipes: ${merged.error.message}`);
}
