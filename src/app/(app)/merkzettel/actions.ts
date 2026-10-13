"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { addRestock, moveToList, removeRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";

/** What the note for things that ran out can be told to do. Each is the target of a form. */

/** The note shows on its own page and next to the shopping lists. An action returns there. */
const back = z
  .string()
  .max(200)
  .refine((path) => path === "/merkzettel" || /^\/einkauf(\?[\w=&.-]*)?$/.test(path))
  .catch("/merkzettel");

function read<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("The form of the note could not be read.");
  return parsed.data;
}

function returnTo(path: string, extra: Record<string, string> = {}): never {
  revalidatePath("/", "layout");
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("auf");
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  const search = params.toString();
  redirect(search ? `${base}?${search}` : base);
}

/** Writes something on the note. Nothing written adds nothing. */
export async function noteRestock(form: FormData): Promise<void> {
  const input = read(z.object({ back, text: z.string().max(400) }), form);
  const household = await requireHousehold();
  await addRestock(await createSessionClient(), household, input.text);
  returnTo(input.back);
}

/** Strikes an entry: it turned up, or is not needed after all. */
export async function strikeRestock(form: FormData): Promise<void> {
  const input = read(z.object({ back, id: z.guid() }), form);
  await requireHousehold();
  await removeRestock(await createSessionClient(), input.id);
  returnTo(input.back);
}

/** Puts one entry, or with no id all of them, on the list of the next shopping day. */
export async function listRestock(form: FormData): Promise<void> {
  const input = read(z.object({ back, id: z.guid().optional() }), form);
  const household = await requireHousehold();
  const days = await moveToList(await createSessionClient(), household, today(), input.id ?? null);
  returnTo(input.back, days.length > 0 ? { auf: days.join(".") } : {});
}
