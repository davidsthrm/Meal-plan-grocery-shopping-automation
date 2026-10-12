import type { Metadata } from "next";
import Link from "next/link";
import { TypedRecipeForm } from "@/components/typed-recipe-form";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Neues Rezept" };

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** A recipe typed in by hand: no photo, a title and one ingredient per line. */
export default async function NewRecipePage(props: PageProps<"/rezepte/neu">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const { categories } = await loadLibrary(await createSessionClient());
  // Started from a meal of the week plan: the new recipe goes there.
  const meal = { w: one(params.w), d: one(params.d), m: one(params.m) };
  const forMeal = meal.w !== "" && meal.d !== "" && meal.m !== "";

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={forMeal ? `/woche?w=${meal.w}#tag-${meal.d}` : "/rezepte"}
        className="link text-sm"
      >
        ← {forMeal ? "Wochenplan" : "Entdecken"}
      </Link>
      <h1 className="title mt-3">Neues Rezept</h1>
      <p className="mt-2 mb-5 text-muted">
        Zutaten so schreiben wie auf einem Einkaufszettel: Menge, Einheit, Zutat. Die Menge kann
        fehlen.
      </p>
      <TypedRecipeForm
        initial={{
          title: one(params.titel).slice(0, 120),
          category: "",
          protein: "",
          servings: String(household.defaultServings),
          servingsUnit: "",
          minutes: "",
          book: "",
          page: "",
          lines: "",
        }}
        categories={categories}
        extra={forMeal ? meal : {}}
        submitLabel={forMeal ? "Speichern und einplanen" : "Speichern"}
      />
    </div>
  );
}
