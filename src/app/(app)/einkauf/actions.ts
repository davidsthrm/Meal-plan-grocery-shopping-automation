"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { requireHousehold } from "@/server/auth";
import { addEntry, changeLine, removeEntry } from "@/server/shopping/list";
import { createSessionClient } from "@/server/supabase/server";

/** What the shopping list can be told to do. Each action is the target of a plain form. */

const week = z
  .string()
  .refine(isIsoDate)
  .refine((value) => mondayOf(value) === value);
const line = z.object({ week, key: z.string().min(1).max(200) });

function read<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("The form of the shopping list could not be read.");
  return parsed.data;
}

function backToList(weekStart: string): never {
  revalidatePath("/einkauf");
  redirect(`/einkauf?w=${weekStart}`);
}

/** Adds a line typed by hand. Nothing typed adds nothing. */
export async function addListEntry(form: FormData): Promise<void> {
  const input = read(z.object({ week, text: z.string().trim().max(120) }), form);
  const household = await requireHousehold();
  if (input.text !== "") {
    await addEntry(await createSessionClient(), household, input.week, input.text);
  }
  backToList(input.week);
}

export async function removeListEntry(form: FormData): Promise<void> {
  const input = read(z.object({ week, entry: z.guid() }), form);
  await requireHousehold();
  await removeEntry(await createSessionClient(), input.entry);
  backToList(input.week);
}

/** Ticks a line off, or takes the tick away. */
export async function checkLine(form: FormData): Promise<void> {
  const input = read(line.extend({ checked: z.enum(["0", "1"]) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, input.week, input.key, {
    checked: input.checked === "1",
  });
  backToList(input.week);
}

/** Says that something is at home and need not be bought, or that it has to be bought after all. */
export async function markAtHome(form: FormData): Promise<void> {
  const input = read(line.extend({ atHome: z.enum(["0", "1"]) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, input.week, input.key, {
    atHome: input.atHome === "1",
  });
  backToList(input.week);
}

/** Writes a note next to a line: a brand, an offer price. */
export async function noteLine(form: FormData): Promise<void> {
  const input = read(line.extend({ note: z.string().trim().max(80) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, input.week, input.key, {
    note: input.note,
  });
  backToList(input.week);
}
