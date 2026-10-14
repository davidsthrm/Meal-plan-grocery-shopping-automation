import "server-only";
import { PLACES, type CatalogIndex, type Place } from "@/domain/catalog";
import { addDays, isIsoDate, type IsoDate } from "@/domain/dates";
import type { Recipe, RecipeIngredient } from "@/domain/recipe";
import { buildShoppingList, moveKey } from "@/domain/shopping-list/build";
import { presentByAisle, type AisleView, type ViewLine } from "@/domain/shopping-list/present";
import { noteId, tripsBetween, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { dayOf, type LineState, type ManualEntry } from "@/domain/shopping-list/types";
import type { Household } from "../auth";
import { allRows, loadCatalogIndex, must, type Db } from "../catalog";
import { loadExtras, loadWeeks } from "../planning/week";

/**
 * The shopping notes of a week: one per errand, which is a place on a day. Their lines are
 * worked out from the plan every time they are shown, so they can never disagree with the
 * plan. What the household adds or changes by hand is stored per note: typed entries, and
 * per line the check-off, the note, "we have that", and the note it was moved to.
 */

/** The note of one errand. */
export interface NoteList {
  trip: ShoppingTrip;
  /** The note as an address: "2026-10-12.supermarket". */
  id: string;
  /** The note as one walk through a shop: by kind of grocery. */
  view: AisleView;
  /** Lines still to buy, and lines ticked off. */
  open: number;
  done: number;
  /**
   * The errand is done: everything on the note is ticked. With the name of whoever made the
   * last tick, where the household knows it.
   */
  completed: { by: string | null } | null;
}

export interface WeekNotes {
  /**
   * The errands of the week, in order: the household's shopping days, and every other day
   * something is bought on. One before the week is among them when it buys for the week:
   * Saturday's market for Monday.
   */
  notes: NoteList[];
  /** What is needed and at home, over all notes. */
  atHome: { trip: ShoppingTrip; line: ViewLine }[];
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

export async function loadShoppingNotes(
  db: Db,
  household: Pick<Household, "shoppingDays">,
  weekStart: IsoDate,
): Promise<WeekNotes> {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: IsoDate) => date >= weekStart && date <= weekEnd;
  // An errand can buy for two weeks, so the weeks around this one are read with it.
  const [weeks, extrasAround, index, memberRows, listRows] = await Promise.all([
    loadWeeks(db, addDays(weekStart, -7), addDays(weekStart, 7)),
    Promise.all([-7, 0, 7].map((days) => loadExtras(db, addDays(weekStart, days)))),
    loadCatalogIndex(db),
    db.from("household_member").select("user_id, display_name"),
    db
      .from("shopping_list")
      .select("id, shopping_date, place")
      .gte("shopping_date", addDays(weekStart, -7))
      .lte("shopping_date", weekEnd),
  ]);
  const slots = weeks.flatMap((week) => week.slots);
  // The weeks around buy their extras for a day like their meals. One without a day is
  // bought on its own week's first supermarket day, which only this week's notes show.
  const extras = extrasAround.flatMap((list, at) =>
    at === 1 ? list : list.filter((extra) => extra.date),
  );
  const lists = must(listRows, "load shopping lists");
  const listIds = lists.map((list) => list.id);
  const tripOf = new Map(
    lists.map((list) => [list.id, { date: list.shopping_date, place: list.place as Place }]),
  );
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
          .select(
            "shopping_list_id, line_key, at_home, shop_id, note, checked_at, checked_by, moved_date, moved_place",
          )
          .in("shopping_list_id", listIds)
      : null,
  ]);
  const entries = (entryRows ? must(entryRows, "load typed entries") : []).map(
    (row): ManualEntry => ({
      id: row.id,
      text: row.text,
      shoppingDate: tripOf.get(row.shopping_list_id)?.date,
      place: tripOf.get(row.shopping_list_id)?.place,
      shopId: row.shop_id,
      aisleGroupId: row.aisle_group_id,
    }),
  );
  // What the household changed on a line, per note, and the lines it moved to another one.
  const states = new Map<string, Record<string, LineState>>();
  const moves = new Map<string, ShoppingTrip>();
  // Who ticked a line, and when: the last tick on a note says who finished the errand.
  const ticks = new Map<string, { at: string; by: string | null }>();
  for (const row of stateRows ? must(stateRows, "load line states") : []) {
    const trip = tripOf.get(row.shopping_list_id) as ShoppingTrip;
    if (row.checked_at !== null) {
      ticks.set(`${noteId(trip)}|${row.line_key}`, { at: row.checked_at, by: row.checked_by });
    }
    if (row.moved_date !== null && row.moved_place !== null) {
      moves.set(moveKey(trip, row.line_key), {
        date: row.moved_date,
        place: row.moved_place as Place,
      });
    }
    const ofNote = states.get(noteId(trip)) ?? {};
    ofNote[row.line_key] = {
      ...(row.at_home !== null ? { atHome: row.at_home } : {}),
      ...(row.note !== null ? { note: row.note === "" ? null : row.note } : {}),
      ...(row.shop_id !== null ? { shopId: row.shop_id } : {}),
      checked: row.checked_at !== null,
    };
    states.set(noteId(trip), ofNote);
  }

  // Far enough back that the first meal read has a shopping day before it.
  const trips = tripsBetween(household.shoppingDays, addDays(weekStart, -14), addDays(weekEnd, 7));
  const lines = buildShoppingList({
    index,
    recipes,
    slots,
    extras,
    trips,
    // The week's first trip to the supermarket.
    extrasDate: trips.find((trip) => inWeek(trip.date) && trip.place === "supermarket")?.date,
    manualEntries: entries,
    moves,
  });
  const linesOf = (trip: ShoppingTrip) =>
    lines.filter((line) => line.shoppingDate === trip.date && line.place === trip.place);
  const buysForWeek = (trip: ShoppingTrip) =>
    linesOf(trip).some((line) =>
      line.contributions.some(({ source }) => {
        const day = dayOf(source);
        return day !== null && inWeek(day);
      }),
    );
  // The household's shopping days of the week, and every other day something is bought on:
  // the bakery on the day of a cold supper, a note the household moved to another day.
  const shown = new Map<string, ShoppingTrip>();
  for (const trip of trips) if (inWeek(trip.date)) shown.set(noteId(trip), trip);
  for (const line of lines) {
    const trip = { date: line.shoppingDate, place: line.place };
    if (inWeek(trip.date) || (trip.date < weekStart && buysForWeek(trip))) {
      shown.set(noteId(trip), trip);
    }
  }
  const inOrder = [...shown.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || PLACES.indexOf(a.place) - PLACES.indexOf(b.place),
  );
  const nameOf = new Map(
    must(memberRows, "load members").map((member) => [member.user_id, member.display_name]),
  );

  const atHome: WeekNotes["atHome"] = [];
  const notes = inOrder.map((trip): NoteList => {
    const id = noteId(trip);
    const view = presentByAisle(linesOf(trip), states.get(id) ?? {}, index);
    atHome.push(...view.atHome.map((line) => ({ trip, line })));
    const toBuy = view.groups.flatMap((group) => group.lines);
    const done = toBuy.filter((line) => line.checked).length;
    const last = toBuy
      .flatMap((line) => ticks.get(`${id}|${line.line.key}`) ?? [])
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    return {
      trip,
      id,
      view,
      open: toBuy.length - done,
      done,
      completed:
        toBuy.length > 0 && done === toBuy.length
          ? { by: (last?.by && nameOf.get(last.by)) || null }
          : null,
    };
  });
  atHome.sort((a, b) => a.line.line.label.localeCompare(b.line.line.label, "de"));
  return { notes, atHome, index };
}

/**
 * Whether something can be a note: a known place on a real day. Any day will do, not only
 * the household's shopping days: the bakery is gone to when a meal asks for bread, and an
 * errand can be moved to another day.
 */
export function isNote(trip: ShoppingTrip): boolean {
  return PLACES.includes(trip.place) && isIsoDate(trip.date);
}

/** The id of a note's list. It comes into being with the first thing stored on it. */
async function ensureList(db: Db, householdId: string, trip: ShoppingTrip): Promise<string> {
  const list = must(
    await db
      .from("shopping_list")
      .upsert(
        { household_id: householdId, shopping_date: trip.date, place: trip.place },
        { onConflict: "household_id,shopping_date,place" },
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
  trip: ShoppingTrip,
  text: string,
): Promise<void> {
  const listId = await ensureList(db, household.id, trip);
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

async function storeState(
  db: Db,
  household: Pick<Household, "id">,
  trip: ShoppingTrip,
  lineKey: string,
  values: {
    checked_at?: string | null;
    checked_by?: string | null;
    at_home?: boolean;
    note?: string;
    moved_date?: string | null;
    moved_place?: string | null;
  },
): Promise<void> {
  const listId = await ensureList(db, household.id, trip);
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
 * Stores what the household changed on one line of a note. The line is known by its key,
 * which stays the same when the plan changes, so the change stays with the line.
 */
export async function changeLine(
  db: Db,
  household: Pick<Household, "id" | "userId">,
  trip: ShoppingTrip,
  lineKey: string,
  change: { checked: boolean } | { atHome: boolean } | { note: string },
): Promise<void> {
  await storeState(
    db,
    household,
    trip,
    lineKey,
    "checked" in change
      ? {
          checked_at: change.checked ? new Date().toISOString() : null,
          checked_by: change.checked ? household.userId : null,
        }
      : "atHome" in change
        ? { at_home: change.atHome }
        : // An empty note is stored as such: it says "no note", also where the line has one.
          { note: change.note },
  );
}

/** A line as far as moving it needs to know it: its key, and the notes its parts are from. */
export interface LineToMove {
  key: string;
  origins: readonly ShoppingTrip[];
}

/**
 * Moves lines to another note: the household decided to buy them on another errand. What
 * makes up a line may come from several notes, one of them the target itself. Each part is
 * told where to go, and a part that is at home on the target is no longer moved.
 */
export async function moveLines(
  db: Db,
  household: Pick<Household, "id">,
  lines: readonly LineToMove[],
  target: ShoppingTrip,
): Promise<void> {
  const listOf = new Map<string, string>();
  const rows = [];
  for (const line of lines) {
    // Amounts that could not be merged are lines of their own, but move together.
    const key = line.key.replace(/#\w+$/, "");
    for (const origin of line.origins) {
      const id = noteId(origin);
      if (!listOf.has(id)) listOf.set(id, await ensureList(db, household.id, origin));
      const home = id === noteId(target);
      rows.push({
        household_id: household.id,
        shopping_list_id: listOf.get(id) as string,
        line_key: key,
        updated_at: new Date().toISOString(),
        moved_date: home ? null : target.date,
        moved_place: home ? null : target.place,
      });
    }
  }
  if (rows.length === 0) return;
  // The same part may be named by two lines of a note: once is enough.
  const once = [
    ...new Map(rows.map((row) => [`${row.shopping_list_id}|${row.line_key}`, row])).values(),
  ];
  const stored = await db
    .from("shopping_line_state")
    .upsert(once, { onConflict: "shopping_list_id,line_key" });
  if (stored.error) throw new Error(`move lines: ${stored.error.message}`);
}

/** Ticks every line named: the errand is done, and whoever says so has done it. */
export async function completeNote(
  db: Db,
  household: Pick<Household, "id" | "userId">,
  trip: ShoppingTrip,
  lineKeys: readonly string[],
): Promise<void> {
  if (lineKeys.length === 0) return;
  const listId = await ensureList(db, household.id, trip);
  const now = new Date().toISOString();
  const stored = await db.from("shopping_line_state").upsert(
    lineKeys.map((key) => ({
      household_id: household.id,
      shopping_list_id: listId,
      line_key: key,
      updated_at: now,
      checked_at: now,
      checked_by: household.userId,
    })),
    { onConflict: "shopping_list_id,line_key" },
  );
  if (stored.error) throw new Error(`complete note: ${stored.error.message}`);
}

/**
 * The shop a line names on purpose, such as the butcher for the cold cuts of a supper, where
 * the note is not that shop's own. Null for everything that is simply bought where it
 * always is: a note does not sort by shop.
 */
export function chosenShop(index: CatalogIndex, view: ViewLine): string | null {
  if (!view.line.shopByChoice) return null;
  const shop = index.shopById.get(view.shopId);
  return shop && shop.kind !== view.line.place ? shop.name : null;
}
