import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RecipeRow } from "@/components/recipe-card";
import { RecipeFilterBar } from "@/components/recipe-filter";
import { SubmitButton } from "@/components/submit-button";
import { dayAndMonth, isIsoDate, mondayOf, weekdayLong, weekRange } from "@/domain/dates";
import { filterRecipes, isNoFilter, NO_FILTER, readFilter } from "@/domain/library/filter";
import type { RecipeSummary } from "@/domain/library/summary";
import type { Meal } from "@/domain/plan";
import { weekBalance } from "@/domain/recommend/balance";
import { suggest } from "@/domain/recommend/suggest";
import { MEAL_ADD, MEAL_PLAN, whyText } from "@/lib/plan-text";
import { requireHousehold } from "@/server/auth";
import { loadLibrary, searchLibrary } from "@/server/library";
import { loadExtras, loadHistory, loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { markSlot, planExtra, planRecipe } from "../actions";

export const metadata: Metadata = { title: "Mahlzeit planen" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** How many suggestions and how many results the page lists. */
const SUGGESTIONS = 8;
const RESULTS = 60;

/** Meals without a recipe that are one tap away. */
const WITHOUT_RECIPE = [
  { label: "Vesper", kind: "free_text" },
  { label: "Reste", kind: "leftovers" },
  { label: "Auswärts", kind: "away" },
  { label: "Fällt aus", kind: "skipped" },
] as const;

/**
 * Choosing a recipe for the week: for one of its meals, next to what a meal already has, or
 * for none of its meals. A meal can also be something without a recipe.
 */
export default async function ChoosePage(props: PageProps<"/woche/auswahl">) {
  const params = await props.searchParams;
  const week = one(params.w) ?? "";
  if (!isIsoDate(week) || mondayOf(week) !== week) notFound();

  // Where the choice goes: outside the meals, or to the meal at a day and time.
  const extra = one(params.ziel) === "extra";
  const date = one(params.d) ?? "";
  const meal = one(params.m) as Meal;
  const mode = one(params.modus) === "add" ? "add" : "replace";
  if (!extra) {
    if (!isIsoDate(date) || mondayOf(date) !== week) notFound();
    if (meal !== "lunch" && meal !== "dinner" && meal !== "coffee") notFound();
  }

  const filter = readFilter(params);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [library, slots, history, extras] = await Promise.all([
    loadLibrary(db),
    loadWeek(db, week),
    loadHistory(db, week),
    loadExtras(db, week),
  ]);
  const { recipes, categories, books } = library;
  const recipeOf = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (recipe: RecipeSummary) =>
    recipe.category ? (categoryName.get(recipe.category) ?? null) : null;

  const planned = new Set([
    ...slots.flatMap((slot) =>
      slot.kind === "recipes" ? slot.items.map((item) => item.recipeId) : [],
    ),
    ...extras.map((entry) => entry.recipeId),
  ]);
  const browsing = isNoFilter(filter);
  // The week without this meal: what is chosen here takes its place.
  const others = slots.filter((slot) => slot.date !== date || slot.meal !== meal);
  const suggestions =
    browsing && !extra && mode === "replace"
      ? suggest(
          recipes,
          meal,
          {
            balance: weekBalance(others, (id) => recipeOf.get(id), household.targets),
            planned,
            history,
            weekStart: week,
            seed: `${week}:${date}:${meal}`,
          },
          SUGGESTIONS,
        )
      : [];
  const favorites = browsing
    ? filterRecipes(recipes, { ...NO_FILTER, favorites: true }).filter(
        (recipe) => !planned.has(recipe.id),
      )
    : [];
  const found = browsing ? null : await searchLibrary(db, library, filter);
  const results = found?.matches ?? [];
  const related = (found?.related ?? []).slice(0, 8);

  const where = extra ? (
    <input type="hidden" name="week" value={week} />
  ) : (
    <>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <input type="hidden" name="mode" value={mode} />
    </>
  );
  const row = (recipe: RecipeSummary, note?: string) => (
    <RecipeRow key={recipe.id} recipe={recipe} category={nameOf(recipe)} note={note}>
      <form action={extra ? planExtra : planRecipe}>
        {where}
        <input type="hidden" name="recipe" value={recipe.id} />
        <SubmitButton className="btn btn-small" label={`${recipe.title} einplanen`}>
          Einplanen
        </SubmitButton>
      </form>
    </RecipeRow>
  );
  const list = (title: string, entries: ReactNode[]) =>
    entries.length > 0 && (
      <section className="mt-6" aria-label={title}>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <ul className="card mt-2 divide-y divide-line">{entries}</ul>
      </section>
    );
  const back = extra ? `/woche?w=${week}&t=extra` : `/woche?w=${week}#tag-${date}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={back} className="link text-sm">
        ← Wochenplan
      </Link>
      <p className="eyebrow mt-3">
        {extra ? weekRange(week) : `${weekdayLong(date)}, ${dayAndMonth(date)}`}
      </p>
      <h1 className="title mt-1">
        {extra ? "Außerdem einplanen" : mode === "add" ? MEAL_ADD[meal] : MEAL_PLAN[meal]}
      </h1>

      {!extra && mode === "replace" && (
        <section className="mt-5" aria-label="Ohne Rezept">
          <h2 className="eyebrow">Ohne Rezept</h2>
          {meal !== "coffee" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {WITHOUT_RECIPE.map((option) => (
                <form key={option.label} action={markSlot}>
                  {where}
                  <input type="hidden" name="kind" value={option.kind} />
                  <input type="hidden" name="label" value={option.label} />
                  <SubmitButton className="chip">{option.label}</SubmitButton>
                </form>
              ))}
            </div>
          )}
          <form action={markSlot} className="mt-2 flex gap-2">
            {where}
            <input type="hidden" name="kind" value="free_text" />
            <label className="flex-1">
              <span className="sr-only">Eigener Eintrag</span>
              <input
                name="label"
                maxLength={60}
                list="rezepttitel"
                autoComplete="off"
                className="field"
                placeholder={
                  meal === "coffee"
                    ? "Eigener Eintrag, z. B. Kuchen vom Bäcker"
                    : "Eigener Eintrag, z. B. Pestonudeln oder bei Oma"
                }
              />
            </label>
            <SubmitButton>Eintragen</SubmitButton>
          </form>
          {/* What is typed here and is the title of a recipe is planned as that recipe. */}
          <datalist id="rezepttitel">
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.title} />
            ))}
          </datalist>
        </section>
      )}

      <section className="mt-6" aria-label="Rezept suchen">
        <h2 className="eyebrow mb-2">Aus dem Kochbuch</h2>
        <RecipeFilterBar
          path="/woche/auswahl"
          filter={filter}
          categories={categories}
          books={books}
          keep={extra ? { w: week, ziel: "extra" } : { w: week, d: date, m: meal, modus: mode }}
        />
      </section>

      {list(
        "Vorschläge",
        suggestions.map((entry) => row(entry.recipe, whyText(entry.reasons) || undefined)),
      )}
      {list(
        "Favoriten",
        favorites.slice(0, 12).map((recipe) => row(recipe)),
      )}
      {!browsing && (
        <section className="mt-6" aria-label="Ergebnisse">
          <p className="text-muted" role="status">
            {results.length === 0
              ? "Kein Rezept passt dazu."
              : results.length === 1
                ? "1 Rezept passt dazu"
                : `${results.length} Rezepte passen dazu`}
            {results.length > RESULTS && `. Die ersten ${RESULTS} davon:`}
          </p>
          {results.length > 0 && (
            <ul className="card mt-2 divide-y divide-line">
              {results.slice(0, RESULTS).map((recipe) => row(recipe))}
            </ul>
          )}
        </section>
      )}
      {list(
        "Ähnliche Rezepte",
        related.map((recipe) => row(recipe)),
      )}
    </div>
  );
}
