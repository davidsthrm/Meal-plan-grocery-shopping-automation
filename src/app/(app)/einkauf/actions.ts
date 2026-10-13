"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { requireHousehold, type Household } from "@/server/auth";
import { addEntry, changeLine, isShoppingDay, removeEntry } from "@/server/shopping/list";
import { createSessionClient } from "@/server/supabase/server";

/** What a shopping list can be told to do. Each action is the target of a plain form. */

const date = z.string().refine(isIsoDate);
/** The week the page shows, the shopping day the form is about, and the day shown alone. */
const place = z.object({
  week: date.refine((value) => mondayOf(value) === value),
  day: date,
  shown: z.union([date, z.literal("")]),
});
const line = place.extend({ key: z.string().min(1).max(200) });

function read<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("The form of the shopping list could not be read.");
  return parsed.data;
}

/** The household, for a form about one of its shopping days. */
async function householdFor(day: string): Promise<Household> {
  const household = await requireHousehold();
  if (!isShoppingDay(household, day)) throw new Error(`${day} is no shopping day.`);
  return household;
}

function backToList(input: z.infer<typeof place>): never {
  revalidatePath("/einkauf");
  const shown = input.shown === "" ? "alle" : input.shown;
  redirect(`/einkauf?w=${input.week}&tag=${shown}#tag-${input.day}`);
}

/** Adds a line typed by hand to the list of a shopping day. Nothing typed adds nothing. */
export async function addListEntry(form: FormData): Promise<void> {
  const input = read(place.extend({ text: z.string().trim().max(120) }), form);
  const household = await householdFor(input.day);
  if (input.text !== "") {
    await addEntry(await createSessionClient(), household, input.day, input.text);
  }
  backToList(input);
}

export async function removeListEntry(form: FormData): Promise<void> {
  const input = read(place.extend({ entry: z.guid() }), form);
  await requireHousehold();
  await removeEntry(await createSessionClient(), input.entry);
  backToList(input);
}

/** Ticks a line off, or takes the tick away. */
export async function checkLine(form: FormData): Promise<void> {
  const input = read(line.extend({ checked: z.enum(["0", "1"]) }), form);
  const household = await householdFor(input.day);
  await changeLine(await createSessionClient(), household, input.day, input.key, {
    checked: input.checked === "1",
  });
  backToList(input);
}

/** Says that something is at home and need not be bought, or that it has to be bought after all. */
export async function markAtHome(form: FormData): Promise<void> {
  const input = read(line.extend({ atHome: z.enum(["0", "1"]) }), form);
  const household = await householdFor(input.day);
  await changeLine(await createSessionClient(), household, input.day, input.key, {
    atHome: input.atHome === "1",
  });
  backToList(input);
}

/** Writes a note next to a line: a brand, an offer price. */
export async function noteLine(form: FormData): Promise<void> {
  const input = read(line.extend({ note: z.string().trim().max(80) }), form);
  const household = await householdFor(input.day);
  await changeLine(await createSessionClient(), household, input.day, input.key, {
    note: input.note,
  });
  backToList(input);
}
