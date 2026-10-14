import "server-only";
import { addDays, mondayOf, type IsoDate } from "@/domain/dates";
import type { PlannedWeek } from "@/domain/plan-history";
import {
  cookMore,
  slotKey,
  type Meal,
  type NewSlot,
  type PlanExtra,
  type PlanSlot,
  type SlotFood,
  type SlotContent,
  type SlotItem,
} from "@/domain/plan";
import { findIngredient } from "@/domain/catalog";
import { currentWeeks, lastCooked, plannedAt, type PlannedAt } from "@/domain/planned";
import { today } from "@/lib/today";
import { allRows, loadCatalogIndex, must, type Db } from "../catalog";

/**
 * Reading and writing week plans. A week exists in the database from the first meal planned
 * in it. Row level security decides whose weeks these are.
 */

export async function loadWeek(db: Db, weekStart: IsoDate): Promise<PlanSlot[]> {
  const plan = await db.from("week_plan").select("id").eq("week_start", weekStart).maybeSingle();
  if (plan.error) throw new Error(`load week: ${plan.error.message}`);
  if (!plan.data) return [];
  return loadSlots(db, [plan.data.id]);
}

/**
 * Whether the household is done planning a week. A saved plan is shown to read; the
 * controls for planning are put away until someone takes the pen.
 */
export async function isSaved(db: Db, weekStart: IsoDate): Promise<boolean> {
  const plan = await db
    .from("week_plan")
    .select("saved_at")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (plan.error) throw new Error(`load week: ${plan.error.message}`);
  return Boolean(plan.data?.saved_at);
}

/** Saves a week's plan, or opens it for planning again. */
export async function savePlan(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  saved: boolean,
): Promise<void> {
  const planId = await ensureWeek(db, householdId, weekStart);
  const stored = await db
    .from("week_plan")
    .update({ saved_at: saved ? new Date().toISOString() : null })
    .eq("id", planId);
  if (stored.error) throw new Error(`save plan: ${stored.error.message}`);
}

/**
 * Empties a week: every meal and everything it needs besides. The week is open for planning
 * again. Shopping notes keep what was typed onto them.
 */
export async function resetWeek(db: Db, householdId: string, weekStart: IsoDate): Promise<void> {
  const planId = await ensureWeek(db, householdId, weekStart);
  for (const table of ["plan_slot", "plan_extra"] as const) {
    const removed = await db.from(table).delete().eq("week_plan_id", planId);
    if (removed.error) throw new Error(`empty week: ${removed.error.message}`);
  }
  await savePlan(db, householdId, weekStart, false);
}

/** The weeks with a plan that start between two Mondays, both included. */
export async function loadWeeks(db: Db, from: IsoDate, to: IsoDate): Promise<PlannedWeek[]> {
  const plans = must(
    await db
      .from("week_plan")
      .select("id, week_start")
      .gte("week_start", from)
      .lte("week_start", to)
      .order("week_start"),
    "load weeks",
  );
  if (plans.length === 0) return [];
  const slots = await loadSlots(
    db,
    plans.map((plan) => plan.id),
  );
  return plans.map((plan) => ({
    weekStart: plan.week_start,
    slots: slots.filter(
      (slot) => slot.date >= plan.week_start && slot.date <= addDays(plan.week_start, 6),
    ),
  }));
}

/** How many meals are asked for in one request, so their ids fit into its address. */
const SLOTS_PER_REQUEST = 100;

async function loadSlots(db: Db, planIds: string[]): Promise<PlanSlot[]> {
  const slots = await allRows(
    (from, to) =>
      db
        .from("plan_slot")
        .select("id, date, meal, kind, label, leftovers_of_slot_id")
        .in("week_plan_id", planIds)
        .order("date")
        .order("id")
        .range(from, to),
    "load meals",
  );
  const withRecipes = slots.filter((slot) => slot.kind === "recipes").map((slot) => slot.id);
  const items: {
    plan_slot_id: string;
    recipe_id: string;
    servings: number;
    planned_on: string | null;
  }[] = [];
  for (let at = 0; at < withRecipes.length; at += SLOTS_PER_REQUEST) {
    items.push(
      ...must(
        await db
          .from("plan_slot_item")
          .select("plan_slot_id, recipe_id, servings, position, planned_on")
          .in("plan_slot_id", withRecipes.slice(at, at + SLOTS_PER_REQUEST))
          .order("position"),
        "load recipes of meals",
      ),
    );
  }

  const noRecipe = slots.filter((slot) => slot.kind === "free_text").map((slot) => slot.id);
  const foods: {
    plan_slot_id: string;
    label: string;
    ingredient_id: string | null;
    shop_id: string | null;
    planned_on: string | null;
  }[] = [];
  for (let at = 0; at < noRecipe.length; at += SLOTS_PER_REQUEST) {
    foods.push(
      ...must(
        await db
          .from("plan_slot_food")
          .select("plan_slot_id, label, ingredient_id, shop_id, position, planned_on")
          .in("plan_slot_id", noRecipe.slice(at, at + SLOTS_PER_REQUEST))
          .order("position"),
        "load foods of meals",
      ),
    );
  }

  return slots.map((slot): PlanSlot => {
    const base = { id: slot.id, date: slot.date, meal: slot.meal };
    switch (slot.kind) {
      case "recipes":
        return {
          ...base,
          kind: "recipes",
          items: items
            .filter((item) => item.plan_slot_id === slot.id)
            .map((item) => ({
              recipeId: item.recipe_id,
              servings: item.servings,
              plannedOn: item.planned_on,
            })),
        };
      case "free_text":
        return {
          ...base,
          kind: "free_text",
          label: slot.label ?? "",
          foods: foods
            .filter((food) => food.plan_slot_id === slot.id)
            .map((food) => ({
              label: food.label,
              ingredientId: food.ingredient_id,
              shopId: food.shop_id,
              plannedOn: food.planned_on,
            })),
        };
      case "away":
        return { ...base, kind: "away", label: slot.label ?? "" };
      case "leftovers":
        return { ...base, kind: "leftovers", ofSlotId: slot.leftovers_of_slot_id };
      default:
        return { ...base, kind: "skipped" };
    }
  });
}

async function storeFoods(
  db: Db,
  householdId: string,
  slotId: string,
  foods: readonly SlotFood[],
): Promise<void> {
  if (foods.length === 0) return;
  const stored = await db.from("plan_slot_food").insert(
    foods.map((food, position) => ({
      household_id: householdId,
      plan_slot_id: slotId,
      label: food.label,
      ingredient_id: food.ingredientId,
      shop_id: food.shopId,
      position,
      planned_on: food.plannedOn ?? today(),
    })),
  );
  if (stored.error) throw new Error(`store foods of meal: ${stored.error.message}`);
}

/** The id of a week's plan. The week comes into being when something is first stored in it. */
export async function ensureWeek(db: Db, householdId: string, weekStart: IsoDate): Promise<string> {
  const plan = must(
    await db
      .from("week_plan")
      .upsert(
        { household_id: householdId, week_start: weekStart },
        { onConflict: "household_id,week_start" },
      )
      .select("id")
      .single(),
    "open week",
  );
  return plan.id;
}

/**
 * A recipe someone wanted to cook is on a plan now: the wish is fulfilled and its mark goes.
 */
async function fulfilWishes(db: Db, recipeIds: string[]): Promise<void> {
  if (recipeIds.length === 0) return;
  const cleared = await db
    .from("recipe")
    .update({ wanted_at: null })
    .in("id", recipeIds)
    .not("wanted_at", "is", null);
  if (cleared.error) throw new Error(`fulfil wishes: ${cleared.error.message}`);
}

/**
 * Sets what one meal of a week is, replacing what was there. Null empties it. A recipe that
 * comes without the day it was planned on is planned today; one that is written again, with
 * other servings or next to a new side, keeps its day. Returns the meal's new id, or null
 * when nothing is planned on it now.
 */
export async function writeSlot(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  date: IsoDate,
  meal: Meal,
  content: SlotContent | null,
): Promise<string | null> {
  const planId = await ensureWeek(db, householdId, weekStart);
  const removed = await db
    .from("plan_slot")
    .delete()
    .eq("week_plan_id", planId)
    .eq("date", date)
    .eq("meal", meal);
  if (removed.error) throw new Error(`clear meal: ${removed.error.message}`);
  if (content === null) return null;
  // A meal without a recipe is no "recipes" meal.
  if (content.kind === "recipes" && content.items.length === 0) return null;

  const slot = must(
    await db
      .from("plan_slot")
      .insert({
        household_id: householdId,
        week_plan_id: planId,
        date,
        meal,
        kind: content.kind,
        label: content.kind === "free_text" || content.kind === "away" ? content.label : null,
        leftovers_of_slot_id: content.kind === "leftovers" ? (content.ofSlotId ?? null) : null,
      })
      .select("id")
      .single(),
    "plan meal",
  );
  if (content.kind === "free_text") await storeFoods(db, householdId, slot.id, content.foods ?? []);
  if (content.kind !== "recipes") return slot.id;
  const items = await db.from("plan_slot_item").insert(
    content.items.map((item, position) => ({
      household_id: householdId,
      plan_slot_id: slot.id,
      recipe_id: item.recipeId,
      servings: item.servings,
      position,
      planned_on: item.plannedOn ?? today(),
    })),
  );
  if (items.error) {
    // Do not leave a meal behind that claims to have recipes and has none.
    await db.from("plan_slot").delete().eq("id", slot.id);
    throw new Error(`plan recipes of meal: ${items.error.message}`);
  }
  await fulfilWishes(
    db,
    content.items.map((item) => item.recipeId),
  );
  return slot.id;
}

/**
 * Plans several meals that are still open, in as few requests as one meal takes. Fails as a
 * whole if one of them has been planned in the meantime.
 */
export async function planOpenSlots(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  slots: readonly NewSlot[],
): Promise<void> {
  const wanted = slots.filter(
    (slot) => slot.content.kind !== "recipes" || slot.content.items.length > 0,
  );
  if (wanted.length === 0) return;
  const planId = await ensureWeek(db, householdId, weekStart);
  const created = must(
    await db
      .from("plan_slot")
      .insert(
        wanted.map(({ date, meal, content }) => ({
          household_id: householdId,
          week_plan_id: planId,
          date,
          meal,
          kind: content.kind,
          label: content.kind === "free_text" || content.kind === "away" ? content.label : null,
        })),
      )
      .select("id, date, meal"),
    "plan meals",
  );
  const idOf = new Map(created.map((slot) => [slotKey(slot.date, slot.meal), slot.id]));
  for (const { date, meal, content } of wanted) {
    if (content.kind !== "free_text") continue;
    await storeFoods(db, householdId, idOf.get(slotKey(date, meal)) as string, content.foods ?? []);
  }
  const items = wanted.flatMap(({ date, meal, content }) =>
    content.kind === "recipes"
      ? content.items.map((item, position) => ({
          household_id: householdId,
          plan_slot_id: idOf.get(slotKey(date, meal)) as string,
          recipe_id: item.recipeId,
          servings: item.servings,
          position,
          planned_on: item.plannedOn ?? today(),
        }))
      : [],
  );
  if (items.length === 0) return;
  const stored = await db.from("plan_slot_item").insert(items);
  if (stored.error) {
    // Do not leave meals behind that claim to have recipes and have none.
    await db
      .from("plan_slot")
      .delete()
      .in(
        "id",
        created.map((slot) => slot.id),
      );
    throw new Error(`plan recipes of meals: ${stored.error.message}`);
  }
  await fulfilWishes(
    db,
    items.map((item) => item.recipe_id),
  );
}

/** Adds a recipe to a meal that may already have some: a main dish and its side. */
export async function addToSlot(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  date: IsoDate,
  meal: Meal,
  item: SlotItem,
): Promise<void> {
  const existing = (await loadWeek(db, weekStart)).find(
    (slot) => slot.date === date && slot.meal === meal,
  );
  const items = existing?.kind === "recipes" ? existing.items : [];
  if (items.some((other) => other.recipeId === item.recipeId)) return;
  await writeSlot(db, householdId, weekStart, date, meal, {
    kind: "recipes",
    items: [...items, item],
  });
}

/**
 * "Mehr kochen": cooks `extra` more portions of a meal's recipes and plans their leftovers
 * for a later meal that is still open. A meal planned meanwhile is left as it is.
 */
export async function cookMoreForLeftovers(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  date: IsoDate,
  meal: Meal,
  extra: number,
  leftoversOn: { date: IsoDate; meal: Meal } | null,
): Promise<void> {
  const existing = (await loadWeek(db, weekStart)).find(
    (slot) => slot.date === date && slot.meal === meal,
  );
  if (existing?.kind !== "recipes") return;
  const units = must(
    await db
      .from("recipe")
      .select("id, servings_unit")
      .in(
        "id",
        existing.items.map((item) => item.recipeId),
      ),
    "load recipes to cook more of",
  );
  const forPersons = new Set(
    units.filter((row) => row.servings_unit === null).map((row) => row.id),
  );
  const items = cookMore(existing.items, extra, (id) => forPersons.has(id));
  if (!items) return;
  const cooked = await writeSlot(db, householdId, weekStart, date, meal, {
    kind: "recipes",
    items,
  });
  if (!leftoversOn) return;
  const later = mondayOf(leftoversOn.date);
  const taken = (await loadWeek(db, later)).some(
    (slot) => slot.date === leftoversOn.date && slot.meal === leftoversOn.meal,
  );
  if (taken) return;
  await writeSlot(db, householdId, later, leftoversOn.date, leftoversOn.meal, {
    kind: "leftovers",
    ofSlotId: cooked,
  });
}

/** Changes one recipe of a meal: other servings, or none of it any more. */
export async function changeItem(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  date: IsoDate,
  meal: Meal,
  recipeId: string,
  servings: number | null,
): Promise<void> {
  const existing = (await loadWeek(db, weekStart)).find(
    (slot) => slot.date === date && slot.meal === meal,
  );
  if (existing?.kind !== "recipes") return;
  const items = existing.items.flatMap((item) => {
    if (item.recipeId !== recipeId) return [item];
    return servings === null ? [] : [{ ...item, servings }];
  });
  await writeSlot(db, householdId, weekStart, date, meal, { kind: "recipes", items });
}

/** How far back the history of planned meals is read. */
const HISTORY_DAYS = 182;

/** The last day each recipe was on a plan before `before`. */
export async function loadHistory(db: Db, before: IsoDate): Promise<Map<string, IsoDate>> {
  const slots = await allRows(
    (from, to) =>
      db
        .from("plan_slot")
        .select("id, date")
        .eq("kind", "recipes")
        .lt("date", before)
        .gte("date", addDays(before, -HISTORY_DAYS))
        .order("id")
        .range(from, to),
    "load earlier meals",
  );
  const dateOf = new Map(slots.map((slot) => [slot.id, slot.date]));
  const history = new Map<string, IsoDate>();
  const ids = [...dateOf.keys()];
  // In portions, so the list of meals fits into the address of one request.
  for (let at = 0; at < ids.length; at += 100) {
    const items = must(
      await db
        .from("plan_slot_item")
        .select("plan_slot_id, recipe_id")
        .in("plan_slot_id", ids.slice(at, at + 100)),
      "load earlier recipes",
    );
    for (const item of items) {
      const date = dateOf.get(item.plan_slot_id) as IsoDate;
      const known = history.get(item.recipe_id);
      if (known === undefined || date > known) history.set(item.recipe_id, date);
    }
  }
  return history;
}

/**
 * The day a recipe was last cooked (`lastCooked`), from every meal it was ever on. Unlike
 * `loadHistory`, which reads half a year of the whole plan, this reads one recipe's meals.
 */
export async function loadLastCooked(
  db: Db,
  recipeId: string,
  today: IsoDate,
): Promise<IsoDate | null> {
  const items = await allRows(
    (from, to) =>
      db
        .from("plan_slot_item")
        .select("id, plan_slot_id")
        .eq("recipe_id", recipeId)
        .order("id")
        .range(from, to),
    "load meals of recipe",
  );
  const ids = [...new Set(items.map((item) => item.plan_slot_id))];
  const days: IsoDate[] = [];
  // In portions, so the list of meals fits into the address of one request.
  for (let at = 0; at < ids.length; at += SLOTS_PER_REQUEST) {
    const slots = must(
      await db
        .from("plan_slot")
        .select("date")
        .in("id", ids.slice(at, at + SLOTS_PER_REQUEST))
        .lt("date", today),
      "load days of recipe",
    );
    days.push(...slots.map((slot) => slot.date));
  }
  return lastCooked(days, today);
}

/** The meal of a week at a day and time, if it is one without a recipe. */
async function mealWithoutRecipe(db: Db, weekStart: IsoDate, date: IsoDate, meal: Meal) {
  const slot = (await loadWeek(db, weekStart)).find(
    (entry) => entry.date === date && entry.meal === meal,
  );
  return slot?.kind === "free_text" ? slot : null;
}

/**
 * Adds something to buy for a meal without a recipe. The name is looked up in the catalog,
 * so "Gurke" ends up on the list as the household's "Gurken". `shopName` says where it is
 * bought for this meal, if not where the catalog says.
 */
export async function addFood(
  db: Db,
  householdId: string,
  place: { week: IsoDate; date: IsoDate; meal: Meal },
  label: string,
  shopName: string | null,
): Promise<void> {
  const slot = await mealWithoutRecipe(db, place.week, place.date, place.meal);
  if (!slot) return;
  const name = label.trim().replace(/\s+/g, " ");
  if (name === "" || slot.foods?.some((food) => food.label.toLowerCase() === name.toLowerCase())) {
    return;
  }
  const [index, shops] = await Promise.all([
    loadCatalogIndex(db),
    db.from("shop").select("id, name"),
  ]);
  const shop = shopName ? must(shops, "load shops").find((entry) => entry.name === shopName) : null;
  const stored = await db.from("plan_slot_food").insert({
    household_id: householdId,
    plan_slot_id: slot.id,
    label: name,
    ingredient_id: findIngredient(index, name)?.id ?? null,
    shop_id: shop?.id ?? null,
    position: slot.foods?.length ?? 0,
    planned_on: today(),
  });
  if (stored.error) throw new Error(`add food: ${stored.error.message}`);
}

export async function removeFood(
  db: Db,
  place: { week: IsoDate; date: IsoDate; meal: Meal },
  label: string,
): Promise<void> {
  const slot = await mealWithoutRecipe(db, place.week, place.date, place.meal);
  if (!slot) return;
  const removed = await db
    .from("plan_slot_food")
    .delete()
    .eq("plan_slot_id", slot.id)
    .eq("label", label);
  if (removed.error) throw new Error(`remove food: ${removed.error.message}`);
}

/** Where a recipe is planned in the weeks that count as now (`currentWeeks`). */
export async function loadPlannedAt(
  db: Db,
  recipeId: string,
  now: IsoDate,
): Promise<PlannedAt | null> {
  const weeks = currentWeeks(now);
  const [planned, extras] = await Promise.all([
    loadWeeks(db, weeks[0], weeks[weeks.length - 1]),
    Promise.all(weeks.map((weekStart) => loadExtras(db, weekStart))),
  ]);
  return plannedAt(
    recipeId,
    weeks.map((weekStart, at) => ({
      weekStart,
      slots: planned.find((week) => week.weekStart === weekStart)?.slots ?? [],
      extras: extras[at],
    })),
  );
}

/** The recipes a week needs outside its meals, oldest first. */
export async function loadExtras(db: Db, weekStart: IsoDate): Promise<PlanExtra[]> {
  const plan = await db.from("week_plan").select("id").eq("week_start", weekStart).maybeSingle();
  if (plan.error) throw new Error(`load week: ${plan.error.message}`);
  if (!plan.data) return [];
  const rows = must(
    await db
      .from("plan_extra")
      .select("recipe_id, servings, note, needed_on, planned_on")
      .eq("week_plan_id", plan.data.id)
      .order("created_at"),
    "load extras of week",
  );
  return rows.map((row) => ({
    recipeId: row.recipe_id,
    servings: row.servings,
    note: row.note,
    date: row.needed_on,
    plannedOn: row.planned_on,
  }));
}

/** Adds a recipe to a week outside its meals. Adding it twice changes nothing. */
export async function addExtra(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  item: SlotItem,
): Promise<void> {
  const planId = await ensureWeek(db, householdId, weekStart);
  const stored = await db.from("plan_extra").upsert(
    {
      household_id: householdId,
      week_plan_id: planId,
      recipe_id: item.recipeId,
      servings: item.servings,
      planned_on: today(),
    },
    { onConflict: "week_plan_id,recipe_id", ignoreDuplicates: true },
  );
  if (stored.error) throw new Error(`add extra: ${stored.error.message}`);
  await fulfilWishes(db, [item.recipeId]);
}

/**
 * Changes an extra: how much of it, or (servings null) not at all; or what it is for and the
 * day it is needed (null for none in particular).
 */
export async function changeExtra(
  db: Db,
  weekStart: IsoDate,
  recipeId: string,
  change: { servings: number | null } | { note: string | null; date: IsoDate | null },
): Promise<void> {
  const plan = await db.from("week_plan").select("id").eq("week_start", weekStart).maybeSingle();
  if (plan.error) throw new Error(`load week: ${plan.error.message}`);
  if (!plan.data) return;
  const planId = plan.data.id;
  const update = (
    values: { servings: number } | { note: string | null; needed_on: IsoDate | null },
  ) => db.from("plan_extra").update(values).eq("week_plan_id", planId).eq("recipe_id", recipeId);
  let done;
  if ("note" in change) done = await update({ note: change.note, needed_on: change.date });
  else if (change.servings !== null) done = await update({ servings: change.servings });
  else {
    done = await db
      .from("plan_extra")
      .delete()
      .eq("week_plan_id", planId)
      .eq("recipe_id", recipeId);
  }
  if (done.error) throw new Error(`change extra: ${done.error.message}`);
}
