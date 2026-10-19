import { daysBetween, type IsoDate } from "../dates";
import { rank } from "../rank";
import { DIETS, matchesFilter, NO_FILTER, type Diet, type RecipeFilter } from "./filter";
import { isMeal, type Category, type History, type RecipeSummary } from "./summary";
import type { TagGroup } from "./tags";

/**
 * The library to browse. On top a few shelves that change with the day: what is quick, what is
 * in season, what was cooked long ago, what is new. Below them a directory: every way the
 * library can be narrowed down, with the number of recipes behind it.
 */

export interface Shelf {
  key: string;
  title: string;
  /** The filter that lists the whole shelf. Null for a shelf no filter can express. */
  filter: RecipeFilter | null;
  /** How many recipes the shelf stands for: as many as its filter lists, where it has one. */
  total: number;
  /** The first few that nobody has marked yet. */
  recipes: RecipeSummary[];
}

export interface DiscoverOptions {
  today: IsoDate;
  history: History;
  /** How many recipes a shelf shows. */
  size?: number;
}

/** After this many days without it, a dish the household knows is worth bringing up again. */
export const LONG_AGO_DAYS = 56;
/** For this long a recipe counts as new. */
const NEW_DAYS = 14;
const QUICK_MINUTES = 20;

export const SEASONS = ["fruehling", "sommer", "herbst", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** The season a day belongs to, by the calendar: spring starts in March. */
export function seasonOf(date: IsoDate): Season {
  const month = Number(date.slice(5, 7));
  if (month >= 3 && month <= 5) return "fruehling";
  if (month >= 6 && month <= 8) return "sommer";
  return month >= 9 && month <= 11 ? "herbst" : "winter";
}

const SEASON_SHELF: Record<Season, string> = {
  fruehling: "Jetzt im Frühling",
  sommer: "Jetzt im Sommer",
  herbst: "Jetzt im Herbst",
  winter: "Jetzt im Winter",
};

/**
 * Whether the household has marked a recipe: a favourite, or one someone wants to cook. Those
 * have the page "Favoriten"; the shelves bring up the others.
 */
export function isMarked(recipe: RecipeSummary): boolean {
  return recipe.isFavorite || recipe.wanted;
}

/**
 * What "Entdecken" offers of the library for a filter: the recipes nobody has marked yet, on
 * the shelves, in the directory and in every list a filter or a tile of it makes. The marked
 * ones have "Favoriten". Words typed into the search find every recipe, so that a favourite
 * is found by its name.
 */
export function toDiscover(
  recipes: readonly RecipeSummary[],
  filter: RecipeFilter,
): RecipeSummary[] {
  if (filter.text.trim() !== "") return [...recipes];
  return recipes.filter((recipe) => !isMarked(recipe));
}

/** The shelves on top of the library, without the empty ones. */
export function discover(recipes: readonly RecipeSummary[], options: DiscoverOptions): Shelf[] {
  const { today, history } = options;
  const size = options.size ?? 10;

  // The order changes from day to day, so that browsing shows more than the same ten recipes
  // of a shelf with four hundred.
  const order = (a: RecipeSummary, b: RecipeSummary) => rank(today, a.id) - rank(today, b.id);
  const shelf = (
    key: string,
    title: string,
    members: RecipeSummary[],
    filter: RecipeFilter | null,
    sort = order,
  ): Shelf => {
    const unmarked = members.filter((recipe) => !isMarked(recipe));
    return {
      key,
      title,
      filter,
      total: filter ? members.length : unmarked.length,
      recipes: unmarked.sort(sort).slice(0, size),
    };
  };
  const filtered = (key: string, title: string, filter: RecipeFilter) =>
    shelf(
      key,
      title,
      recipes.filter((recipe) => matchesFilter(recipe, filter)),
      filter,
    );

  const lastCooked = (recipe: RecipeSummary) => history.get(recipe.id) ?? null;
  const longAgo = recipes.filter((recipe) => {
    const last = lastCooked(recipe);
    return last !== null && daysBetween(last, today) >= LONG_AGO_DAYS;
  });
  const fresh = recipes.filter((recipe) => daysBetween(recipe.addedOn, today) <= NEW_DAYS);
  const season = seasonOf(today);

  const shelves: Shelf[] = [
    shelf(
      "schnell",
      `Bis ${QUICK_MINUTES} Minuten`,
      recipes.filter(
        (recipe) =>
          isMeal(recipe) && recipe.prepMinutes !== null && recipe.prepMinutes <= QUICK_MINUTES,
      ),
      null,
    ),
    filtered("saison", SEASON_SHELF[season], { ...NO_FILTER, tags: [season] }),
    // Longest ago first.
    shelf("lange-nicht", "Lange nicht gekocht", longAgo, null, (a, b) =>
      (lastCooked(a) as IsoDate).localeCompare(lastCooked(b) as IsoDate),
    ),
  ];
  // Right after a cookbook was photographed, everything is new, and a shelf saying so says
  // nothing. It appears once new recipes are the exception.
  if (fresh.length * 3 < recipes.length) {
    shelves.push(shelf("neu", "Neu", fresh, null, (a, b) => b.addedOn.localeCompare(a.addedOn)));
  }
  return shelves.filter((entry) => entry.recipes.length > 0);
}

/** One way to narrow the library down, and how many recipes it leaves. */
export interface DirectoryEntry {
  key: string;
  label: string;
  count: number;
  filter: RecipeFilter;
}

export interface DirectorySection {
  title: string;
  entries: DirectoryEntry[];
}

export interface DirectoryOptions {
  /** The household's categories, in their order. */
  categories: readonly Category[];
  tagGroups: readonly TagGroup[];
  books: readonly string[];
}

const DIET_LABEL: Record<Diet, string> = {
  vegetarisch: "Vegetarisch",
  vegan: "Vegan",
  fisch: "Fisch",
  gefluegel: "Geflügel",
  fleisch: "Fleisch",
};

/**
 * The library as a directory: by category, by each group of tags, by diet and by cookbook.
 * Entries nothing is behind are left out, and so are sections without an entry.
 */
export function directory(
  recipes: readonly RecipeSummary[],
  options: DirectoryOptions,
): DirectorySection[] {
  const entry = (key: string, label: string, filter: RecipeFilter): DirectoryEntry => ({
    key,
    label,
    filter,
    count: recipes.filter((recipe) => matchesFilter(recipe, filter)).length,
  });
  const sections: DirectorySection[] = [
    {
      title: "Art",
      entries: options.categories.map((category) =>
        entry(`kategorie-${category.key}`, category.name, { ...NO_FILTER, category: category.key }),
      ),
    },
    ...options.tagGroups.map((group) => ({
      title: group.name,
      entries: group.tags.map((tag) =>
        entry(`tag-${tag.ref}`, tag.name, { ...NO_FILTER, tags: [tag.ref] }),
      ),
    })),
    {
      title: "Ernährung",
      entries: DIETS.map((diet) => entry(`kost-${diet}`, DIET_LABEL[diet], { ...NO_FILTER, diet })),
    },
    {
      title: "Kochbuch",
      entries: options.books.map((book) => entry(`buch-${book}`, book, { ...NO_FILTER, book })),
    },
  ];
  return sections
    .map((section) => ({ ...section, entries: section.entries.filter((e) => e.count > 0) }))
    .filter((section) => section.entries.length > 0);
}

export interface CategoryGroup {
  /** Key of the category. Null for recipes without one. */
  key: string | null;
  name: string;
  recipes: RecipeSummary[];
}

/**
 * Recipes sorted into their categories, in the household's order, each group by title.
 * Recipes without a category come last. Empty groups are left out.
 */
export function byCategory(
  recipes: readonly RecipeSummary[],
  categories: readonly Category[],
): CategoryGroup[] {
  const known = new Set(categories.map((category) => category.key));
  const sorted = (members: RecipeSummary[]) =>
    members.sort((a, b) => a.title.localeCompare(b.title, "de"));
  const groups: CategoryGroup[] = [
    ...categories.map((category) => ({
      key: category.key,
      name: category.name,
      recipes: sorted(recipes.filter((recipe) => recipe.category === category.key)),
    })),
    {
      key: null,
      name: "Ohne Art",
      recipes: sorted(
        recipes.filter((recipe) => recipe.category === null || !known.has(recipe.category)),
      ),
    },
  ];
  return groups.filter((group) => group.recipes.length > 0);
}
