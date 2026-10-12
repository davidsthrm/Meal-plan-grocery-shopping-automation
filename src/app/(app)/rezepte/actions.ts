"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { DISH_TYPES, PROTEIN_TYPES } from "@/domain/import/extraction";
import {
  readReview,
  reviewInput,
  type ReviewErrors,
  type ReviewInput,
} from "@/domain/import/review-input";
import {
  readTypedRecipe,
  type TypedRecipeErrors,
  type TypedRecipeInput,
} from "@/domain/library/typed-recipe";
import { plannedServings } from "@/domain/recipe";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex } from "@/server/catalog";
import { writeSlot } from "@/server/planning/week";
import { createTypedRecipe, updateTypedRecipe } from "@/server/recipes";
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

/** Marks a recipe as one someone wants to cook soon, or takes the mark away. */
export async function setWanted(form: FormData): Promise<void> {
  const input = z
    .object({ recipe: z.guid(), wanted: z.enum(["0", "1"]) })
    .parse(Object.fromEntries(form));
  await requireHousehold();
  const db = await createSessionClient();
  // Row level security lets this reach the household's own recipes only.
  const updated = await db
    .from("recipe")
    .update({ wanted_at: input.wanted === "1" ? new Date().toISOString() : null })
    .eq("id", input.recipe);
  if (updated.error) throw new Error(`mark wish: ${updated.error.message}`);
  revalidatePath("/", "layout");
}

export interface TypedRecipeState {
  errors: TypedRecipeErrors;
  /** What was typed, so nothing is lost when the form comes back with a message. */
  values: TypedRecipeInput | null;
}

/**
 * Saves a new recipe typed in by hand. One that was started from a meal of the week plan is
 * put on that meal.
 */
export async function saveTypedRecipe(
  _previous: TypedRecipeState,
  form: FormData,
): Promise<TypedRecipeState> {
  const text = (name: string) => String(form.get(name) ?? "");
  const values: TypedRecipeInput = {
    title: text("title"),
    category: text("category"),
    protein: text("protein"),
    servings: text("servings"),
    servingsUnit: text("servingsUnit"),
    minutes: text("minutes"),
    book: text("book"),
    page: text("page"),
    lines: form.has("lines") ? text("lines") : null,
  };
  const household = await requireHousehold();
  const db = await createSessionClient();
  const read = readTypedRecipe(values, await loadCatalogIndex(db));
  if (!read.ok) return { errors: read.errors, values };

  if (read.recipe.lines === null) {
    return { errors: { lines: "Mindestens eine Zutat, eine pro Zeile." }, values };
  }
  const created = await createTypedRecipe(db, household.id, read.recipe);
  revalidatePath("/", "layout");

  const week = text("w");
  const date = text("d");
  const meal = z.enum(["lunch", "dinner", "coffee"]).safeParse(form.get("m"));
  if (isIsoDate(week) && isIsoDate(date) && mondayOf(date) === week && meal.success) {
    await writeSlot(db, household.id, week, date, meal.data, {
      kind: "recipes",
      items: [
        {
          recipeId: created,
          servings: plannedServings(read.recipe.servings, household.defaultServings),
        },
      ],
    });
    redirect(`/woche?w=${week}#tag-${date}`);
  }
  redirect(`/rezepte/${created}`);
}

/**
 * Saves the changes to a recipe: what stands above its ingredients, and every ingredient
 * line as it was corrected, added or removed. Returns what is wrong where, if anything is.
 */
export async function saveRecipeEdit(
  recipeId: string,
  input: ReviewInput,
  kind: { category: string; protein: string },
): Promise<{ errors: ReviewErrors }> {
  const household = await requireHousehold();
  const id = z.guid().safeParse(recipeId);
  const parsed = reviewInput.safeParse(input);
  if (!id.success || !parsed.success) {
    return { errors: { title: "Das Formular konnte nicht gelesen werden." } };
  }
  const db = await createSessionClient();
  const read = readReview(parsed.data, await loadCatalogIndex(db));
  if (!read.ok) return { errors: read.errors };

  const dishType = (DISH_TYPES as readonly string[]).includes(kind.category)
    ? (kind.category as (typeof DISH_TYPES)[number])
    : "unbekannt";
  const proteinType = (PROTEIN_TYPES as readonly string[]).includes(kind.protein)
    ? (kind.protein as (typeof PROTEIN_TYPES)[number])
    : "unknown";
  await updateTypedRecipe(db, household.id, id.data, {
    title: parsed.data.title.trim(),
    sourceBook: parsed.data.sourceBook.trim() || null,
    sourcePage: read.page,
    servings: read.servings,
    prepMinutes: read.prep,
    dishType,
    proteinType,
    lines: read.lines,
  });
  revalidatePath("/", "layout");
  redirect(`/rezepte/${id.data}`);
}
