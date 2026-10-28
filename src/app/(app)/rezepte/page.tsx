import type { Metadata } from "next";
import { ListMemory } from "@/components/list-return";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PictogramIcon } from "@/components/pictogram";
import {
  CategoryTabsNav,
  ChipRow,
  FeaturedRecipe,
  FeatureTile,
  ShelfRow,
  ThemeRow,
} from "@/components/discover";
import { DiceIcon, StackIcon } from "@/components/icons";
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
import {
  categoryTabs,
  discover,
  recipeOfTheDay,
  tagChips,
  themes,
  toDiscover,
  type Shelf,
} from "@/domain/library/discover";
import { isMeal } from "@/domain/library/summary";
import { fromDiscover } from "@/lib/origin";
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
/** The tags the recipe of the day shows: what it is made of and for, not its effort. */
const FEATURED_GROUPS = new Set(["Hauptzutat", "Gericht", "Küche", "Anlass", "Eigene"]);

/**
 * Where a shelf's "Alle anzeigen" leads: its filter, inside the category of the tab it stands
 * on, or "Alle Rezepte" by what is new.
 */
function shelfHref(shelf: Shelf, category: string | null): string | null {
  if (shelf.filter)
    return filterHref(PATH, { ...shelf.filter, category: shelf.filter.category ?? category });
  return shelf.key === "neu" ? "/import/rezepte?sortierung=neu&richtung=ab" : null;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

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
  const { recipes, categories, tagGroups } = library;
  const waiting = waitingRows.count ?? 0;
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);

  const browsing = isNoFilter(filter);
  // Favourites and wishes are on "Favoriten": only a search by words finds them here.
  const offered = toDiscover(recipes, filter);
  const list = await listRecipes(db, library, offered, filter, { season: true, longAgo: true });
  const favorites = recipes.filter((recipe) => recipe.isFavorite);
  // A category's tab is a page of its own inside the category; "Für euch" is the whole library.
  const tabs = browsing ? categoryTabs(offered, categories) : [];
  const tab = tabs.find((entry) => entry.key === one(params.art)) ?? null;
  const pool = tab ? offered.filter((recipe) => recipe.category === tab.key) : offered;
  const from = fromDiscover(tab?.key ?? null);
  const shelves = browsing
    ? discover(pool, { today: now, history: library.history, tagGroups, favorites })
    : [];
  const featured = browsing ? recipeOfTheDay(pool, { today: now, history: library.history }) : null;
  const ideas = browsing && !tab ? themes(offered, now) : [];
  const groupNamed = (name: string) => tagGroups.find((group) => group.name === name);
  const inTab = (tag: string) =>
    filterHref(PATH, { ...NO_FILTER, category: tab?.key ?? null, tags: [tag] });
  const neverCooked = offered.filter(
    (recipe) => isMeal(recipe) && !library.history.has(recipe.id),
  ).length;
  // While browsing the page has the whole width; the filters are a sheet, as on a phone.
  const layout = browsing ? "sheet" : "aside";
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
      {/* The switch below says which view is open: the same word as a large title above it
          only took the first screen. */}
      <h1 className="sr-only">Entdecken</h1>
      <div className="mt-2">
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
            layout={layout}
            panel={
              <FilterPanel
                layout={layout}
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
              layout={layout}
              chips={activeChips(list.groups, href)}
              reset={reset}
            />

            {browsing && <CategoryTabsNav tabs={tabs} current={tab?.key ?? null} />}

            {featured && (
              <div className="mt-4">
                <FeaturedRecipe
                  featured={featured}
                  category={nameOf(featured.recipe.category)}
                  from={from}
                  tags={tagGroups
                    .filter((group) => FEATURED_GROUPS.has(group.name))
                    .flatMap((group) => group.tags)
                    .filter((tag) => featured.recipe.tags.includes(tag.ref))
                    .slice(0, 4)
                    .map((tag) => tag.name)}
                />
              </div>
            )}

            {browsing && !tab && (
              // What there is to do besides browsing, one row: four on an iPad, sideways on a phone.
              <nav aria-label="Mehr entdecken" className="feature-row mt-3">
                {harvest.length > 0 && (
                  <FeatureTile
                    href="/rezepte/saison"
                    tone="kind-vegetarian"
                    picture={
                      <PictogramIcon
                        name={pictogramForFilter({ ...NO_FILTER, tags: [seasonTagOf(month)] })}
                        className="h-[68%] w-[68%]"
                      />
                    }
                    title={`Saison im ${MONTH_NAME[month]}`}
                    text={harvest.join(", ")}
                  />
                )}
                <FeatureTile
                  href="/rezepte/stapel"
                  tone="tone-stack"
                  picture={<StackIcon />}
                  title="Rezept-Stapel"
                  text={`${neverCooked} noch nie gekocht, zum Durchwischen`}
                />
                <FeatureTile
                  href="/rezepte/zutaten"
                  tone="tone-fridge"
                  picture={<PictogramIcon name="korb" className="h-[68%] w-[68%]" />}
                  title="Was ist noch da?"
                  text="Zutaten antippen, Rezepte finden"
                />
                <FeatureTile
                  href="/rezepte/roulette"
                  tone="tone-chance"
                  picture={<DiceIcon />}
                  title="Rezept-Roulette"
                  text="Zutat, Küche, Aufwand ausgelost"
                />
              </nav>
            )}

            {tab && (
              <>
                <ChipRow
                  title="Nach Hauptzutat"
                  chips={tagChips(pool, groupNamed("Hauptzutat"))}
                  href={inTab}
                />
                <ChipRow
                  title="Nach Küche"
                  chips={tagChips(pool, groupNamed("Küche"))}
                  href={inTab}
                />
              </>
            )}

            <ThemeRow themes={ideas} href={href} />

            {shelves.map((shelf) => (
              <ShelfRow
                key={shelf.key}
                shelf={shelf}
                all={shelfHref(shelf, tab?.key ?? null)}
                nameOf={nameOf}
                from={from}
              />
            ))}

            {browsing && recipes.length <= SMALL && (
              <section className="mt-7" aria-label="Alle Rezepte">
                <h2 className="shelf-title">Alle Rezepte</h2>
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
