import "server-only";
import type { IsoDate } from "@/domain/dates";
import { withHistory } from "@/domain/library/discover";
import { activeFilters, facets, type FacetGroup, type FacetOptions } from "@/domain/library/facets";
import {
  filterRecipes,
  matchesFilter,
  NO_FILTER,
  type RecipeFilter,
} from "@/domain/library/filter";
import type { RecipeSummary } from "@/domain/library/summary";
import { monthOf, type Month } from "@/domain/season/calendar";
import type { Db } from "./catalog";
import { loadLibrary, searchLibrary, type Library } from "./library";
import { loadHistory } from "./planning/week";
import { loadSeasonalFoods, withSeason } from "./season";

/**
 * What every page that lists recipes does with its filter, the same way everywhere:
 * Entdecken, Favoriten, the Regal and the chooser of a meal.
 */

/**
 * The library with what the filters "Passt zur Saison" and "Lange nicht gekocht" need: how
 * each recipe fits this month, and whether it was cooked long ago. Read side by side.
 */
export async function loadLibraryForLists(
  db: Db,
  today: IsoDate,
  /** The month "Passt zur Saison" asks about: today's, or that of a week being planned. */
  month: Month = monthOf(today),
): Promise<Library & { history: Map<string, IsoDate> }> {
  const [library, history, seasonal] = await Promise.all([
    loadLibrary(db),
    loadHistory(db, today),
    loadSeasonalFoods(db),
  ]);
  const recipes = withHistory(withSeason(library.recipes, seasonal, month), history, today);
  return { ...library, recipes, history };
}

export interface RecipeList {
  /** What the words searched leave of the page's recipes: what the panel counts. */
  base: RecipeSummary[];
  /** What fits the whole filter: by fit when words were searched, else favourites and title. */
  results: RecipeSummary[];
  /** What fits only some of the words, and the rest of the filter. */
  related: RecipeSummary[];
  /** The panel's groups, with how many recipes each choice leaves. */
  groups: FacetGroup[];
  /**
   * Where nothing fits: per filter that is on, how many recipes there are without it, the
   * most first. The way out of an empty list.
   */
  relax: { key: string; label: string; count: number; without: RecipeFilter }[];
}

/**
 * Searches and filters the recipes a page offers. The words are searched once; the other
 * choices narrow down what they found, so that every choice can say how many it leaves.
 */
export async function listRecipes(
  db: Db,
  library: Library,
  pool: readonly RecipeSummary[],
  filter: RecipeFilter,
  options: Omit<FacetOptions, "categories" | "tagGroups" | "books" | "editions">,
): Promise<RecipeList> {
  const words = filter.text.trim();
  const found = words
    ? await searchLibrary(db, { ...library, recipes: [...pool] }, { ...NO_FILTER, text: words })
    : null;
  const base = found ? found.matches : [...pool];
  const results = found
    ? base.filter((recipe) => matchesFilter(recipe, filter))
    : filterRecipes(base, filter);
  const related = found ? found.related.filter((recipe) => matchesFilter(recipe, filter)) : [];
  const editions = library.sources.find((source) => source.book === filter.book)?.editions ?? [];
  const groups = facets(base, filter, {
    categories: library.categories,
    tagGroups: library.tagGroups,
    books: library.books,
    editions,
    ...options,
  });
  const relax =
    results.length > 0
      ? []
      : activeFilters(groups)
          .map((entry) => ({
            ...entry,
            count: base.filter((recipe) => matchesFilter(recipe, entry.without)).length,
          }))
          .filter((entry) => entry.count > 0)
          .sort((a, b) => b.count - a.count);
  return { base, results, related, groups, relax };
}
