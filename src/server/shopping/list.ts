import "server-only";
import { addDays, type IsoDate } from "@/domain/dates";
import type { Recipe, RecipeIngredient } from "@/domain/recipe";
import { buildShoppingList } from "@/domain/shopping-list/build";
import { presentByAisle, type AisleView, type ViewLine } from "@/domain/shopping-list/present";
import { tripsBetween, type ShoppingTrip } from "@/domain/shopping-list/trips";
import type { LineState, ManualEntry } from "@/domain/shopping-list/types";
import type { CatalogIndex } from "@/domain/catalog";
import type { Household } from "../auth";
import { allRows, loadCatalogIndex, must, type Db } from "../catalog";
import { loadExtras, loadWeeks } from "../planning/week";

/**
 * The shopping lists of a week: one per shopping day. Their lines are worked out from the
 * plan every time they are shown, so they can never disagree with the plan. What the
 * household adds or changes by hand is stored per shopping day: typed entries, and per line
 * the check-off, the note and "we have that".
 */

/** The list of one shopping day. */
export interface DayList {
  trip: ShoppingTrip;
  /** The list as one walk through a shop: by kind of grocery, whichever shop a thing is from. */
  view: AisleView;
  /** Lines still to buy, and lines ticked off. */
  open: number;
  done: number;
}

export interface WeekLists {
  /**
   * The shopping days of the week, in order. A day before the week is among them when it
   * buys for the week: Saturday's market for Monday.
   */
  days: DayList[];
  index: CatalogIndex;
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

export async function loadShoppingLists(
  db: Db,
  household: Pick<Household, "shoppingDays">,
  weekStart: IsoDate,
): Promise<WeekLists> {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: IsoDate) => date >= weekStart && date <= weekEnd;
  // A shopping day can buy for two weeks, so the weeks around this one are read with it.
  const [weeks, extras, index, listRows] = await Promise.all([
    loadWeeks(db, addDays(weekStart, -7), addDays(weekStart, 7)),
    loadExtras(db, weekStart),
    loadCatalogIndex(db),
    db
      .from("shopping_list")
      .select("id, shopping_date")
      .gte("shopping_date", addDays(weekStart, -7))
      .lte("shopping_date", weekEnd),
  ]);
  const slots = weeks.flatMap((week) => week.slots);
  const lists = must(listRows, "load shopping lists");
  const listIds = lists.map((list) => list.id);
  const dateOf = new Map(lists.map((list) => [list.id, list.shopping_date]));
  const recipeIds = [
    ...new Set([
      ...slots.flatMap((slot) =>
        slot.kind === "recipes" ? slot.items.map((item) => item.recipeId) : [],
      ),
      ...extras.map((extra) => extra.recipeId),
    ]),
  ];
  const [recipes, entryRows, stateRows] = await Promise.all([
    loadRecipes(db, recipeIds),
    listIds.length > 0
      ? db
          .from("shopping_manual_entry")
          .select("id, shopping_list_id, text, shop_id, aisle_group_id")
          .in("shopping_list_id", listIds)
          .order("created_at")
      : null,
    listIds.length > 0
      ? db
          .from("shopping_line_state")
          .select("shopping_list_id, line_key, at_home, shop_id, note, checked_at")
          .in("shopping_list_id", listIds)
      : null,
  ]);
  const entries = (entryRows ? must(entryRows, "load typed entries") : []).map(
    (row): ManualEntry => ({
      id: row.id,
      text: row.text,
      shoppingDate: dateOf.get(row.shopping_list_id),
      shopId: row.shop_id,
      aisleGroupId: row.aisle_group_id,
    }),
  );
  // What the household changed on a line, per shopping day.
  const states = new Map<IsoDate, Record<string, LineState>>();
  for (const row of stateRows ? must(stateRows, "load line states") : []) {
    const date = dateOf.get(row.shopping_list_id) as IsoDate;
    const ofDay = states.get(date) ?? {};
    ofDay[row.line_key] = {
      ...(row.at_home !== null ? { atHome: row.at_home } : {}),
      ...(row.note !== null ? { note: row.note === "" ? null : row.note } : {}),
      ...(row.shop_id !== null ? { shopId: row.shop_id } : {}),
      checked: row.checked_at !== null,
    };
    states.set(date, ofDay);
  }

  // Far enough back that the first meal read has a shopping day before it.
  const trips = tripsBetween(household.shoppingDays, addDays(weekStart, -14), addDays(weekEnd, 7));
  const ofWeek = trips.filter((trip) => inWeek(trip.date));
  const lines = buildShoppingList({
    index,
    recipes,
    slots,
    extras,
    trips,
    // The week's first trip to the supermarket.
    extrasDate: (ofWeek.find((trip) => trip.kind === "all") ?? ofWeek[0])?.date,
    manualEntries: entries,
  });
  const buysForWeek = (date: IsoDate) =>
    lines.some(
      (line) =>
        line.shoppingDate === date &&
        line.contributions.some(
          ({ source }) =>
            (source.type === "recipe" || source.type === "food") && inWeek(source.date),
        ),
    );
  const days = trips
    .filter((trip) => inWeek(trip.date) || (trip.date < weekStart && buysForWeek(trip.date)))
    .map((trip): DayList => {
      const view = presentByAisle(
        lines.filter((line) => line.shoppingDate === trip.date),
        states.get(trip.date) ?? {},
        index,
      );
      const toBuy = [...view.groups.flatMap((group) => group.lines), ...view.later];
      const done = toBuy.filter((line) => line.checked).length;
      return { trip, view, open: toBuy.length - done, done };
    });
  return { days, index };
}

/** Whether the household shops on a day. Nothing is stored for a day it does not. */
export function isShoppingDay(household: Pick<Household, "shoppingDays">, date: IsoDate): boolean {
  return tripsBetween(household.shoppingDays, date, date).length > 0;
}

/** The id of a shopping day's list. It comes into being with the first thing stored on it. */
async function ensureList(db: Db, householdId: string, date: IsoDate): Promise<string> {
  const list = must(
    await db
      .from("shopping_list")
      .upsert(
        { household_id: householdId, shopping_date: date },
        { onConflict: "household_id,shopping_date" },
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
  household: Pick<Household, "id" | "userId">,
  date: IsoDate,
  text: string,
): Promise<void> {
  const listId = await ensureList(db, household.id, date);
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
 * Stores what the household changed on one line of a shopping day's list. The line is known
 * by its key, which stays the same when the plan changes, so the change stays with the line.
 */
export async function changeLine(
  db: Db,
  household: Pick<Household, "id" | "userId">,
  date: IsoDate,
  lineKey: string,
  change: { checked: boolean } | { atHome: boolean } | { note: string },
): Promise<void> {
  const listId = await ensureList(db, household.id, date);
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

/**
 * The shop a line names on purpose, such as the bakery for the bread of a cold supper. Null
 * for everything that is simply bought where it always is: the list does not sort by shop.
 */
export function chosenShop(index: CatalogIndex, view: ViewLine): string | null {
  return view.line.shopByChoice ? (index.shopById.get(view.shopId)?.name ?? null) : null;
}
