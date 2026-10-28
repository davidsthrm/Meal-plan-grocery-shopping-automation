import type { Metadata } from "next";
import { SWAP } from "@/lib/transitions";
import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { PastedRecipeForm } from "@/components/pasted-recipe-form";
import { TypedRecipeForm } from "@/components/typed-recipe-form";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Neues Rezept" };

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * A recipe without a photo: typed in by hand, one ingredient per line, or pasted as text and
 * read from it.
 */
export default async function NewRecipePage(props: PageProps<"/rezepte/neu">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const { categories } = await loadLibrary(await createSessionClient());
  // Started from a meal of the week plan: the new recipe goes there.
  const meal = { w: one(params.w), d: one(params.d), m: one(params.m) };
  const forMeal = meal.w !== "" && meal.d !== "" && meal.m !== "";
  const pasting = one(params.art) === "text";
  const title = one(params.titel).slice(0, 120);
  const way = (art: string) =>
    `/rezepte/neu?${new URLSearchParams({
      ...(art ? { art } : {}),
      ...(title ? { titel: title } : {}),
      ...(forMeal ? meal : {}),
    })}`;
  const submitLabel = forMeal ? "Speichern und einplanen" : "Speichern";

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={forMeal ? `/woche?w=${meal.w}#tag-${meal.d}` : "/rezepte"}>
        {forMeal ? "Wochenplan" : "Entdecken"}
      </BackLink>
      <h1 className="title mt-3">Neues Rezept</h1>

      <nav
        aria-label="Wie das Rezept hereinkommt"
        className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <span className="segmented">
          <Link
            href={way("")}
            transitionTypes={[SWAP]}
            className="segment"
            aria-current={pasting ? undefined : "page"}
          >
            Eintippen
          </Link>
          <Link
            href={way("text")}
            transitionTypes={[SWAP]}
            className="segment"
            aria-current={pasting ? "page" : undefined}
          >
            Text einfügen
          </Link>
        </span>
        <Link
          href={`/rezepte/hinzufuegen?${new URLSearchParams(forMeal ? { d: meal.d, m: meal.m } : {})}`}
          className="link inline-flex min-h-11 items-center"
        >
          Seite fotografieren
        </Link>
      </nav>

      {pasting ? (
        <>
          <p className="mt-4 mb-5 text-muted">
            Ein Rezept von einer Webseite oder aus einer Nachricht kopieren und hier einfügen.
            Zutaten und Mengen werden herausgelesen; du siehst sie, bevor etwas gespeichert wird.
          </p>
          <PastedRecipeForm
            categories={categories}
            extra={forMeal ? meal : {}}
            submitLabel={submitLabel}
            again={way("text")}
          />
        </>
      ) : (
        <>
          <p className="mt-4 mb-5 text-muted">
            Zutaten so schreiben wie auf einem Einkaufszettel: Menge, Einheit, Zutat. Die Menge kann
            fehlen.
          </p>
          <TypedRecipeForm
            initial={{
              title,
              category: "",
              protein: "",
              servings: String(household.defaultServings),
              servingsUnit: "",
              minutes: "",
              book: "",
              page: "",
              lines: "",
              steps: "",
            }}
            categories={categories}
            extra={forMeal ? meal : {}}
            submitLabel={submitLabel}
          />
        </>
      )}
    </div>
  );
}
