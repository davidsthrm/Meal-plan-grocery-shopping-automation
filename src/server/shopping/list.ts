import "server-only";
import { addDays, type IsoDate } from "@/domain/dates";
import type { Recipe, RecipeIngredient } from "@/domain/recipe";
import { buildShoppingList } from "@/domain/shopping-list/build";
import { presentList, type ListView } from "@/domain/shopping-list/present";
import type { LineState, ManualEntry } from "@/domain/shopping-list/types";
import type { CatalogIndex } from "@/domain/catalog";
import type { Household } from "../auth";
import { allRows, loadCatalogIndex, must, type Db } from "../catalog";
import { ensureWeek, loadExtras, loadWeek } from "../planning/week";

/**
 * The shopping list of a week. Its lines are worked out from the plan every time it is
 * shown, so it can never disagree with the plan. What the household adds or changes by hand
 * is stored: typed entries, and per line the check-off, the note and "we have that".
 */

export interface WeekList {
  view: ListView;
  /** What the household typed onto the list. */
  entries: ManualEntry[];
  index: CatalogIndex;
  /** Day of the main shopping trip. */
  shoppingDate: IsoDate;
  /** False for a week with nothing planned and nothing typed. */
  hasContent: boolean;
}

/** The recipes of a week with their ingredient lines, as the list builder needs them. */
async function loadRecipes(db: Db, ids: string[]): Promise<Recipe[]> {
  if (ids.length === 0) return [];
  const [recipes, lines] = await Promise.all([
    db
      .from("recipe")
      .select("id, title, kind, servings_min, servings_max, servings_unit")
      .in("id", ids),
    allRows(
      (from, to) =>
        db
          .from("recipe_ingredient")
          .select(
            "recipe_id, position, ingredient_id, quantity, quantity_max, unit, is_approximate, is_optional, secondary_quantity, secondary_unit, secondary_scope, alternative_to, original_text, note",
          )
          .in("recipe_id", ids)
          .order("recipe_id")
          .order("position")
          .range(from, to),
      "load ingredient lines",
    ),
  ]);
  return must(recipes, "load planned recipes").map((recipe): Recipe => ({
    id: recipe.id,
    title: recipe.title,
    kind: recipe.kind,
    // An approved recipe always has servings. One without is planned as written.
    servings: {
      min: recipe.servings_min ?? 1,
      max: recipe.servings_max ?? recipe.servings_min ?? 1,
      unit: recipe.servings_unit,
    },
    ingredients: lines
      .filter((line) => line.recipe_id === recipe.id)
      .map((line): RecipeIngredient => ({
        ingredientId: line.ingredient_id,
        quantity: line.quantity,
        quantityMax: line.quantity_max,
        unit: line.unit,
        approximate: line.is_approximate,
        secondary:
          line.secondary_quantity !== null && line.secondary_unit !== null
            ? {
                quantity: line.secondary_quantity,
                unit: line.secondary_unit,
                scope: line.secondary_scope,
              }
            : null,
        // The list only needs to know that a line is an alternative, not to which one.
        alternativeTo: line.alternative_to === null ? null : 0,
        optional: line.is_optional,
        originalText: line.original_text,
        note: line.note,
      })),
  }));
}

export async function loadShoppingList(
  db: Db,
  household: Pick<Household, "shoppingWeekday">,
  weekStart: IsoDate,
): Promise<WeekList> {
  const [slots, extras, index, plan] = await Promise.all([
    loadWeek(db, weekStart),
    loadExtras(db, weekStart),
    loadCatalogIndex(db),
    db.from("week_plan").select("id").eq("week_start", weekStart).maybeSingle(),
  ]);
  const recipeIds = [
    ...new Set([
      ...slots.flatMap((slot) =>
        slot.kind === "recipes" ? slot.items.map((item) => item.recipeId) : [],
      ),
      ...extras.map((extra) => extra.recipeId),
    ]),
  ];
  const list = plan.data
    ? (await db.from("shopping_list").select("id").eq("week_plan_id", plan.data.id).maybeSingle())
        .data
    : null;
  const [recipes, entryRows, stateRows] = await Promise.all([
    loadRecipes(db, recipeIds),
    list
      ? db
          .from("shopping_manual_entry")
          .select("id, text, shop_id, aisle_group_id")
          .eq("shopping_list_id", list.id)
          .order("created_at")
      : null,
    list
      ? db
          .from("shopping_line_state")
          .select("line_key, at_home, shop_id, note, checked_at")
          .eq("shopping_list_id", list.id)
      : null,
  ]);
  const entries = (entryRows ? must(entryRows, "load typed entries") : []).map(
    (row): ManualEntry => ({
      id: row.id,
      text: row.text,
      shopId: row.shop_id,
      aisleGroupId: row.aisle_group_id,
    }),
  );
  const states: Record<string, LineState> = {};
  for (const row of stateRows ? must(stateRows, "load line states") : []) {
    states[row.line_key] = {
      ...(row.at_home !== null ? { atHome: row.at_home } : {}),
      ...(row.note !== null ? { note: row.note === "" ? null : row.note } : {}),
      ...(row.shop_id !== null ? { shopId: row.shop_id } : {}),
      checked: row.checked_at !== null,
    };
  }

  const shoppingDate = addDays(weekStart, household.shoppingWeekday - 1);
  const lines = buildShoppingList({
    index,
    recipes,
    slots,
    extras,
    shoppingDate,
    manualEntries: entries,
  });
  return {
    view: presentList(lines, states, index),
    entries,
    index,
    shoppingDate,
    hasContent: lines.length > 0,
  };
}

/** The id of a week's list. It comes into being with the first thing stored on it. */
async function ensureList(
  db: Db,
  household: Pick<Household, "id" | "shoppingWeekday">,
  weekStart: IsoDate,
): Promise<string> {
  const planId = await ensureWeek(db, household.id, weekStart);
  const list = must(
    await db
      .from("shopping_list")
      .upsert(
        {
          household_id: household.id,
          week_plan_id: planId,
          shopping_date: addDays(weekStart, household.shoppingWeekday - 1),
        },
        { onConflict: "week_plan_id" },
      )
      .select("id")
      .single(),
    "open shopping list",
  );
  return list.id;
}

/** Adds a line as the household writes it: "Milch WS 1.29", "Geschenkpapier". */
export async function addEntry(
  db: Db,
  household: Pick<Household, "id" | "shoppingWeekday" | "userId">,
  weekStart: IsoDate,
  text: string,
): Promise<void> {
  const listId = await ensureList(db, household, weekStart);
  const stored = await db.from("shopping_manual_entry").insert({
    household_id: household.id,
    shopping_list_id: listId,
    text,
    created_by: household.userId,
  });
  if (stored.error) throw new Error(`add entry: ${stored.error.message}`);
}

export async function removeEntry(db: Db, entryId: string): Promise<void> {
  const removed = await db.from("shopping_manual_entry").delete().eq("id", entryId);
  if (removed.error) throw new Error(`remove entry: ${removed.error.message}`);
}

/**
 * Stores what the household changed on one line. The line is known by its key, which stays
 * the same when the plan changes, so the change stays with the line.
 */
export async function changeLine(
  db: Db,
  household: Pick<Household, "id" | "shoppingWeekday" | "userId">,
  weekStart: IsoDate,
  lineKey: string,
  change: { checked: boolean } | { atHome: boolean } | { note: string },
): Promise<void> {
  const listId = await ensureList(db, household, weekStart);
  const values =
    "checked" in change
      ? {
          checked_at: change.checked ? new Date().toISOString() : null,
          checked_by: change.checked ? household.userId : null,
        }
      : "atHome" in change
        ? { at_home: change.atHome }
        : // An empty note is stored as such: it says "no note", also where the line has one.
          { note: change.note };
  const stored = await db.from("shopping_line_state").upsert(
    {
      household_id: household.id,
      shopping_list_id: listId,
      line_key: lineKey,
      updated_at: new Date().toISOString(),
      ...values,
    },
    { onConflict: "shopping_list_id,line_key" },
  );
  if (stored.error) throw new Error(`change line: ${stored.error.message}`);
}
