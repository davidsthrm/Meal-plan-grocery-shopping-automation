"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHousehold } from "@/server/auth";
import { createSessionClient } from "@/server/supabase/server";

/** Marks a recipe as one of the household's favourites, or takes the mark away. */
export async function setFavorite(form: FormData): Promise<void> {
  const input = z
    .object({ recipe: z.guid(), favorite: z.enum(["0", "1"]) })
    .parse(Object.fromEntries(form));
  await requireHousehold();
  const db = await createSessionClient();
  // Row level security lets this reach the household's own recipes only.
  const updated = await db
    .from("recipe")
    .update({ is_favorite: input.favorite === "1" })
    .eq("id", input.recipe);
  if (updated.error) throw new Error(`mark favourite: ${updated.error.message}`);
  revalidatePath("/rezepte");
  revalidatePath(`/rezepte/${input.recipe}`);
}
