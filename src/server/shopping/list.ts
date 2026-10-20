import "server-only";
import { PLACES, type CatalogIndex, type Place, type Shop } from "@/domain/catalog";
import { addDays, isIsoDate, mondayOf, type IsoDate } from "@/domain/dates";
import type { Recipe, RecipeIngredient } from "@/domain/recipe";
import { buildShoppingList, moveKey, originsOf, partKey } from "@/domain/shopping-list/build";
import {
  bringAlong,
  carriedOver,
  drugstoreLines,
  nextDrugstoreTrip,
  presentDrugstore,
  type DrugstoreEntry,
  type DrugstoreNote,
} from "@/domain/shopping-list/drugstore";
import {
  canMoveTo,
  isBought,
  movedAway,
  type Decision,
  type MovedAway,
  type PlannedLine,
} from "@/domain/shopping-list/decisions";
import { alsoOn } from "@/domain/shopping-list/duplicates";
import { guessKind } from "@/domain/shopping-list/free-entry";
import { shopChoices, type PastChoice, type ShopChoice } from "@/domain/shopping-list/shop-choice";
import { presentByAisle, type AisleView, type ViewLine } from "@/domain/shopping-list/present";
import { favouriteSupermarkets } from "@/domain/shopping-list/supermarkets";
import {
  completion,
  extrasToBuy,
  notesOf,
  notesOfWeek,
  type LineTick,
} from "@/domain/shopping-list/week-notes";
import {
  butcherWeekdays,
  FIRST_ERRAND_FROM,
  noteId,
  tripsBetween,
  type ShoppingTrip,
} from "@/domain/shopping-list/trips";
import type { LineState, ManualEntry, ShoppingLine } from "@/domain/shopping-list/types";
import { isUnit, type Amount } from "@/domain/units";
import { today } from "@/lib/today";
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
  /** Who made the last tick, and when (epoch milliseconds, 0 where unknown). */
  completed: { by: string | null; at: number } | null;
  /** What was on this note and is bought on another one now: "Eier → Di". */
  movedAway: MovedAway[];
  /** Someone opened it for this place and day by hand ("Neuer Zettel"). */
  openedByHand: boolean;
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
  /** The names the members of the household are called by: whom a line can be for. */
  members: string[];
  /** The household's supermarkets, the main one first. Empty until it has named one. */
  supermarkets: Shop[];
  /** Every shop a line can be moved to (`shopChoices`). */
  choices: ShopChoice[];
  /** Where the household bought what before, by `itemKey`. */
  history: Map<string, PastChoice[]>;
  /**
   * For every open line that is on another note of the week too, those notes, by
   * `lineOnNote`: small tomatoes on Monday's and on Saturday's.
   */
  alsoOn: Map<string, ShoppingTrip[]>;
  /**
   * When the notes were read, in milliseconds, taken before the first read: a tick the
   * server took after it may be missing from them (`shownChecked`).
   */
  readAt: number;
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

/** How far back open entries of drugstore notes are still looked for. */
const CARRY_DAYS = 56;

/**
 * The entries of the drugstore notes whose day is over, from the last weeks, with whether
 * each was ticked there.
 */
async function earlierDrugstoreEntries(
  db: Db,
  now: IsoDate,
): Promise<(DrugstoreEntry & { from: ShoppingTrip; done: boolean })[]> {
  const lists = must(
    await db
      .from("shopping_list")
      .select("id, shopping_date")
      .eq("place", "drugstore")
      .gte("shopping_date", addDays(now, -CARRY_DAYS))
      .lt("shopping_date", now),
    "load earlier drugstore notes",
  );
  if (lists.length === 0) return [];
  const ids = lists.map((list) => list.id);
  const [entryRows, stateRows] = await Promise.all([
    db
      .from("shopping_manual_entry")
      .select("id, shopping_list_id, text, quantity, for_whom")
      .in("shopping_list_id", ids)
      .order("created_at"),
    db
      .from("shopping_line_state")
      .select("line_key")
      .in("shopping_list_id", ids)
      // Removed counts as done: what was not to be bought does not come along.
      .or("checked_at.not.is.null,status.eq.removed"),
  ]);
  const ticked = new Set(must(stateRows, "load earlier decisions").map((row) => row.line_key));
  const dateOf = new Map(lists.map((list) => [list.id, list.shopping_date]));
  return must(entryRows, "load earlier drugstore entries").map((row) => ({
    id: row.id,
    text: row.text,
    quantity: row.quantity,
    forWhom: row.for_whom,
    from: { date: dateOf.get(row.shopping_list_id) as IsoDate, place: "drugstore" },
    done: ticked.has(`manual:${row.id}`),
  }));
}

/** A row of `shopping_line_state` as far as decisions go. */
interface DecisionRow {
  checked_at: string | null;
  checked_by: string | null;
  status: string | null;
  bought_name: string | null;
  bought_quantity: number | null;
  bought_unit: string | null;
  remainder: string | null;
  removed_reason: string | null;
  checked_changed_at: string | null;
  decided_by: string | null;
}

/** What a stored decision says about a line. `restTo`: where the rest of a part went. */
function stateOfDecision(row: DecisionRow, restTo: ShoppingTrip | null): LineState {
  const checked = row.checked_at !== null;
  const amount =
    row.bought_quantity !== null && row.bought_unit !== null && isUnit(row.bought_unit)
      ? { quantity: row.bought_quantity, unit: row.bought_unit }
      : null;
  return {
    checked,
    ...(!checked && row.status === "removed"
      ? { removed: true, removedReason: row.removed_reason }
      : {}),
    ...(checked && (row.bought_name !== null || amount !== null)
      ? { bought: { name: row.bought_name, amount } }
      : {}),
    ...(checked && row.status === "partially_bought" && row.remainder
      ? {
          remainder:
            row.remainder === "moved"
              ? { kind: "moved" as const, to: restTo }
              : { kind: "discarded" as const },
        }
      : {}),
    ...(row.checked_changed_at !== null ? { decidedAt: Date.parse(row.checked_changed_at) } : {}),
    decidedBy: row.decided_by ?? row.checked_by,
  };
}

/** Where the household bought what before, the rows of `shop_item_history` by item. */
function historyOf(
  rows: readonly { item_key: string; choice: string; times: number; last_at: string }[],
): Map<string, PastChoice[]> {
  const history = new Map<string, PastChoice[]>();
  for (const row of rows) {
    const past = history.get(row.item_key) ?? [];
    past.push({ choice: row.choice, times: row.times, lastAt: Date.parse(row.last_at) });
    history.set(row.item_key, past);
  }
  return history;
}

export async function loadShoppingNotes(
  db: Db,
  household: Pick<Household, "shoppingDays">,
  weekStart: IsoDate,
): Promise<WeekNotes> {
  const readAt = Date.now();
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: IsoDate) => date >= weekStart && date <= weekEnd;
  // An errand can buy for two weeks, so the weeks around this one are read with it.
  const [weeks, extrasAround, index, memberRows, listRows, historyRows] = await Promise.all([
    loadWeeks(db, addDays(weekStart, -7), addDays(weekStart, 7)),
    Promise.all([-7, 0, 7].map((days) => loadExtras(db, addDays(weekStart, days)))),
    loadCatalogIndex(db),
    db.from("household_member").select("user_id, display_name"),
    db
      .from("shopping_list")
      .select("id, shopping_date, place, opened_at")
      .gte("shopping_date", addDays(weekStart, -7))
      .lte("shopping_date", weekEnd),
    db.from("shop_item_history").select("item_key, choice, times, last_at"),
  ]);
  const slots = weeks.flatMap((week) => week.slots);
  const [before, thisWeek, after] = extrasAround;
  const extras = extrasToBuy({ before, week: thisWeek, after });
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
          .select(
            "id, shopping_list_id, text, shop_id, aisle_group_id, quantity, for_whom, ingredient_id, carried_quantity, carried_unit, carried_from_list_id, carried_from_key",
          )
          .in("shopping_list_id", listIds)
          .order("created_at")
      : null,
    listIds.length > 0
      ? db
          .from("shopping_line_state")
          .select(
            "shopping_list_id, line_key, at_home, shop_id, note, checked_at, checked_by, moved_date, moved_place, quantity, unit, status, bought_name, bought_quantity, bought_unit, remainder, removed_reason, checked_changed_at, decided_by",
          )
          .in("shopping_list_id", listIds)
      : null,
  ]);
  const typed = entryRows ? must(entryRows, "load typed entries") : [];
  // The drugstore's note is written by hand only, and read apart from the plan.
  const onDrugstore = (row: { shopping_list_id: string }) =>
    tripOf.get(row.shopping_list_id)?.place === "drugstore";
  const drugstore = new Map<string, DrugstoreNote>();
  for (const row of typed.filter(onDrugstore)) {
    const trip = tripOf.get(row.shopping_list_id) as ShoppingTrip;
    const note = drugstore.get(noteId(trip)) ?? { trip, entries: [] };
    note.entries.push({
      id: row.id,
      text: row.text,
      quantity: row.quantity,
      forWhom: row.for_whom,
    });
    drugstore.set(noteId(trip), note);
  }
  // The rest of a line bought in part, by the line it is the rest of: where it went.
  const restTo = new Map<string, ShoppingTrip>();
  const entries = typed
    .filter((row) => !onDrugstore(row))
    .map((row): ManualEntry => {
      const from = row.carried_from_list_id ? tripOf.get(row.carried_from_list_id) : undefined;
      const here = tripOf.get(row.shopping_list_id);
      if (row.carried_from_list_id && row.carried_from_key && here) {
        restTo.set(`${row.carried_from_list_id}|${row.carried_from_key}`, here);
      }
      return {
        id: row.id,
        text: row.text,
        shoppingDate: here?.date,
        place: here?.place,
        shopId: row.shop_id,
        aisleGroupId: row.aisle_group_id,
        ...(row.ingredient_id &&
        row.carried_quantity !== null &&
        row.carried_unit !== null &&
        isUnit(row.carried_unit) &&
        from
          ? {
              carried: {
                ingredientId: row.ingredient_id,
                amount: { quantity: row.carried_quantity, unit: row.carried_unit },
                from,
              },
            }
          : {}),
      };
    });
  // What the household changed on a line, per note, and the lines it moved to another one.
  const states = new Map<string, Record<string, LineState>>();
  const moves = new Map<string, ShoppingTrip>();
  // Who ticked a line, and when: the last tick on a note says who finished the errand.
  const ticks = new Map<string, LineTick>();
  for (const row of stateRows ? must(stateRows, "load line states") : []) {
    const trip = tripOf.get(row.shopping_list_id) as ShoppingTrip;
    if (row.checked_at !== null) {
      ticks.set(`${noteId(trip)}|${row.line_key}`, {
        at: Date.parse(row.checked_at),
        by: row.checked_by,
      });
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
      ...(row.quantity !== null && row.unit !== null
        ? { amount: { quantity: row.quantity, unit: row.unit } }
        : {}),
      ...stateOfDecision(row, restTo.get(`${row.shopping_list_id}|${row.line_key}`) ?? null),
    };
    states.set(noteId(trip), ofNote);
  }

  // Far enough back that the first meal read has a shopping day before it.
  const trips = tripsBetween(household.shoppingDays, addDays(weekStart, -14), addDays(weekEnd, 7));
  // What is still open on drugstore notes whose day is over comes along to the next one.
  const now = today();
  const target = nextDrugstoreTrip(trips, now);
  const drugstoreNotes =
    target && inWeek(target.date)
      ? bringAlong(
          [...drugstore.values()],
          target,
          carriedOver(await earlierDrugstoreEntries(db, now), now),
        )
      : [...drugstore.values()];
  const build = (doneAt?: ReadonlyMap<string, number>) => [
    ...buildShoppingList({
      index,
      recipes,
      slots,
      extras,
      trips,
      butcherDays: butcherWeekdays(household.shoppingDays),
      firstErrandFrom: FIRST_ERRAND_FROM,
      doneAt,
      // The week's first trip to the supermarket.
      extrasDate: trips.find((trip) => inWeek(trip.date) && trip.place === "supermarket")?.date,
      manualEntries: entries,
      moves,
    }),
    ...drugstoreNotes.flatMap((note) =>
      drugstoreLines(note.entries, note.trip, index.catalog.defaultShopId),
    ),
  ];
  const viewOf = (trip: ShoppingTrip, all: readonly ShoppingLine[]) => {
    const own = all.filter((line) => line.shoppingDate === trip.date && line.place === trip.place);
    const state = states.get(noteId(trip)) ?? {};
    return trip.place === "drugstore"
      ? presentDrugstore(own, state)
      : presentByAisle(own, state, index);
  };
  const finishedOf = (trip: ShoppingTrip, view: AisleView) =>
    completion(
      view.groups.flatMap((group) => group.lines),
      (key) => ticks.get(`${noteId(trip)}|${key}`),
      view.notBought
        .filter((entry) => entry.view.status === "removed")
        .map((entry) => {
          const state = states.get(noteId(trip))?.[entry.view.line.key];
          return { at: state?.decidedAt ?? 0, by: state?.decidedBy ?? null };
        }),
    );
  // An errand that is done has not bought what was planned after it: the lines are worked
  // out once more with that known, and such a meal goes to an errand still to come.
  const first = build();
  const doneAt = new Map<string, number>();
  for (const trip of notesOf(first)) {
    const finished = finishedOf(trip, viewOf(trip, first));
    if (finished) doneAt.set(noteId(trip), finished.at);
  }
  const lines = doneAt.size > 0 ? build(doneAt) : first;
  const nameOf = new Map(
    must(memberRows, "load members").map((member) => [member.user_id, member.display_name]),
  );

  const atHome: WeekNotes["atHome"] = [];
  // Notes opened by hand lie among the others while nothing is written on them. They are
  // no errands the plan is bought on: what is planned goes where it always goes.
  const opened = lists
    .filter((list) => list.opened_at !== null && inWeek(list.shopping_date))
    .map((list) => ({ date: list.shopping_date, place: list.place as Place }));
  const openedIds = new Set(opened.map(noteId));
  const notes = notesOfWeek(lines, [...trips, ...opened], weekStart).map((trip): NoteList => {
    const id = noteId(trip);
    const view = viewOf(trip, lines);
    atHome.push(...view.atHome.map((line) => ({ trip, line })));
    const toBuy = view.groups.flatMap((group) => group.lines);
    const done = toBuy.filter((line) => line.checked).length;
    const finished = finishedOf(trip, view);
    return {
      trip,
      id,
      view,
      open: toBuy.length - done,
      done,
      completed: finished && {
        by: (finished.by && nameOf.get(finished.by)) || null,
        at: finished.at,
      },
      movedAway: trip.place === "drugstore" ? [] : movedAway(trip, lines),
      openedByHand: openedIds.has(id),
    };
  });
  atHome.sort((a, b) => a.line.line.label.localeCompare(b.line.line.label, "de"));
  const members = [...nameOf.values()].filter((name): name is string => Boolean(name));
  return {
    readAt,
    notes,
    atHome,
    index,
    members,
    supermarkets: favouriteSupermarkets(index.catalog.shops),
    choices: shopChoices(index, favouriteSupermarkets(index.catalog.shops)),
    history: historyOf(must(historyRows, "load where things were bought")),
    alsoOn: alsoOn(
      notes.map((note) => ({
        trip: note.trip,
        lines: note.view.groups.flatMap((group) => group.lines),
      })),
    ),
  };
}

/**
 * Whether something can be a note: a known place on a real day. Any day will do, not only
 * the household's shopping days: the bakery is gone to when a meal asks for bread, and an
 * errand can be moved to another day.
 */
export function isNote(trip: ShoppingTrip): boolean {
  return PLACES.includes(trip.place) && isIsoDate(trip.date);
}

/**
 * Opens a note for a place on a day someone chose: dm on a Wednesday, the bakery on a
 * Thursday. From then on it lies among the notes of its week, also while it is empty.
 */
export async function openNote(db: Db, householdId: string, trip: ShoppingTrip): Promise<void> {
  const opened = await db.from("shopping_list").upsert(
    {
      household_id: householdId,
      shopping_date: trip.date,
      place: trip.place,
      opened_at: new Date().toISOString(),
    },
    { onConflict: "household_id,shopping_date,place" },
  );
  if (opened.error) throw new Error(`open note: ${opened.error.message}`);
}

/** Puts a note opened by hand away again: it lies among the others only for what is on it. */
export async function putAwayNote(db: Db, trip: ShoppingTrip): Promise<void> {
  const closed = await db
    .from("shopping_list")
    .update({ opened_at: null })
    .eq("shopping_date", trip.date)
    .eq("place", trip.place);
  if (closed.error) throw new Error(`put away note: ${closed.error.message}`);
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

/**
 * Adds a line as the household writes it: "Milch WS 1.29", "Geschenkpapier". On the
 * drugstore's note it may say how many and for whom.
 */
export async function addEntry(
  db: Db,
  household: Pick<Household, "id" | "userId">,
  trip: ShoppingTrip,
  text: string,
  extra: { quantity: number | null; forWhom: string | null } = { quantity: null, forWhom: null },
): Promise<void> {
  const listId = await ensureList(db, household.id, trip);
  const stored = await db.from("shopping_manual_entry").insert({
    household_id: household.id,
    shopping_list_id: listId,
    text,
    quantity: extra.quantity,
    for_whom: extra.forWhom,
    created_by: household.userId,
    aisle_group_id: (await rememberedKind(db, text)) ?? (await guessedKind(db, text)),
  });
  if (stored.error) throw new Error(`add entry: ${stored.error.message}`);
}

/**
 * The kind of grocery the household gave the same text the last time it was written on a
 * note: "Lakritzschnecken" put under "Süßes" once stays there. Null when it never did.
 */
async function rememberedKind(db: Db, text: string): Promise<string | null> {
  const pattern = sameText(text);
  if (pattern === "") return null;
  const earlier = await db
    .from("shopping_manual_entry")
    .select("aisle_group_id")
    .ilike("text", pattern)
    .not("aisle_group_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (earlier.error) throw new Error(`remember kind: ${earlier.error.message}`);
  return earlier.data?.aisle_group_id ?? null;
}

/**
 * The kind of grocery a typed line the catalog does not know probably is, guessed once as
 * it is written (`guessKind`) and stored like one the household chose: "Gehört zu" on the
 * line corrects it. Null where the catalog knows the line, or nothing fits.
 */
async function guessedKind(db: Db, text: string): Promise<string | null> {
  const index = await loadCatalogIndex(db);
  return guessKind(text, index);
}

/** A text as a pattern that finds it written the same way, in any case: no wildcards. */
function sameText(text: string): string {
  return text.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Puts a typed line the catalog does not know under a kind of grocery, or back under none.
 * Every line of the same text goes with it, and the next one written takes it too
 * (`rememberedKind`).
 */
export async function setEntryKind(
  db: Db,
  entryId: string,
  aisleGroupId: string | null,
): Promise<void> {
  const entry = must(
    await db.from("shopping_manual_entry").select("text").eq("id", entryId).single(),
    "load entry",
  );
  const updated = await db
    .from("shopping_manual_entry")
    .update({ aisle_group_id: aisleGroupId })
    .ilike("text", sameText(entry.text));
  if (updated.error) throw new Error(`set kind: ${updated.error.message}`);
}

async function storeState(
  db: Db,
  household: Pick<Household, "id">,
  trip: ShoppingTrip,
  lineKey: string,
  values: {
    at_home?: boolean;
    note?: string;
    moved_date?: string | null;
    moved_place?: string | null;
    shop_id?: string | null;
    quantity?: number | null;
    unit?: Amount["unit"] | null;
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
  household: Pick<Household, "id">,
  trip: ShoppingTrip,
  lineKey: string,
  change:
    | { checked: boolean }
    | { atHome: boolean }
    | { note: string }
    | { amount: Amount | null }
    | { shopId: string | null },
): Promise<void> {
  if ("checked" in change) {
    // A tick goes the one way every tick goes, so that the tick made last stays.
    const listId = await ensureList(db, household.id, trip);
    await tickLine(db, listId, lineKey, change.checked, new Date());
    return;
  }
  await storeState(db, household, trip, lineKey, stateOf(change));
}

/** The columns a change of a line other than its tick is stored in. */
function stateOf(change: Exclude<Parameters<typeof changeLine>[4], { checked: boolean }>) {
  if ("atHome" in change) return { at_home: change.atHome };
  // Null: the amount the plan works out again.
  if ("amount" in change) {
    return { quantity: change.amount?.quantity ?? null, unit: change.amount?.unit ?? null };
  }
  // Null: the household's main supermarket again.
  if ("shopId" in change) return { shop_id: change.shopId };
  // An empty note is stored as such: it says "no note", also where the line has one.
  return { note: change.note };
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
  /** The list of the note a move was decided on in the shop, so that it can be taken back. */
  movedWith: string | null = null,
): Promise<void> {
  const listOf = new Map<string, string>();
  const rows = [];
  for (const line of lines) {
    // Amounts that could not be merged are lines of their own, but move together.
    const key = partKey(line.key);
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
        moved_with: home ? null : movedWith,
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
  household: Pick<Household, "id">,
  trip: ShoppingTrip,
  lineKeys: readonly string[],
): Promise<void> {
  if (lineKeys.length === 0) return;
  const listId = await ensureList(db, household.id, trip);
  const now = new Date();
  await Promise.all(lineKeys.map((key) => tickLine(db, listId, key, true, now)));
}

/**
 * Ticks a line or opens it again, unless a tick made later is stored (`tick_shopping_line`).
 * Every tick is stored this way: from the queue of a device, from the plain form, and by
 * "Einkauf erledigt". Whoever is signed in is the one who ticked.
 */
async function tickLine(
  db: Db,
  listId: string,
  key: string,
  checked: boolean,
  at: Date,
): Promise<void> {
  const stored = await db.rpc("tick_shopping_line", {
    list_id: listId,
    tick_key: key,
    tick_checked: checked,
    ticked_at: at.toISOString(),
  });
  if (stored.error) throw new Error(`tick line: ${stored.error.message}`);
}

/** How many decisions are stored at once. */
const PARALLEL = 8;

/** A decision about a line from a device, maybe made long ago in the shop. */
export interface DecisionToApply {
  id: string;
  note: ShoppingTrip;
  key: string;
  decision: Decision;
  at: Date;
  /** The line as the device saw it, for the plan kept beside it and the shop history. */
  about?: { planned: PlannedLine; item: string; shop: string | null };
}

/** A decision as `decide_shopping_line` reads it. */
function decisionJson(decision: Decision, planned: PlannedLine | undefined) {
  const bought =
    decision.kind === "bought" || decision.kind === "partial"
      ? {
          quantity: decision.amount?.quantity,
          unit: decision.amount?.unit,
          name: decision.name ?? undefined,
        }
      : {};
  return {
    kind: decision.kind,
    ...bought,
    ...(decision.kind === "removed" ? { reason: decision.reason ?? undefined } : {}),
    ...(decision.kind === "partial" ? { remainder: decision.remainder.kind } : {}),
    ...(decision.kind === "moved" && decision.shopId ? { shop_id: decision.shopId } : {}),
    ...(planned ? { planned } : {}),
  };
}

async function decideLine(
  db: Db,
  listId: string,
  key: string,
  decision: Decision,
  at: Date,
  planned?: PlannedLine,
): Promise<"applied" | "same" | "older"> {
  const stored = await db.rpc("decide_shopping_line", {
    list_id: listId,
    decided_key: key,
    decision: decisionJson(decision, planned),
    decided_at: at.toISOString(),
  });
  if (stored.error) throw new Error(`decide line: ${stored.error.message}`);
  return stored.data as "applied" | "same" | "older";
}

/** Counts one more purchase or choice of a shop for a thing (`shop_item_history`). */
async function rememberChoice(
  db: Db,
  household: Pick<Household, "id">,
  item: string,
  choice: string,
): Promise<void> {
  const stored = await db.rpc("remember_shop_choice", {
    home: household.id,
    item: item.slice(0, 200),
    chosen: choice.slice(0, 64),
  });
  if (stored.error) throw new Error(`remember shop: ${stored.error.message}`);
}

/**
 * Stores decisions made on a device (`decide_shopping_line`): each line keeps the one made
 * last, so a decision sent twice, or after a later one of someone else, changes nothing.
 * What follows from a decision is done along with it, and done again when it is sent
 * twice: the rest of a part written onto its note, a line moved to another note, a move
 * taken back, the shop remembered. Returns the ids done with, and those that can never
 * be stored (a note too far away).
 */
export async function applyDecisions(
  db: Db,
  household: Pick<Household, "id" | "shoppingDays">,
  decisions: readonly DecisionToApply[],
): Promise<{ taken: string[]; refused: string[] }> {
  const taken: string[] = [];
  const refused: string[] = [];
  // One request per note, also for decisions stored side by side.
  const lists = new Map<string, Promise<string>>();
  const listOf = (trip: ShoppingTrip) => {
    const id = noteId(trip);
    if (!lists.has(id)) lists.set(id, ensureList(db, household.id, trip));
    return lists.get(id) as Promise<string>;
  };
  const weeks = new Map<string, Promise<WeekNotes>>();
  const notesOf = (trip: ShoppingTrip) => {
    const week = mondayOf(trip.date);
    if (!weeks.has(week)) weeks.set(week, loadShoppingNotes(db, household, week));
    return weeks.get(week) as Promise<WeekNotes>;
  };
  const now = today();

  // Lines are independent of each other, and the queue holds one decision per line: they
  // are stored a few at a time. One after the other, "Einkauf erledigt" on a full note took
  // seconds.
  const apply = async (each: DecisionToApply): Promise<void> => {
    const { decision, note, key } = each;
    const listId = await listOf(note);
    const to =
      decision.kind === "moved"
        ? decision.to
        : decision.kind === "partial" && decision.remainder.kind === "moved"
          ? decision.remainder.to
          : null;
    const target = to === null ? null : canMoveTo(to, note, now);
    if (to !== null && !target) {
      refused.push(each.id);
      return;
    }

    // Another shop on the same note: no move, the line is bought in that shop's section.
    if (decision.kind === "moved" && target && noteId(target) === noteId(note)) {
      await storeState(db, household, note, key, { shop_id: decision.shopId });
      if (each.about) {
        await rememberChoice(db, household, each.about.item, decision.shopId ?? note.place);
      }
      taken.push(each.id);
      return;
    }

    // A move needs the line as it stands on its note now: the notes its parts are from.
    const view =
      decision.kind === "moved"
        ? (await notesOf(note)).notes
            .find((entry) => entry.id === noteId(note))
            ?.view.groups.flatMap((group) => group.lines)
            .find((entry) => entry.line.key === key)
        : undefined;
    if (decision.kind === "moved" && !view) {
      // Not on that note any more: moved already, or gone from the plan.
      taken.push(each.id);
      return;
    }

    const answer = await decideLine(db, listId, key, decision, each.at, each.about?.planned);
    if (answer === "older") {
      taken.push(each.id);
      return;
    }
    const rest = decision.kind === "partial" ? decision.remainder : null;
    // A plain tick changes nothing else: no rest was moved from a line ticked as planned in
    // the same breath, and only a line opened again can be a move taken back.
    const plainTick = decision.kind === "bought" && !decision.amount && !decision.name;
    if (!plainTick) {
      await Promise.all([
        dropCarried(db, listId, key, rest?.kind === "moved" ? rest.entryId : null),
        decision.kind === "open" ? takeBackMove(db, household, listId, note, key) : null,
      ]);
    }

    if (decision.kind === "moved" && target && view) {
      await moveLines(
        db,
        household,
        [{ key: view.line.key, origins: originsOf(view.line, note) }],
        target,
        listId,
      );
      // What arrives is still to buy there, also where that note bought the same before.
      const there = await listOf(target);
      await decideLine(db, there, key, { kind: "open" }, each.at);
      if (decision.shopId)
        await storeState(db, household, target, key, { shop_id: decision.shopId });
      if (each.about) {
        await rememberChoice(db, household, each.about.item, decision.shopId ?? target.place);
      }
    }
    if (rest?.kind === "moved" && target) {
      const ingredientId = each.about?.item.startsWith("text:") ? null : (each.about?.item ?? null);
      const there = await listOf(target);
      const name = each.about?.planned.name ?? key;
      const stored = await db.from("shopping_manual_entry").upsert(
        {
          id: rest.entryId,
          household_id: household.id,
          shopping_list_id: there,
          text: ingredientId ? name : `${rest.amount.quantity} ${name}`,
          ingredient_id: ingredientId,
          carried_quantity: ingredientId ? rest.amount.quantity : null,
          carried_unit: ingredientId ? rest.amount.unit : null,
          carried_from_list_id: listId,
          carried_from_key: key,
        },
        { onConflict: "id" },
      );
      if (stored.error) throw new Error(`carry rest: ${stored.error.message}`);
      if (rest.shopId) {
        const lineKey = ingredientId ? `${ingredientId}@main` : `manual:${rest.entryId}`;
        await storeState(db, household, target, lineKey, { shop_id: rest.shopId });
      }
    }
    if (isBought(decision) && each.about) {
      await rememberChoice(db, household, each.about.item, each.about.shop ?? note.place);
    }
    taken.push(each.id);
  };
  for (let from = 0; from < decisions.length; from += PARALLEL) {
    await Promise.all(decisions.slice(from, from + PARALLEL).map(apply));
  }
  return { taken, refused };
}

/**
 * Removes the rests carried from a line to other notes, but `keep`: the line was decided
 * otherwise since, so its rest is no longer to buy elsewhere.
 */
async function dropCarried(
  db: Db,
  listId: string,
  key: string,
  keep: string | null,
): Promise<void> {
  let query = db
    .from("shopping_manual_entry")
    .delete()
    .eq("carried_from_list_id", listId)
    .eq("carried_from_key", key);
  if (keep) query = query.neq("id", keep);
  const removed = await query;
  if (removed.error) throw new Error(`drop rest: ${removed.error.message}`);
}

/**
 * Takes back a move decided on a note in the shop: every part it sent away comes back to
 * that note, also a part that had come to it from another one before.
 */
async function takeBackMove(
  db: Db,
  household: Pick<Household, "id">,
  listId: string,
  note: ShoppingTrip,
  key: string,
): Promise<void> {
  const moved = must(
    await db
      .from("shopping_line_state")
      .select("shopping_list_id")
      .eq("moved_with", listId)
      .eq("line_key", partKey(key)),
    "find move",
  );
  if (moved.length === 0) return;
  const origins = must(
    await db
      .from("shopping_list")
      .select("shopping_date, place")
      .in(
        "id",
        moved.map((row) => row.shopping_list_id),
      ),
    "find notes of move",
  ).map((row) => ({ date: row.shopping_date, place: row.place as Place }));
  await moveLines(db, household, [{ key, origins }], note);
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
