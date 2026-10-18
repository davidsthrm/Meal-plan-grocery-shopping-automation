"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { DISH_TYPES, PROTEIN_TYPES } from "@/domain/import/extraction";
import {
  readReview,
  reviewInput,
  type ReviewErrors,
  type ReviewInput,
} from "@/domain/import/review-input";
import { savedSteps } from "@/domain/import/steps";
import { PASTED_TEXT_MAX, pastedRecipe, type PastedRecipe } from "@/domain/library/pasted-recipe";
import { readOwnTags } from "@/domain/library/tags";
import {
  readTypedRecipe,
  type TypedRecipeErrors,
  type TypedRecipeInput,
} from "@/domain/library/typed-recipe";
import { plannedServings } from "@/domain/recipe";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex } from "@/server/catalog";
import { importModels } from "@/server/import/models";
import { writeSlot } from "@/server/planning/week";
import { createTypedRecipe, saveRecipeTags, updateTypedRecipe } from "@/server/recipes";
import { saveCheckedSteps } from "@/server/step-checks";
import { createSessionClient } from "@/server/supabase/server";
import { tagRecipes } from "@/server/tagging";

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
  // The heart is on every recipe card: on "Entdecken", on "Favoriten" and on its own page.
  revalidatePath("/", "layout");
}

/**
 * Saves the steps of a recipe changed on its own page, and opens them there. An emptied field
 * says the recipe has none. Whatever was in doubt about them, a person has now looked.
 */
export async function saveSteps(form: FormData): Promise<void> {
  await requireHousehold();
  const id = z.guid().parse(form.get("rezept"));
  // Only the way back is taken over from the page's address, nothing else.
  const back = new URLSearchParams(String(form.get("zurueck") ?? ""));
  const kept = new URLSearchParams();
  for (const key of ["von", "w", "feld"]) {
    const value = back.get(key);
    if (value) kept.set(key, value.slice(0, 40));
  }
  const steps = savedSteps(String(form.get("schritte") ?? ""));
  if (!steps.ok) {
    kept.set("schritte", "bearbeiten");
    kept.set("fehler", "schritte");
    redirect(`/rezepte/${id}?${kept}#arbeitsschritte`);
  }
  // Row level security lets this reach the household's own recipes only.
  await saveCheckedSteps(await createSessionClient(), id, steps.steps);
  revalidatePath("/", "layout");
  kept.set("schritte", "offen");
  redirect(`/rezepte/${id}?${kept}#arbeitsschritte`);
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
    steps: text("steps"),
  };
  const household = await requireHousehold();
  const db = await createSessionClient();
  const read = readTypedRecipe(values, await loadCatalogIndex(db));
  if (!read.ok) return { errors: read.errors, values };

  if (read.recipe.lines === null) {
    return { errors: { lines: "Mindestens eine Zutat, eine pro Zeile." }, values };
  }
  const created = await createTypedRecipe(db, household.id, read.recipe);
  // A recipe that was pasted in keeps its text as it was pasted, beside the steps read from it.
  const sourceText = text("sourceText").trim().slice(0, PASTED_TEXT_MAX);
  if (sourceText !== "") {
    const kept = await db.from("recipe").update({ source_text: sourceText }).eq("id", created);
    if (kept.error) throw new Error(`keep pasted text: ${kept.error.message}`);
  }
  revalidatePath("/", "layout");
  // A pasted recipe was read by the model anyway; the tags that describe it are suggested the
  // same way, once the page is on its way, so nobody waits for it. A recipe typed in by hand
  // calls no model: its printed time says how much work it is, the rest is set by hand.
  if (sourceText !== "") {
    after(async () => {
      try {
        await tagRecipes(db, household.id, importModels().tag, [created]);
      } catch (error) {
        console.error("describing a pasted recipe failed", error);
      }
    });
  }

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

export interface PastedState {
  /** What was read from the text, as the fields of the form for a new recipe. */
  read: PastedRecipe | null;
  /** The text as it was pasted. */
  text: string;
  error: string | null;
}

/**
 * Reads a recipe from text someone pasted in. Nothing is saved here: what was read fills the
 * form for a new recipe, where a person looks at it first.
 */
export async function readPastedRecipe(
  _previous: PastedState,
  form: FormData,
): Promise<PastedState> {
  const text = String(form.get("text") ?? "").trim();
  if (text.length < 20) {
    return {
      read: null,
      text,
      error: "Füge den Text des Rezepts ein: Titel, Zutaten, Zubereitung.",
    };
  }
  if (text.length > PASTED_TEXT_MAX) {
    return {
      read: null,
      text,
      error: "Das ist mehr Text als ein Rezept hat. Kürze ihn auf das Rezept selbst.",
    };
  }
  const household = await requireHousehold();
  try {
    const { recipe } = await importModels().readText(text);
    return { read: pastedRecipe(recipe, household.defaultServings), text, error: null };
  } catch (error) {
    console.error("reading a pasted recipe failed", error);
    return {
      read: null,
      text,
      error:
        "Der Text konnte gerade nicht eingelesen werden. Versuch es noch einmal, oder trag das Rezept unter „Eintippen“ selbst ein.",
    };
  }
}

/**
 * Saves the changes to a recipe: what stands above its ingredients, and every ingredient
 * line as it was corrected, added or removed. Returns what is wrong where, if anything is.
 */
export async function saveRecipeEdit(
  recipeId: string,
  input: ReviewInput,
  kind: { category: string; protein: string; tags: string[]; ownTags: string },
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
    steps: read.steps,
  });
  const tags = z.array(z.string().max(64)).max(40).safeParse(kind.tags);
  await saveRecipeTags(
    db,
    household.id,
    id.data,
    tags.success ? tags.data : [],
    readOwnTags(String(kind.ownTags ?? "")),
  );
  revalidatePath("/", "layout");
  redirect(`/rezepte/${id.data}`);
}
