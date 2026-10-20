"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { readFamilySize } from "@/domain/family";
import type { Meal, NewSlot, SlotContent } from "@/domain/plan";
import { byDayAndMeal, namedMeal, slotKey } from "@/domain/plan";
import { plannedServings } from "@/domain/recipe";
import { BALANCE_GROUPS, readTargets } from "@/domain/recommend/balance";
import { readDaysForm, readWeekday } from "@/domain/shopping-list/trips";
import { readFood } from "@/domain/vesper";
import { TARGETS_SEEN } from "@/lib/plan-text";
import { requireHousehold } from "@/server/auth";
import { must, type Db } from "@/server/catalog";
import {
  addExtra,
  addFood,
  addToSlot,
  changeExtra,
  changeItem,
  setExtraPortions,
  removeFood,
  loadWeek,
  planOpenSlots,
  resetWeek,
  savePlan,
  writeSlot,
} from "@/server/planning/week";
import { storeDrugstoreWeekday, storeShoppingDays } from "@/server/settings";
import { createSessionClient } from "@/server/supabase/server";

/**
 * Everything the week plan can be told to do. Each action is the target of a plain form, so
 * the plan works without waiting for scripts; what arrives is checked again here.
 */

const date = z.string().refine(isIsoDate);
const place = z
  .object({ week: date, date, meal: z.enum(["lunch", "dinner", "coffee"]) })
  // A meal belongs to the week it is planned in, and a week starts on a Monday.
  .refine((value) => mondayOf(value.week) === value.week && mondayOf(value.date) === value.week);
// Any id in the usual form: the seeded recipes have ids that are no version 4 UUIDs.
const recipeId = z.guid();
const weekStart = date.refine((value) => mondayOf(value) === value);

function read<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("The form of the week plan could not be read.");
  return parsed.data;
}

function backToWeek(week: string, day?: string): never {
  revalidatePath("/woche");
  redirect(`/woche?w=${week}${day ? `#tag-${day}` : ""}`);
}

/**
 * After a meal was planned: back to the week, or, when it was planned on the meal's own page
 * (the form says `bleiben`), back to that page, which says what is planned now and leads on
 * to the next meal.
 */
function afterPlanning(form: FormData, input: { week: string; date: string; meal: string }): never {
  if (form.get("bleiben") !== "1") backToWeek(input.week, input.date);
  revalidatePath("/woche");
  redirect(
    `/woche/auswahl?${new URLSearchParams({ w: input.week, d: input.date, m: input.meal, modus: "replace" })}`,
  );
}

function backToExtras(week: string): never {
  revalidatePath("/woche");
  redirect(`/woche?w=${week}&t=extra`);
}

/** How much of each recipe is planned unless someone says otherwise. Unknown ids are left out. */
async function plannedAmounts(db: Db, ids: string[], householdServings: number) {
  const rows = must(
    await db
      .from("recipe")
      .select("id, servings_min, servings_max, servings_unit")
      .in("id", ids)
      .eq("status", "approved"),
    "load recipes to plan",
  );
  return new Map(
    rows.map((row) => [
      row.id,
      row.servings_min !== null && row.servings_max !== null
        ? plannedServings(
            { min: row.servings_min, max: row.servings_max, unit: row.servings_unit },
            householdServings,
          )
        : householdServings,
    ]),
  );
}

/** Puts a recipe on a meal: instead of what is there, or next to it. */
export async function planRecipe(form: FormData): Promise<void> {
  const input = read(
    z.intersection(place, z.object({ recipe: recipeId, mode: z.enum(["replace", "add"]) })),
    form,
  );
  const household = await requireHousehold();
  const db = await createSessionClient();
  const servings = (await plannedAmounts(db, [input.recipe], household.defaultServings)).get(
    input.recipe,
  );
  if (servings !== undefined) {
    const item = { recipeId: input.recipe, servings };
    if (input.mode === "add") {
      await addToSlot(db, household.id, input.week, input.date, input.meal, item);
    } else {
      await writeSlot(db, household.id, input.week, input.date, input.meal, {
        kind: "recipes",
        items: [item],
      });
    }
  }
  afterPlanning(form, input);
}

/** Takes over the suggestions shown for the open meals of a week, all at once. */
export async function acceptSuggestions(form: FormData): Promise<void> {
  const week = weekStart.parse(form.get("week"));
  const picks = form
    .getAll("pick")
    .map((value) => String(value).split("|"))
    .map(([day, meal, recipe]) =>
      z.intersection(place, z.object({ recipe: recipeId })).safeParse({
        week,
        date: day,
        meal,
        recipe,
      }),
    )
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [current, amounts] = await Promise.all([
    loadWeek(db, week),
    plannedAmounts(
      db,
      picks.map((pick) => pick.recipe),
      household.defaultServings,
    ),
  ]);
  // Only meals that are still open: someone else may have planned one in the meantime.
  const taken = new Set(current.map((slot) => slotKey(slot.date, slot.meal)));
  const open: NewSlot[] = [];
  for (const pick of picks) {
    const servings = amounts.get(pick.recipe);
    const key = slotKey(pick.date, pick.meal);
    if (servings === undefined || taken.has(key)) continue;
    taken.add(key);
    open.push({
      date: pick.date,
      meal: pick.meal,
      content: { kind: "recipes", items: [{ recipeId: pick.recipe, servings }] },
    });
  }
  await planOpenSlots(db, household.id, week, open);
  backToWeek(week);
}

/** Plans a meal without a recipe: a cold supper, leftovers, eating out, or nothing. */
export async function markSlot(form: FormData): Promise<void> {
  const input = read(
    z.intersection(
      place,
      z.object({
        kind: z.enum(["free_text", "leftovers", "away", "skipped"]),
        label: z.string().trim().max(60).optional(),
      }),
    ),
    form,
  );
  let content: SlotContent;
  // "oma heidrun" typed in is the meal of that name, not a dish that lacks a recipe.
  const named = input.kind === "free_text" && input.label ? namedMeal(input.label) : undefined;
  const kind = named?.kind ?? input.kind;
  const label = named?.label ?? input.label;
  if (kind === "free_text" || kind === "away") {
    // Nothing typed is nothing planned.
    if (!label) afterPlanning(form, input);
    content = { kind, label };
  } else {
    content = { kind };
  }
  const household = await requireHousehold();
  const db = await createSessionClient();
  // A typed meal that is the title of a recipe is planned as that recipe, so its ingredients
  // reach the shopping list. Wildcard characters would make the comparison a pattern.
  if (content.kind === "free_text" && !/[%_*\\]/.test(content.label)) {
    const known = must(
      await db
        .from("recipe")
        .select("id")
        .eq("status", "approved")
        .ilike("title", content.label)
        .limit(1),
      "look up typed meal",
    );
    const servings = known[0]
      ? (await plannedAmounts(db, [known[0].id], household.defaultServings)).get(known[0].id)
      : undefined;
    if (known[0] && servings !== undefined) {
      content = { kind: "recipes", items: [{ recipeId: known[0].id, servings }] };
    }
  }
  await writeSlot(db, household.id, input.week, input.date, input.meal, content);
  afterPlanning(form, input);
}

/**
 * Says that a typed meal needs no recipe: a visit, a meal that is ordered. It becomes a
 * meal away from the kitchen and keeps its name, and nobody is asked to upload a page for it.
 */
export async function needsNoRecipe(form: FormData): Promise<void> {
  const input = read(place, form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const slot = (await loadWeek(db, input.week)).find(
    (entry) => entry.date === input.date && entry.meal === input.meal,
  );
  if (slot?.kind === "free_text") {
    await writeSlot(db, household.id, input.week, input.date, input.meal, {
      kind: "away",
      label: slot.label,
    });
  }
  backToWeek(input.week, input.date);
}

/** Saves the plan of a week: the household is done planning it. Or takes the pen again. */
export async function saveWeekPlan(form: FormData): Promise<void> {
  const input = read(z.object({ week: weekStart, saved: z.enum(["0", "1"]) }), form);
  const household = await requireHousehold();
  await savePlan(await createSessionClient(), household.id, input.week, input.saved === "1");
  backToWeek(input.week);
}

/** Rubs out the whole week: every meal, and what it needs besides. */
export async function resetWeekPlan(form: FormData): Promise<void> {
  const input = read(z.object({ week: weekStart }), form);
  const household = await requireHousehold();
  await resetWeek(await createSessionClient(), household.id, input.week);
  revalidatePath("/einkauf");
  backToWeek(input.week);
}

export async function clearSlot(form: FormData): Promise<void> {
  const input = read(place, form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  await writeSlot(db, household.id, input.week, input.date, input.meal, null);
  backToWeek(input.week, input.date);
}

/** Sets how much of a planned recipe is cooked. Zero takes the recipe off the meal. */
export async function changeServings(form: FormData): Promise<void> {
  const input = read(
    z.intersection(
      place,
      z.object({ recipe: recipeId, servings: z.coerce.number().int().min(0).max(99) }),
    ),
    form,
  );
  const household = await requireHousehold();
  const db = await createSessionClient();
  await changeItem(
    db,
    household.id,
    input.week,
    input.date,
    input.meal,
    input.recipe,
    input.servings === 0 ? null : input.servings,
  );
  backToWeek(input.week, input.date);
}

/**
 * "Mehr kochen": extra portions of a meal for leftovers, and "Reste" on the later meal that
 * was picked for them (`reste`: "<date>.<meal>", or empty for none).
 */
export async function cookMoreOfMeal(form: FormData): Promise<void> {
  const input = read(
    z.intersection(
      place,
      z.object({
        extra: z.coerce.number().int().min(1).max(20),
        reste: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}\.(lunch|dinner)$/)]),
      }),
    ),
    form,
  );
  const household = await requireHousehold();
  const [day, meal] = input.reste.split(".");
  const picked: { date: string; meal: Meal } | null =
    isIsoDate(day) && (meal === "lunch" || meal === "dinner") ? { date: day, meal } : null;
  // Leftovers come after the meal they were cooked with.
  const later = picked && byDayAndMeal(picked, input) > 0 ? picked : null;
  await setExtraPortions(
    await createSessionClient(),
    household.id,
    input.week,
    input.date,
    input.meal,
    input.extra,
    later,
  );
  backToWeek(input.week, input.date);
}

/**
 * Changes how many extra portions a meal is cooked with: a third person at the leftovers
 * next day. Zero cooks the meal as planned again.
 */
export async function changeExtraPortions(form: FormData): Promise<void> {
  const input = read(
    z.intersection(place, z.object({ extra: z.coerce.number().int().min(0).max(20) })),
    form,
  );
  const household = await requireHousehold();
  await setExtraPortions(
    await createSessionClient(),
    household.id,
    input.week,
    input.date,
    input.meal,
    input.extra,
  );
  backToWeek(input.week, input.date);
}

/** Adds a recipe to the week outside its meals. */
export async function planExtra(form: FormData): Promise<void> {
  const input = read(z.object({ week: weekStart, recipe: recipeId }), form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const servings = (await plannedAmounts(db, [input.recipe], household.defaultServings)).get(
    input.recipe,
  );
  if (servings !== undefined) {
    await addExtra(db, household.id, input.week, { recipeId: input.recipe, servings });
  }
  backToExtras(input.week);
}

/** Sets how much of an extra is made. Zero takes it off the week. */
export async function changeExtraServings(form: FormData): Promise<void> {
  const input = read(
    z.object({
      week: weekStart,
      recipe: recipeId,
      servings: z.coerce.number().int().min(0).max(99),
    }),
    form,
  );
  await requireHousehold();
  const db = await createSessionClient();
  await changeExtra(db, input.week, input.recipe, {
    servings: input.servings === 0 ? null : input.servings,
  });
  backToExtras(input.week);
}

/**
 * Notes what an extra is for ("Einladung am Samstag") and the day of the week it is needed,
 * or none: with a day it is bought for that day like a meal.
 */
export async function describeExtra(form: FormData): Promise<void> {
  const input = read(
    z.object({
      week: weekStart,
      recipe: recipeId,
      note: z.string().trim().max(80),
      date: z.union([z.literal(""), date]),
    }),
    form,
  );
  const day = input.date === "" ? null : input.date;
  if (day !== null && mondayOf(day) !== input.week) throw new Error("A day outside its week.");
  await requireHousehold();
  const db = await createSessionClient();
  await changeExtra(db, input.week, input.recipe, { note: input.note || null, date: day });
  backToExtras(input.week);
}

/**
 * Back to where a food was added or removed: the page of a meal's foods, or the recipe chooser
 * when it was tapped there next to the recipes (the form says `zurueck`).
 */
function backToFoods(form: FormData, input: { week: string; date: string; meal: string }): never {
  revalidatePath("/woche");
  if (form.get("zurueck") === "auswahl") {
    const mode = form.get("mode") === "add" ? "add" : "replace";
    redirect(
      `/woche/auswahl?${new URLSearchParams({ w: input.week, d: input.date, m: input.meal, modus: mode })}`,
    );
  }
  redirect(`/woche/lebensmittel?w=${input.week}&d=${input.date}&m=${input.meal}`);
}

/** Adds something to buy for a meal: bread for a cold supper, a baguette next to a soup. */
export async function addSlotFood(form: FormData): Promise<void> {
  const input = read(
    z.intersection(
      place,
      z.object({
        label: z.string().trim().max(60),
        shop: z.string().trim().max(60).optional(),
        quantity: z.coerce.number().int().min(1).max(99).optional(),
      }),
    ),
    form,
  );
  const household = await requireHousehold();
  const db = await createSessionClient();
  // A tap on "Dinkelbaguette" adds one; "8 Brötchen" typed says how many.
  const food = input.quantity
    ? { label: input.label, quantity: input.quantity }
    : readFood(input.label);
  if (food.label !== "") {
    await addFood(db, household.id, input, food.label, input.shop || null, food.quantity);
  }
  backToFoods(form, input);
}

export async function removeSlotFood(form: FormData): Promise<void> {
  const input = read(z.intersection(place, z.object({ label: z.string().max(60) })), form);
  await requireHousehold();
  const db = await createSessionClient();
  await removeFood(db, input, input.label);
  backToFoods(form, input);
}

/** Remembers on this device that its user has seen the household's goals. */
async function markTargetsSeen(): Promise<void> {
  (await cookies()).set(TARGETS_SEEN, "1", {
    maxAge: 60 * 60 * 24 * 400,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

/** The goals as the form (`TargetsFields`) has them. An empty field is no limit. */
function targetsOf(form: FormData) {
  const limit = (name: string) => {
    const typed = String(form.get(name) ?? "").trim();
    return typed === "" ? null : Number(typed);
  };
  return readTargets(
    Object.fromEntries(
      BALANCE_GROUPS.map((group) => [
        group,
        { min: limit(`${group}-min`), max: limit(`${group}-max`) },
      ]),
    ),
  );
}

/** Stores what the household aims for in a week. An empty field is no limit. */
export async function saveTargets(form: FormData): Promise<void> {
  const targets = targetsOf(form);
  // What makes no sense is sent back to the form, which says so.
  if (!targets) redirect("/woche/ziele?fehler=1");
  // The first visit also asks when the household shops.
  const first = form.has("mit-einkaufstagen");
  const days = first
    ? readDaysForm((place) => form.getAll(`tage-${place}`).map(String))
    : undefined;
  if (days === null) redirect("/woche/ziele?start=1&fehler=tage");
  const household = await requireHousehold();
  const db = await createSessionClient();
  // The first visit also asks for how many the household cooks.
  const size = readFamilySize(form.get("personen"));
  const stored = await db
    .from("household")
    .update({ balance_targets: targets, ...(size === null ? {} : { default_servings: size }) })
    .eq("id", household.id);
  if (stored.error) throw new Error(`store targets: ${stored.error.message}`);
  if (days) await storeShoppingDays(db, household.id, days);
  await markTargetsSeen();
  revalidatePath("/woche");
  redirect("/woche");
}

/** Leaves the goals as they are. */
/**
 * The end of the welcome of someone who joined the household (`/willkommen`): what they
 * changed of the household's settings is stored ("Speichern"), or nothing is ("So lassen").
 * Either way this device has seen the goals, and the plan opens.
 */
export async function finishWelcome(form: FormData): Promise<void> {
  if (form.get("wahl") === "speichern") {
    const targets = targetsOf(form);
    if (!targets) redirect("/willkommen?fehler=1");
    const days = readDaysForm((place) => form.getAll(`tage-${place}`).map(String));
    if (!days) redirect("/willkommen?fehler=tage");
    const household = await requireHousehold();
    const db = await createSessionClient();
    const size = readFamilySize(form.get("personen"));
    const stored = await db
      .from("household")
      .update({ balance_targets: targets, ...(size === null ? {} : { default_servings: size }) })
      .eq("id", household.id);
    if (stored.error) throw new Error(`store targets: ${stored.error.message}`);
    await storeShoppingDays(db, household.id, days);
    const drugstore = readWeekday(form.get("tag-drugstore"));
    if (drugstore !== null) await storeDrugstoreWeekday(db, household.id, drugstore);
    revalidatePath("/woche");
  }
  await markTargetsSeen();
  redirect("/woche");
}

export async function keepTargets(): Promise<void> {
  await markTargetsSeen();
  redirect("/woche");
}
