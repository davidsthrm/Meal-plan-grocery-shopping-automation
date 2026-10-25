import type { Metadata } from "next";
import { ListMemory } from "@/components/list-return";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PictogramIcon } from "@/components/pictogram";
import { RecipeCard } from "@/components/recipe-card";
import {
  activeChips,
  FilterBar,
  FilterLayout,
  FilterPanel,
  filterHref,
  panelGroups,
  WaysOut,
} from "@/components/recipe-filters";
import { RecipeViews } from "@/components/recipe-views";
import { directory, discover, toDiscover, type Shelf } from "@/domain/library/discover";
import {
  byFavoriteThenTitle,
  filterParams,
  isNoFilter,
  NO_FILTER,
  readFilter,
  type RecipeFilter,
} from "@/domain/library/filter";
import { pictogramForFilter } from "@/domain/library/pictogram";
import { monthInSeason, monthOf, MONTH_NAME, seasonTagOf } from "@/domain/season/calendar";
import { filterTone } from "@/lib/plan-text";
import { today } from "@/lib/today";
import { listRecipes, loadLibraryForLists } from "@/server/recipe-list";
import { CALENDAR } from "@/server/season";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Entdecken" };

/** How many results are shown at first, and how many more each time. */
const STEP = 60;
/** How many recipes that fit only part of a search are offered below the results. */
const RELATED = 12;
/** A library this small is shown whole, below its shelves. */
const SMALL = 30;
const PATH = "/rezepte";

/** Where a shelf's "Alle anzeigen" leads: its filter, or the Regal by what is new. */
function shelfHref(shelf: Shelf): string | null {
  if (shelf.filter) return filterHref(PATH, shelf.filter);
  return shelf.key === "neu" ? "/rezepte/regal?sortierung=neu&richtung=ab" : null;
}

export default async function DiscoverPage(props: PageProps<"/rezepte">) {
  const params = await props.searchParams;
  const filter = readFilter(params);
  // Favourites have a page of their own; an old link to them here leads there.
  if (filter.favorites) {
    redirect(`/favoriten?${new URLSearchParams(filterParams({ ...filter, favorites: false }))}`);
  }
  const shown = Math.max(STEP, Number(params.n) || STEP);
  const now = today();
  const month = monthOf(now);
  const db = await createSessionClient();
  const [library, waitingRows] = await Promise.all([
    loadLibraryForLists(db, now),
    db.from("recipe").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
  ]);
  const { recipes, categories, books, tagGroups } = library;
  const waiting = waitingRows.count ?? 0;
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);

  const browsing = isNoFilter(filter);
  // Favourites and wishes are on "Favoriten": only a search by words finds them here.
  const offered = toDiscover(recipes, filter);
  const list = await listRecipes(db, library, offered, filter, { season: true, longAgo: true });
  const shelves = browsing
    ? discover(offered, { today: now, history: library.history, tagGroups })
    : [];
  const sections = browsing ? directory(offered, { categories, tagGroups, books }) : [];
  const results = list.results;
  const related = list.related.slice(0, RELATED);
  const href = (next: RecipeFilter) => filterHref(PATH, next);
  const reset = isNoFilter({ ...filter, text: "" })
    ? null
    : href({ ...NO_FILTER, text: filter.text });
  const season = monthInSeason(CALENDAR, month);
  const harvest = [...season.arriving, ...season.ripe].slice(0, 6).map((food) => food.name);

  return (
    <div className="mx-auto max-w-5xl">
      <ListMemory />
      <p className="eyebrow">
        {recipes.length === 1 ? "1 Rezept" : `${recipes.length} Rezepte`} im Kochbuch
      </p>
      <h1 className="title mt-1">Entdecken</h1>
      <div className="mt-4">
        <RecipeViews current="entdecken" />
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
          <FilterLayout
            layout="aside"
            panel={
              <FilterPanel
                layout="aside"
                groups={panelGroups(list.groups, href)}
                total={results.length}
                reset={reset}
              />
            }
          >
            <FilterBar
              path={PATH}
              filter={filter}
              hidden={filterParams({ ...filter, text: "" })}
              layout="aside"
              chips={activeChips(list.groups, href)}
              reset={reset}
            />

            {browsing && harvest.length > 0 && (
              <Link
                href="/rezepte/saison"
                className="card lift kind-vegetarian mt-5 flex items-center gap-3 px-4 py-3"
              >
                <span className="badge h-11 w-11">
                  <PictogramIcon
                    name={pictogramForFilter({ ...NO_FILTER, tags: [seasonTagOf(month)] })}
                    className="h-[68%] w-[68%]"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    Was hat im {MONTH_NAME[month]} Saison?
                  </span>
                  <span className="block truncate text-sm text-muted">{harvest.join(", ")}</span>
                </span>
                <span aria-hidden className="text-accent">
                  →
                </span>
              </Link>
            )}

            {shelves.map((shelf) => {
              const all = shelfHref(shelf);
              return (
                <section key={shelf.key} className="mt-7" aria-label={shelf.title}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-xl font-bold tracking-tight">
                      {shelf.title}{" "}
                      <span className="text-base font-normal text-muted tabular-nums">
                        {shelf.total}
                      </span>
                    </h2>
                    {all && (
                      <Link
                        href={all}
                        className="link inline-flex min-h-11 shrink-0 items-center text-sm"
                      >
                        Alle anzeigen
                      </Link>
                    )}
                  </div>
                  <div className="shelf mt-1">
                    {shelf.recipes.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        category={nameOf(recipe.category)}
                        note={shelf.why?.[recipe.id]}
                        className="w-60"
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {browsing && recipes.length <= SMALL && (
              <section className="mt-7" aria-label="Alle Rezepte">
                <h2 className="text-xl font-bold tracking-tight">Alle Rezepte</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[...recipes].sort(byFavoriteThenTitle).map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      category={nameOf(recipe.category)}
                    />
                  ))}
                </div>
              </section>
            )}

            {sections.length > 0 && (
              <section className="mt-10" aria-label="Stöbern">
                <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight">
                  Stöbern
                </h2>
                {sections.map((section) => (
                  <section key={section.title} className="mt-5" aria-label={section.title}>
                    <h3 className="eyebrow">{section.title}</h3>
                    <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {section.entries.map((entry) => (
                        <li key={entry.key}>
                          <Link
                            href={href(entry.filter)}
                            className={`card lift flex h-full min-h-14 items-center gap-2.5 px-3 py-2 ${filterTone(entry.filter)}`}
                          >
                            <span className="badge h-9 w-9">
                              <PictogramIcon
                                name={pictogramForFilter(entry.filter)}
                                className="h-[68%] w-[68%]"
                              />
                            </span>
                            {/* A long name breaks at a syllable and takes two lines at most. */}
                            <span
                              className="line-clamp-2 min-w-0 flex-1 leading-tight font-semibold hyphens-auto"
                              title={entry.label}
                            >
                              {entry.label}
                            </span>
                            <span className="text-sm text-muted tabular-nums">{entry.count}</span>
                          </Link>
                        </li>
                      ))}
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
                {results.length === 0 && <WaysOut relax={list.relax} href={href} />}
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {results.slice(0, shown).map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      category={nameOf(recipe.category)}
                      note={
                        filter.season && recipe.season?.foods.length
                          ? `Mit ${recipe.season.foods.slice(0, 3).join(", ")}`
                          : undefined
                      }
                    />
                  ))}
                </div>
                {results.length > shown && (
                  <Link
                    href={`${PATH}?${new URLSearchParams({ ...filterParams(filter), n: String(shown + STEP) })}`}
                    scroll={false}
                    className="btn mt-4"
                  >
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
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {related.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      category={nameOf(recipe.category)}
                    />
                  ))}
                </div>
              </section>
            )}
          </FilterLayout>
        </div>
      )}
    </div>
  );
}
