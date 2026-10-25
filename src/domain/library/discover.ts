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
  /** The filter that lists the whole shelf ("Alle anzeigen"). Null where none can say it. */
  filter: RecipeFilter | null;
  /** How many recipes the shelf stands for: as many as its filter lists, where it has one. */
  total: number;
  /** The first few that nobody has marked yet. */
  recipes: RecipeSummary[];
  /** Per recipe, what puts it on this shelf, where that says more than the shelf's title. */
  why?: Record<string, string>;
}

export interface DiscoverOptions {
  today: IsoDate;
  history: History;
  /** The groups of tags, for the shelves of the tags used most. */
  tagGroups?: readonly TagGroup[];
  /** How many recipes a shelf shows. */
  size?: number;
}

/** After this many days without it, a dish the household knows is worth bringing up again. */
export const LONG_AGO_DAYS = 56;
/** For this long a recipe counts as new. */
const NEW_DAYS = 14;
const QUICK_MINUTES = 20;
/** How many shelves of tags there are, and from how many of the most used they are taken. */
const TAG_SHELVES = 3;
const TAG_CANDIDATES = 8;
/** A tag with fewer recipes makes no shelf. */
const TAG_SHELF_AT_LEAST = 4;
/** Groups whose tags make shelves: the effort and the season have shelves of their own. */
const SHELF_GROUPS = new Set(["Gericht", "Hauptzutat", "Küche", "Anlass", "Eigene"]);

export const SEASONS = ["fruehling", "sommer", "herbst", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** The season a day belongs to, by the calendar: spring starts in March. */
export function seasonOf(date: IsoDate): Season {
  const month = Number(date.slice(5, 7));
  if (month >= 3 && month <= 5) return "fruehling";
  if (month >= 6 && month <= 8) return "sommer";
  return month >= 9 && month <= 11 ? "herbst" : "winter";
}

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

/** The recipes with what the plans say of them: whether they were cooked long ago. */
export function withHistory(
  recipes: readonly RecipeSummary[],
  history: History,
  today: IsoDate,
): RecipeSummary[] {
  return recipes.map((recipe) => {
    const last = history.get(recipe.id);
    return { ...recipe, longAgo: last !== undefined && daysBetween(last, today) >= LONG_AGO_DAYS };
  });
}

/**
 * The shelves on top of the library, without the empty ones: what fits the season, what is
 * quick, what was cooked long ago, what is new, and a few of the tags used most. Each lists
 * a few recipes in an order that changes from day to day, and its filter lists all of it.
 */
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
  const filtered = (key: string, title: string, filter: RecipeFilter, sort = order) =>
    shelf(
      key,
      title,
      recipes.filter((recipe) => matchesFilter(recipe, filter)),
      filter,
      sort,
    );

  const lastCooked = (recipe: RecipeSummary) => history.get(recipe.id) ?? null;
  const fresh = recipes.filter((recipe) => daysBetween(recipe.addedOn, today) <= NEW_DAYS);

  // In season: what needs most of what is harvested now first.
  const season = filtered(
    "saison",
    "Passt zur Saison",
    { ...NO_FILTER, season: true },
    (a, b) => (b.season?.points ?? 0) - (a.season?.points ?? 0) || order(a, b),
  );
  season.why = Object.fromEntries(
    season.recipes.flatMap((recipe) =>
      recipe.season && recipe.season.foods.length > 0
        ? [[recipe.id, `Mit ${recipe.season.foods.slice(0, 3).join(", ")}`]]
        : [],
    ),
  );
  // Quick meals before a quick dip or drink.
  const quick = filtered(
    "schnell",
    `Schnell (bis ${QUICK_MINUTES} Min.)`,
    { ...NO_FILTER, maxMinutes: QUICK_MINUTES },
    (a, b) => Number(isMeal(b)) - Number(isMeal(a)) || order(a, b),
  );
  // Longest ago first.
  const longAgo = filtered(
    "lange-nicht",
    "Lange nicht gekocht",
    { ...NO_FILTER, longAgo: true },
    (a, b) => (lastCooked(a) ?? "").localeCompare(lastCooked(b) ?? ""),
  );

  const shelves: Shelf[] = [season, quick, longAgo];
  // Right after a cookbook was photographed, everything is new, and a shelf saying so says
  // nothing. It appears once new recipes are the exception.
  if (fresh.length * 3 < recipes.length) {
    shelves.push(
      shelf("neu", "Neu im Kochbuch", fresh, null, (a, b) => b.addedOn.localeCompare(a.addedOn)),
    );
  }
  shelves.push(...tagShelves(recipes, options, filtered));
  return shelves.filter((entry) => entry.recipes.length > 0);
}

/**
 * Shelves for a few of the tags used most: the most used ones, a different few each day,
 * shown most used first.
 */
function tagShelves(
  recipes: readonly RecipeSummary[],
  options: DiscoverOptions,
  filtered: (key: string, title: string, filter: RecipeFilter) => Shelf,
): Shelf[] {
  const used = (options.tagGroups ?? [])
    .filter((group) => SHELF_GROUPS.has(group.name))
    .flatMap((group) => group.tags)
    .map((tag) => ({
      tag,
      count: recipes.filter((recipe) => !isMarked(recipe) && recipe.tags.includes(tag.ref)).length,
    }))
    .filter((entry) => entry.count >= TAG_SHELF_AT_LEAST)
    .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name, "de"))
    .slice(0, TAG_CANDIDATES);
  const today = [...used]
    .sort((a, b) => rank(options.today, a.tag.ref) - rank(options.today, b.tag.ref))
    .slice(0, TAG_SHELVES);
  return used
    .filter((entry) => today.includes(entry))
    .map((entry) =>
      filtered(`tag-${entry.tag.ref}`, entry.tag.name, { ...NO_FILTER, tags: [entry.tag.ref] }),
    );
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

export const DIET_LABEL: Record<Diet, string> = {
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
