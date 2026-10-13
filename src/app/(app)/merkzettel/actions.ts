"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ShoppingTrip } from "@/domain/shopping-list/trips";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { addRestock, moveToList, removeRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";

/** What the note says back after it was told something: the errands entries were put on. */
export interface RestockState {
  moved: ShoppingTrip[];
}

const told = z.discriminatedUnion("do", [
  z.object({ do: z.literal("note"), text: z.string().max(400) }),
  z.object({ do: z.literal("strike"), id: z.guid() }),
  // Without an id: every entry.
  z.object({ do: z.literal("list"), id: z.guid().optional() }),
]);

/**
 * What the note for things that ran out can be told to do: write an entry, strike one, or
 * put one or all on the note of the next errand. The note is shown on top of whatever page
 * is open, so nothing leads anywhere: the page is read again where it stands.
 */
export async function tellRestock(_: RestockState, form: FormData): Promise<RestockState> {
  const parsed = told.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("The form of the note could not be read.");
  const input = parsed.data;
  const household = await requireHousehold();
  const db = await createSessionClient();
  let moved: ShoppingTrip[] = [];
  if (input.do === "note") await addRestock(db, household, input.text);
  if (input.do === "strike") await removeRestock(db, input.id);
  if (input.do === "list") moved = await moveToList(db, household, today(), input.id ?? null);
  revalidatePath("/", "layout");
  return { moved };
}
