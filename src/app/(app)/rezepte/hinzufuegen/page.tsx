import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { AddRecipe } from "@/components/add-recipe";
import { NeedsConnection } from "@/components/connection";
import { isIsoDate, mondayOf, weekdayLong } from "@/domain/dates";
import { MEAL_NAME } from "@/lib/plan-text";
import { loadWeek } from "@/server/planning/week";
import { loadSources } from "@/server/sources";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezept hinzufügen" };

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Adding a recipe, from the Import tab or from a meal planned as text: a photo of the page,
 * pasted text, or typed in. Started from a meal, the recipe goes there once it is read.
 */
export default async function AddRecipePage(props: PageProps<"/rezepte/hinzufuegen">) {
  const params = await props.searchParams;
  const db = await createSessionClient();
  const date = one(params.d);
  const meal = (["lunch", "dinner", "coffee"] as const).find((name) => name === one(params.m));
  const [sources, week] = await Promise.all([
    loadSources(db),
    isIsoDate(date) && meal ? loadWeek(db, mondayOf(date)) : Promise.resolve([]),
  ]);
  const slot = week.find((entry) => entry.date === date && entry.meal === meal);
  // Only a meal that is still text waits for a recipe.
  const forMeal =
    slot?.kind === "free_text" && meal
      ? {
          date,
          meal,
          week: mondayOf(date),
          when: `${weekdayLong(date)} ${MEAL_NAME[meal]}`,
          label: slot.label,
        }
      : null;
  const extra: Record<string, string> = forMeal
    ? { titel: forMeal.label, w: forMeal.week, d: forMeal.date, m: forMeal.meal }
    : {};
  const typeHref = `/rezepte/neu?${new URLSearchParams(extra)}`;
  const textHref = `/rezepte/neu?${new URLSearchParams({ art: "text", ...extra })}`;

  return (
    <div className="mx-auto max-w-3xl">
      <NeedsConnection>Ein Rezept hinzufügen geht nur mit Verbindung.</NeedsConnection>
      <BackLink href={forMeal ? `/woche?w=${forMeal.week}#tag-${forMeal.date}` : "/import"}>
        {forMeal ? "Wochenplan" : "Import"}
      </BackLink>
      {forMeal && <p className="eyebrow mt-1">Für {forMeal.when}</p>}
      <h1 className="title mt-1">{forMeal ? forMeal.label : "Rezept hinzufügen"}</h1>
      {forMeal && <p className="mt-2 text-muted">Noch kein Rezept dazu. Wie kommt es herein?</p>}
      <AddRecipe
        sources={sources}
        forMeal={forMeal && { date, meal: forMeal.meal, week: forMeal.week, when: forMeal.when }}
        textHref={textHref}
        typeHref={typeHref}
      />
    </div>
  );
}
