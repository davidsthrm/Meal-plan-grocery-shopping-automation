"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readTypedSteps } from "@/domain/import/steps";
import { isCheckedField, type CheckedField } from "@/domain/library/quality";
import { requireHousehold } from "@/server/auth";
import {
  isEffort,
  isProtein,
  keepBoth,
  loadLibraryChecks,
  markChecked,
  mergeRecipes,
  recipeChecks,
  setField,
  takeSuggestions,
  type FieldValue,
} from "@/server/quality";
import { saveCheckedSteps } from "@/server/step-checks";
import { createSessionClient } from "@/server/supabase/server";

/**
 * What the household decides on the checks of the library. Each action is the target of a
 * plain form on the page; nothing needs a script.
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

function filterOf(form: FormData): CheckedField | null {
  const field = text(form, "zurueck");
  return isCheckedField(field) ? field : null;
}

/** Back to the list of findings, with the filter it was opened with. */
function backToFields(filter: CheckedField | null, said: Record<string, string> = {}): never {
  revalidatePath("/", "layout");
  const query = new URLSearchParams({ ...(filter ? { feld: filter } : {}), ...said }).toString();
  redirect(`/import/pruefen/angaben${query ? `?${query}` : ""}`);
}

/** A whole number from a form within limits, null when empty, undefined when not valid. */
function count(value: string, least: number, most: number): number | null | undefined {
  if (value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= least && number <= most ? number : undefined;
}

/** The value a form sets a field to, or null when it is not valid. */
function readValue(form: FormData, field: CheckedField): FieldValue | null {
  const value = text(form, "wert");
  if (field === "protein") {
    if (value === "") return { field, protein: null };
    return isProtein(value) ? { field, protein: value } : null;
  }
  if (field === "category") return { field, category: value === "" ? null : value };
  if (field === "time") {
    const effort = text(form, "aufwand");
    if (effort !== "" && !isEffort(effort)) return null;
    const minutes = form.has("minuten") ? count(text(form, "minuten"), 1, 24 * 60) : undefined;
    if (form.has("minuten") && minutes === undefined) return null;
    return { field, minutes, effort: effort === "" ? null : effort };
  }
  const min = count(text(form, "von"), 1, 500);
  const max = count(text(form, "bis") || text(form, "von"), 1, 500);
  const unit = text(form, "einheit").slice(0, 60);
  if (typeof min !== "number" || typeof max !== "number" || max < min) return null;
  return { field, servings: { min, max, unit: unit === "" ? null : unit } };
}

/** Sets one field of one recipe as the household chose it, or as the check suggested. */
export async function correctField(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const filter = filterOf(form);
  const id = text(form, "rezept");
  const field = text(form, "feld");
  if (!recipeId.safeParse(id).success || !isCheckedField(field)) backToFields(filter);
  const value = readValue(form, field);
  if (!value) backToFields(filter, { fehler: id });
  await setField(await createSessionClient(), household.id, [id], value);
  backToFields(filter);
}

/** The field is right as it is: it is not shown again. */
export async function confirmField(form: FormData): Promise<void> {
  await requireHousehold();
  const filter = filterOf(form);
  const id = text(form, "rezept");
  const field = text(form, "feld");
  if (recipeId.safeParse(id).success && isCheckedField(field)) {
    await markChecked(await createSessionClient(), [{ recipeId: id, fields: [field] }]);
  }
  backToFields(filter);
}

/**
 * One decision for several recipes: the ticked ones, or all that are shown. The findings are
 * worked out again here, so that only what is still flagged is changed.
 */
export async function correctSeveral(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const filter = filterOf(form);
  const chosen = new Set(
    text(form, "wen") === "alle" ? ids(form, "angezeigt") : ids(form, "rezept"),
  );
  if (chosen.size === 0) backToFields(filter, { fehler: "auswahl" });
  const db = await createSessionClient();
  const library = await loadLibraryChecks(db);
  const checks = recipeChecks(library).filter((check) => chosen.has(check.recipe.id));
  const action = text(form, "aktion");
  const [kind, value = ""] = action.split(":");
  const recipes = checks.map((check) => check.recipe.id);
  if (kind === "vorschlag") {
    await takeSuggestions(db, household.id, checks, filter);
  } else if (kind === "geprueft") {
    await markChecked(
      db,
      checks.map((check) => ({
        recipeId: check.recipe.id,
        fields: check.findings
          .map((finding) => finding.field)
          .filter((field) => !filter || field === filter),
      })),
    );
  } else if (kind === "art" && isProtein(value)) {
    await setField(db, household.id, recipes, { field: "protein", protein: value });
  } else if (kind === "kategorie" && library.categories.some((c) => c.key === value)) {
    await setField(db, household.id, recipes, { field: "category", category: value });
  } else if (kind === "aufwand" && isEffort(value)) {
    await setField(db, household.id, recipes, { field: "time", effort: value });
  }
  backToFields(filter);
}

/** Back to the duplicates. */
function backToDuplicates(): never {
  revalidatePath("/", "layout");
  redirect("/import/pruefen/doppelt");
}

/** Two recipes that look alike are both kept: the pair is not shown again. */
export async function keepBothRecipes(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const [one, other] = [text(form, "a"), text(form, "b")];
  if (recipeId.safeParse(one).success && recipeId.safeParse(other).success && one !== other) {
    await keepBoth(await createSessionClient(), household.id, one, other);
  }
  backToDuplicates();
}

/**
 * Merges a duplicate into the recipe that is kept and deletes the duplicate. Only the form
 * of the confirmation step sends this, after the page said which recipe goes.
 */
export async function mergeDuplicate(form: FormData): Promise<void> {
  await requireHousehold();
  const [keep, drop] = [text(form, "behalten"), text(form, "weg")];
  if (
    text(form, "bestaetigt") === "ja" &&
    recipeId.safeParse(keep).success &&
    recipeId.safeParse(drop).success &&
    keep !== drop
  ) {
    await mergeRecipes(await createSessionClient(), keep, drop);
  }
  backToDuplicates();
}

/**
 * Steps compared with the photo: stored as they stand in the field, corrected or not, and no
 * longer shown among the steps to check. A field left empty means the recipe has none.
 */
export async function confirmSteps(form: FormData): Promise<void> {
  await requireHousehold();
  const id = text(form, "rezept");
  if (!recipeId.safeParse(id).success) redirect("/import/pruefen/schritte");
  const steps = readTypedSteps(String(form.get("schritte") ?? ""));
  if (!steps.ok) {
    redirect(`/import/pruefen/schritte?fehler=${id}#r-${id}`);
  }
  await saveCheckedSteps(await createSessionClient(), id, steps.steps ?? []);
  revalidatePath("/", "layout");
  redirect("/import/pruefen/schritte");
}
