import type { Metadata } from "next";
import Link from "next/link";
import { PictogramIcon } from "@/components/pictogram";
import { RecipeCard } from "@/components/recipe-card";
import { RecipeFilterBar } from "@/components/recipe-filter";
import { directory, discover } from "@/domain/library/discover";
import { byFavoriteThenTitle, filterParams, isNoFilter, readFilter } from "@/domain/library/filter";
import { pictogramFor } from "@/domain/library/pictogram";
import { today } from "@/lib/today";
import { loadLibrary, searchLibrary } from "@/server/library";
import { loadHistory } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Entdecken" };

/** How many results are shown at first, and how many more each time. */
const STEP = 60;
/** How many recipes that fit only part of a search are offered below the results. */
const RELATED = 12;
/** A library this small is shown whole, below its shelves. */
const SMALL = 30;

export default async function DiscoverPage(props: PageProps<"/rezepte">) {
  const params = await props.searchParams;
  const filter = readFilter(params);
  const shown = Math.max(STEP, Number(params.n) || STEP);
  const db = await createSessionClient();
  const [library, waitingRows] = await Promise.all([
    loadLibrary(db),
    db.from("recipe").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
  ]);
  const { recipes, categories, books, tagGroups } = library;
  const waiting = waitingRows.count ?? 0;
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);

  const browsing = isNoFilter(filter);
  const shelves = browsing
    ? discover(recipes, { today: today(), history: await loadHistory(db, today()) })
    : [];
  const sections = browsing ? directory(recipes, { categories, tagGroups, books }) : [];
  const found = browsing ? null : await searchLibrary(db, library, filter);
  const results = found?.matches ?? [];
  const related = (found?.related ?? []).slice(0, RELATED);
  const link = (extra: Record<string, string>) =>
    `/rezepte?${new URLSearchParams({ ...filterParams(filter), ...extra })}`;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">
            {recipes.length === 1 ? "1 Rezept" : `${recipes.length} Rezepte`} im Kochbuch
          </p>
          <h1 className="title mt-1">Entdecken</h1>
        </div>
        <Link href="/rezepte/neu" className="btn btn-small">
          Rezept hinzufügen
        </Link>
      </div>

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
          <RecipeFilterBar
            path="/rezepte"
            filter={filter}
            categories={categories}
            books={books}
            tagGroups={tagGroups}
          />
        </div>
      )}

      {shelves.map((shelf) => (
        <section key={shelf.key} className="mt-7" aria-label={shelf.title}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">{shelf.title}</h2>
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

      {browsing && recipes.length > 0 && recipes.length <= SMALL && (
        <section className="mt-7" aria-label="Alle Rezepte">
          <h2 className="text-xl font-bold tracking-tight">Alle Rezepte</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...recipes].sort(byFavoriteThenTitle).map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} category={nameOf(recipe.category)} />
            ))}
          </div>
        </section>
      )}

      {sections.length > 0 && (
        <section className="mt-10" aria-label="Stöbern">
          <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight">Stöbern</h2>
          {sections.map((section) => (
            <section key={section.title} className="mt-5" aria-label={section.title}>
              <h3 className="eyebrow">{section.title}</h3>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {section.entries.map((entry) => {
                  // A category and a kind of dish have a picture; a season or a cookbook has none.
                  const picture = pictogramFor({
                    title: "",
                    category: entry.filter.category,
                    proteinType: null,
                    tags: entry.filter.tags,
                  });
                  return (
                    <li key={entry.key}>
                      <Link
                        href={`/rezepte?${new URLSearchParams(filterParams(entry.filter))}`}
                        className="card lift flex min-h-14 items-center gap-2.5 px-3 py-2"
                      >
                        {(picture !== "teller" || section.title === "Art") && (
                          <span className="badge h-9 w-9">
                            <PictogramIcon name={picture} className="h-[68%] w-[68%]" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 leading-tight font-semibold">
                          {entry.label}
                        </span>
                        <span className="text-sm text-muted tabular-nums">{entry.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </section>
      )}

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

      {related.length > 0 && (
        <section className="mt-8" aria-label="Ähnliche Rezepte">
          <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight">
            Ähnliche Rezepte
          </h2>
          <p className="mt-2 text-sm text-muted">Passen zu einem Teil der Suche.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {related.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} category={nameOf(recipe.category)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
