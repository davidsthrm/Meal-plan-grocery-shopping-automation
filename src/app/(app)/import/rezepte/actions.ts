"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { shelfParams } from "@/domain/library/recipe-table";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { isEffort, setField } from "@/server/quality";
import { deleteRecipe } from "@/server/recipes";
import { createSessionClient } from "@/server/supabase/server";
import { addTagToRecipes, loadStoredTags, removeTagFromRecipes, tagForName } from "@/server/tags";

/**
 * What the household does in "Alle Rezepte": change several recipes at once, and delete one.
 * Every action is the target of a plain form; nothing needs a script.
 */

const recipeId = z.guid();

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function ids(form: FormData, name: string): string[] {
  return [
    ...new Set(
      form
        .getAll(name)
        .map(String)
        .filter((id) => recipeId.safeParse(id).success),
    ),
  ];
}

/** Back to "Alle Rezepte" as it was (its filter, sorting and page), with what to say. */
function backToShelf(form: FormData, said: Record<string, string> = {}): never {
  revalidatePath("/", "layout");
  const shelf = shelfParams(Object.fromEntries(new URLSearchParams(text(form, "zurueck"))));
  const query = new URLSearchParams({ ...shelf, ...said }).toString();
  redirect(`/import/rezepte${query ? `?${query}` : ""}`);
}

/**
 * One change for the ticked recipes: a tag added or taken away, a category or an effort set.
 * "Alle auf dieser Seite" means every recipe the page shows.
 */
export async function changeSeveral(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const chosen = text(form, "alle") === "1" ? ids(form, "angezeigt") : ids(form, "rezept");
  if (chosen.length === 0) backToShelf(form, { fehler: "auswahl" });
  const db = await createSessionClient();
  const action = text(form, "aktion");
  const done = (what: string, value: string) =>
    backToShelf(form, { getan: what, n: String(chosen.length), wert: value });

  if (action === "dazu") {
    const tag = await tagForName(db, household.id, text(form, "stichwort"));
    if (!tag) backToShelf(form, { fehler: "stichwort" });
    await addTagToRecipes(db, household.id, chosen, tag);
    done("dazu", tag.key ?? tag.id);
  }
  if (action === "weg") {
    const ref = text(form, "weg");
    const tag = (await loadStoredTags(db)).find((entry) => (entry.key ?? entry.id) === ref);
    if (!tag) backToShelf(form, { fehler: "stichwort" });
    await removeTagFromRecipes(db, chosen, tag.id);
    done("weg", tag.key ?? tag.id);
  }
  if (action === "kategorie") {
    const key = text(form, "kategorie");
    const { categories } = await loadLibrary(db);
    if (key !== "" && !categories.some((category) => category.key === key)) backToShelf(form);
    await setField(db, household.id, chosen, {
      field: "category",
      category: key === "" ? null : key,
    });
    done("kategorie", key);
  }
  if (action === "aufwand") {
    const effort = text(form, "aufwand");
    if (!isEffort(effort)) backToShelf(form);
    await setField(db, household.id, chosen, { field: "time", effort });
    done("aufwand", effort);
  }
  backToShelf(form);
}

/**
 * Deletes a recipe after the page asked once more. One that stands on a plan stays, and the
 * page says where it stands.
 */
export async function deleteFromShelf(form: FormData): Promise<void> {
  await requireHousehold();
  const id = text(form, "rezept");
  if (!recipeId.safeParse(id).success || text(form, "bestaetigt") !== "ja") backToShelf(form);
  const places = await deleteRecipe(await createSessionClient(), id);
  if (places.length > 0) backToShelf(form, { loeschen: id });
  backToShelf(form, { getan: "geloescht", n: "1" });
}
