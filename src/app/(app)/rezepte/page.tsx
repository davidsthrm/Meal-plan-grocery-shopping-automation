import type { Metadata } from "next";
import Link from "next/link";
import { RecipeCard } from "@/components/recipe-card";
import { RecipeFilterBar } from "@/components/recipe-filter";
import { discover } from "@/domain/library/discover";
import { filterParams, filterRecipes, isNoFilter, readFilter } from "@/domain/library/filter";
import { today } from "@/lib/today";
import { loadLibrary, recipesWithIngredient } from "@/server/library";
import { loadHistory } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Entdecken" };

/** How many results are shown at first, and how many more each time. */
const STEP = 60;

export default async function DiscoverPage(props: PageProps<"/rezepte">) {
  const params = await props.searchParams;
  const filter = readFilter(params);
  const shown = Math.max(STEP, Number(params.n) || STEP);
  const db = await createSessionClient();
  const [library, waitingRows] = await Promise.all([
    loadLibrary(db),
    db.from("recipe").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
  ]);
  const { recipes, categories, books } = library;
  const waiting = waitingRows.count ?? 0;
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);

  const browsing = isNoFilter(filter);
  const groups = browsing
    ? discover(recipes, { today: today(), history: await loadHistory(db, today()), categories })
    : [];
  const results = browsing
    ? []
    : filterRecipes(
        recipes,
        filter,
        filter.text ? await recipesWithIngredient(db, filter.text) : undefined,
      );
  const link = (extra: Record<string, string>) =>
    `/rezepte?${new URLSearchParams({ ...filterParams(filter), ...extra })}`;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">
        {recipes.length === 1 ? "1 Rezept" : `${recipes.length} Rezepte`} im Kochbuch
      </p>
      <h1 className="title mt-1">Entdecken</h1>

      {waiting > 0 && (
        <Link
          href="/import/pruefen"
          className="mt-4 block rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn"
        >
          {waiting === 1 ? "1 Rezept wartet" : `${waiting} Rezepte warten`} auf deine Prüfung
        </Link>
      )}

      {recipes.length === 0 ? (
        <p className="mt-8 text-muted">
          Noch keine Rezepte. Unter{" "}
          <Link href="/import" className="link underline">
            Import
          </Link>{" "}
          kannst du Kochbuchseiten fotografieren und einlesen lassen.
        </p>
      ) : (
        <div className="mt-5">
          <RecipeFilterBar path="/rezepte" filter={filter} categories={categories} books={books} />
        </div>
      )}

      {groups.map((group) => (
        <section key={group.title} className="mt-8" aria-label={group.title}>
          <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight">
            {group.title}
          </h2>
          {group.shelves.map((shelf) => (
            <section key={shelf.key} className="mt-4" aria-label={shelf.title}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-semibold">{shelf.title}</h3>
                {shelf.filter && shelf.total > shelf.recipes.length ? (
                  <Link
                    href={`/rezepte?${new URLSearchParams(filterParams(shelf.filter))}`}
                    className="link shrink-0 text-sm"
                  >
                    Alle {shelf.total}
                  </Link>
                ) : (
                  <span className="shrink-0 text-sm text-muted">{shelf.total}</span>
                )}
              </div>
              <div className="shelf mt-2">
                {shelf.recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    category={nameOf(recipe.category)}
                    className="w-60"
                  />
                ))}
              </div>
            </section>
          ))}
        </section>
      ))}

      {!browsing && (
        <section className="mt-6" aria-label="Ergebnisse">
          <p className="text-muted" role="status">
            {results.length === 0
              ? "Kein Rezept passt dazu."
              : results.length === 1
                ? "1 Rezept passt dazu"
                : `${results.length} Rezepte passen dazu`}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.slice(0, shown).map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} category={nameOf(recipe.category)} />
            ))}
          </div>
          {results.length > shown && (
            <Link href={link({ n: String(shown + STEP) })} scroll={false} className="btn mt-4">
              Weitere anzeigen
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
