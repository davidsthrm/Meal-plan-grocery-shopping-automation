"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import type { NewSlot, SlotContent } from "@/domain/plan";
import { slotKey } from "@/domain/plan";
import { plannedServings } from "@/domain/recipe";
import { requireHousehold } from "@/server/auth";
import { must, type Db } from "@/server/catalog";
import {
  addToSlot,
  changeItem,
  copyPreviousWeek,
  loadWeek,
  planOpenSlots,
  writeSlot,
} from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";

/**
 * Everything the week plan can be told to do. Each action is the target of a plain form, so
 * the plan works without waiting for scripts; what arrives is checked again here.
 */

const date = z.string().refine(isIsoDate);
const place = z
  .object({ week: date, date, meal: z.enum(["lunch", "dinner"]) })
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
  backToWeek(input.week, input.date);
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
  if (input.kind === "free_text" || input.kind === "away") {
    // Nothing typed is nothing planned.
    if (!input.label) backToWeek(input.week, input.date);
    content = { kind: input.kind, label: input.label };
  } else {
    content = { kind: input.kind };
  }
  const household = await requireHousehold();
  const db = await createSessionClient();
  await writeSlot(db, household.id, input.week, input.date, input.meal, content);
  backToWeek(input.week, input.date);
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

export async function copyLastWeek(form: FormData): Promise<void> {
  const week = weekStart.parse(form.get("week"));
  const household = await requireHousehold();
  const db = await createSessionClient();
  await copyPreviousWeek(db, household.id, week);
  backToWeek(week);
}
