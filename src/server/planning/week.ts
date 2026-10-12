import "server-only";
import { addDays, type IsoDate } from "@/domain/dates";
import {
  copyOfWeek,
  slotKey,
  type Meal,
  type NewSlot,
  type PlanSlot,
  type SlotContent,
  type SlotItem,
} from "@/domain/plan";
import { allRows } from "../library";
import { must, type Db } from "../catalog";

/**
 * Reading and writing week plans. A week exists in the database from the first meal planned
 * in it. Row level security decides whose weeks these are.
 */

export async function loadWeek(db: Db, weekStart: IsoDate): Promise<PlanSlot[]> {
  const plan = await db.from("week_plan").select("id").eq("week_start", weekStart).maybeSingle();
  if (plan.error) throw new Error(`load week: ${plan.error.message}`);
  if (!plan.data) return [];

  const slots = must(
    await db
      .from("plan_slot")
      .select("id, date, meal, kind, label, leftovers_of_slot_id")
      .eq("week_plan_id", plan.data.id)
      .order("date"),
    "load meals of week",
  );
  const items =
    slots.length === 0
      ? []
      : must(
          await db
            .from("plan_slot_item")
            .select("plan_slot_id, recipe_id, servings, position")
            .in(
              "plan_slot_id",
              slots.map((slot) => slot.id),
            )
            .order("position"),
          "load recipes of week",
        );

  return slots.map((slot): PlanSlot => {
    const base = { id: slot.id, date: slot.date, meal: slot.meal };
    switch (slot.kind) {
      case "recipes":
        return {
          ...base,
          kind: "recipes",
          items: items
            .filter((item) => item.plan_slot_id === slot.id)
            .map((item) => ({ recipeId: item.recipe_id, servings: item.servings })),
        };
      case "free_text":
      case "away":
        return { ...base, kind: slot.kind, label: slot.label ?? "" };
      case "leftovers":
        return { ...base, kind: "leftovers", ofSlotId: slot.leftovers_of_slot_id };
      default:
        return { ...base, kind: "skipped" };
    }
  });
}

async function ensureWeek(db: Db, householdId: string, weekStart: IsoDate): Promise<string> {
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

/** Sets what one meal of a week is, replacing what was there. Null empties it. */
export async function writeSlot(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
  date: IsoDate,
  meal: Meal,
  content: SlotContent | null,
): Promise<void> {
  const planId = await ensureWeek(db, householdId, weekStart);
  const removed = await db
    .from("plan_slot")
    .delete()
    .eq("week_plan_id", planId)
    .eq("date", date)
    .eq("meal", meal);
  if (removed.error) throw new Error(`clear meal: ${removed.error.message}`);
  if (content === null) return;
  // A meal without a recipe is no "recipes" meal.
  if (content.kind === "recipes" && content.items.length === 0) return;

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
      })
      .select("id")
      .single(),
    "plan meal",
  );
  if (content.kind !== "recipes") return;
  const items = await db.from("plan_slot_item").insert(
    content.items.map((item, position) => ({
      household_id: householdId,
      plan_slot_id: slot.id,
      recipe_id: item.recipeId,
      servings: item.servings,
      position,
    })),
  );
  if (items.error) {
    // Do not leave a meal behind that claims to have recipes and has none.
    await db.from("plan_slot").delete().eq("id", slot.id);
    throw new Error(`plan recipes of meal: ${items.error.message}`);
  }
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
  const items = wanted.flatMap(({ date, meal, content }) =>
    content.kind === "recipes"
      ? content.items.map((item, position) => ({
          household_id: householdId,
          plan_slot_id: idOf.get(slotKey(date, meal)) as string,
          recipe_id: item.recipeId,
          servings: item.servings,
          position,
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

/** Takes over last week's meals for every meal this week has not planned yet. */
export async function copyPreviousWeek(
  db: Db,
  householdId: string,
  weekStart: IsoDate,
): Promise<number> {
  const [previous, current] = await Promise.all([
    loadWeek(db, addDays(weekStart, -7)),
    loadWeek(db, weekStart),
  ]);
  const taken = new Set(current.map((slot) => slotKey(slot.date, slot.meal)));
  const copies = copyOfWeek(previous, 7, taken);
  await planOpenSlots(db, householdId, weekStart, copies);
  return copies.length;
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
