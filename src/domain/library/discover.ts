import { daysBetween, type IsoDate } from "../dates";
import { rank } from "../rank";
import { matchesFilter, NO_FILTER, type Diet, type RecipeFilter } from "./filter";
import type { Pictogram } from "./pictogram";
import { isMeal, type Category, type History, type RecipeSummary } from "./summary";
import type { TagGroup } from "./tags";

/**
 * The library to browse. On top a recipe of the day and a few shelves that change with the
 * day: what is in season, what is quick, what is like the favourites, what was cooked long
 * ago, a cookbook, what is new, what was never cooked; and a few themes to browse.
 */

/**
 * How a shelf shows its recipes: large cards, rows three to a column (more at a glance,
 * for what is picked quickly), or cards.
 */
export type ShelfLook = "large" | "list" | "card";

export interface Shelf {
  key: string;
  title: string;
  look: ShelfLook;
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
  /** The household's favourites: a shelf brings up what is like them. */
  favorites?: readonly RecipeSummary[];
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
/**
 * What makes a recipe like a favourite, and how much: the same main ingredient most, then the
 * same kind of dish, the same cuisine, and the same kind of meal (vegetarian, fish, …). It
 * takes `LIKE_AT_LEAST`: one shared cuisine made 211 of 278 recipes "like a favourite", and a
 * mushroom risotto like a mince gratin (October 2026).
 */
const LIKE_WEIGHT: Record<string, number> = { Hauptzutat: 2, Gericht: 1, Küche: 1 };
const SAME_KIND_WEIGHT = 1;
const LIKE_AT_LEAST = 3;
/** A cookbook with fewer recipes nobody marked is no cookbook of the day. */
const BOOK_AT_LEAST = 6;

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
    look: ShelfLook = "card",
  ): Shelf => {
    const unmarked = members.filter((recipe) => !isMarked(recipe));
    return {
      key,
      title,
      look,
      filter,
      total: filter ? members.length : unmarked.length,
      recipes: unmarked.sort(sort).slice(0, size),
    };
  };
  const filtered = (
    key: string,
    title: string,
    filter: RecipeFilter,
    sort = order,
    look: ShelfLook = "card",
  ) =>
    shelf(
      key,
      title,
      recipes.filter((recipe) => matchesFilter(recipe, filter)),
      filter,
      sort,
      look,
    );

  const lastCooked = (recipe: RecipeSummary) => history.get(recipe.id) ?? null;
  const fresh = recipes.filter((recipe) => daysBetween(recipe.addedOn, today) <= NEW_DAYS);

  // In season: what needs most of what is harvested now first.
  const season = filtered(
    "saison",
    "Passt zur Saison",
    { ...NO_FILTER, season: true },
    (a, b) => (b.season?.points ?? 0) - (a.season?.points ?? 0) || order(a, b),
    "large",
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
    "list",
  );
  // Longest ago first.
  const longAgo = filtered(
    "lange-nicht",
    "Lange nicht gekocht",
    { ...NO_FILTER, longAgo: true },
    (a, b) => (lastCooked(a) ?? "").localeCompare(lastCooked(b) ?? ""),
  );

  const shelves: Shelf[] = [season, quick];
  const liked = likeFavorites(recipes, options, shelf);
  if (liked) shelves.push(liked);
  shelves.push(longAgo);
  shelves.push(...tagShelves(recipes, options, filtered));
  const book = bookOfTheDay(recipes, today);
  if (book) shelves.push(filtered(`buch-${book}`, `Aus „${book}“`, { ...NO_FILTER, book }));
  // Right after a cookbook was photographed, everything is new, and a shelf saying so says
  // nothing. It appears once new recipes are the exception.
  if (fresh.length * 3 < recipes.length) {
    shelves.push(
      shelf("neu", "Neu im Kochbuch", fresh, null, (a, b) => b.addedOn.localeCompare(a.addedOn)),
    );
  }
  // Only once there are plans: before that, every recipe was never cooked.
  if (history.size > 0) {
    const never = recipes.filter((recipe) => isMeal(recipe) && !history.has(recipe.id));
    shelves.push(shelf("nie", "Noch nie gekocht", never, null, order, "list"));
  }
  return shelves.filter((entry) => entry.recipes.length > 0);
}

/**
 * What is like the favourites: recipes nobody marked that share enough with one of them
 * (`LIKE_WEIGHT`), the closest first, each saying which favourite it is like. None without
 * favourites.
 */
function likeFavorites(
  recipes: readonly RecipeSummary[],
  options: DiscoverOptions,
  shelf: (
    key: string,
    title: string,
    members: RecipeSummary[],
    filter: RecipeFilter | null,
    sort: (a: RecipeSummary, b: RecipeSummary) => number,
  ) => Shelf,
): Shelf | null {
  const favorites = options.favorites ?? [];
  if (favorites.length === 0) return null;
  const weight = new Map(
    (options.tagGroups ?? []).flatMap((group) =>
      group.tags.map((tag) => [tag.ref, LIKE_WEIGHT[group.name] ?? 0] as const),
    ),
  );
  const closest = new Map<string, { shared: number; favorite: RecipeSummary }>();
  for (const recipe of recipes) {
    if (isMarked(recipe) || !isMeal(recipe)) continue;
    for (const favorite of favorites) {
      const tags = recipe.tags
        .filter((tag) => favorite.tags.includes(tag))
        .reduce((sum, tag) => sum + (weight.get(tag) ?? 0), 0);
      // The same kind of meal alone is no likeness: half the library is vegetarian.
      const kind =
        tags > 0 && recipe.proteinType !== null && recipe.proteinType === favorite.proteinType
          ? SAME_KIND_WEIGHT
          : 0;
      const shared = tags + kind;
      const best = closest.get(recipe.id);
      if (shared >= LIKE_AT_LEAST && (!best || shared > best.shared)) {
        closest.set(recipe.id, { shared, favorite });
      }
    }
  }
  const members = recipes.filter((recipe) => closest.has(recipe.id));
  const result = shelf(
    "wie-favoriten",
    "Wie eure Favoriten",
    members,
    null,
    (a, b) =>
      closest.get(b.id)!.shared - closest.get(a.id)!.shared ||
      rank(options.today, a.id) - rank(options.today, b.id),
  );
  result.why = Object.fromEntries(
    result.recipes.map((recipe) => [recipe.id, `Wie „${closest.get(recipe.id)!.favorite.title}“`]),
  );
  return result;
}

/** A cookbook to leaf through today, among those with enough recipes nobody marked. */
export function bookOfTheDay(recipes: readonly RecipeSummary[], today: IsoDate): string | null {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    if (recipe.sourceBook && !isMarked(recipe)) {
      counts.set(recipe.sourceBook, (counts.get(recipe.sourceBook) ?? 0) + 1);
    }
  }
  const books = [...counts].filter(([, count]) => count >= BOOK_AT_LEAST).map(([book]) => book);
  books.sort((a, b) => rank(today, a) - rank(today, b) || a.localeCompare(b, "de"));
  return books[0] ?? null;
}

/** The recipe of the day, and what speaks for it today. */
export interface Featured {
  recipe: RecipeSummary;
  /** "Passt zur Saison: Kürbis, Lauch", "Noch nie gekocht". Null where nothing says more. */
  why: string | null;
}

/**
 * One meal nobody marked, a different one each day: one that fits the season where there is
 * such a one, else any.
 */
export function recipeOfTheDay(
  recipes: readonly RecipeSummary[],
  { today, history }: { today: IsoDate; history: History },
): Featured | null {
  const meals = recipes.filter((recipe) => !isMarked(recipe) && isMeal(recipe));
  const inSeason = meals.filter((recipe) => recipe.season?.fits);
  const pool = inSeason.length > 0 ? inSeason : meals;
  const [recipe] = [...pool].sort((a, b) => rank(today, a.id) - rank(today, b.id));
  if (!recipe) return null;
  const foods = recipe.season?.fits ? recipe.season.foods.slice(0, 3) : [];
  const last = history.get(recipe.id);
  const why =
    foods.length > 0
      ? `Passt zur Saison: ${foods.join(", ")}`
      : history.size > 0 && last === undefined
        ? "Noch nie gekocht"
        : last !== undefined && daysBetween(last, today) >= LONG_AGO_DAYS
          ? "Lange nicht gekocht"
          : null;
  return { recipe, why };
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

/** A category of Entdecken's tabs: its own page of shelves inside the category. */
export interface CategoryTab {
  key: string;
  name: string;
  count: number;
}

/** A category with fewer recipes nobody marked gets no tab of its own. */
const TAB_AT_LEAST = 4;

/** The categories that get a tab, in the household's order, each with its count. */
export function categoryTabs(
  recipes: readonly RecipeSummary[],
  categories: readonly Category[],
): CategoryTab[] {
  return categories
    .map((category) => ({
      key: category.key,
      name: category.name,
      count: recipes.filter((recipe) => !isMarked(recipe) && recipe.category === category.key)
        .length,
    }))
    .filter((tab) => tab.count >= TAB_AT_LEAST);
}

/** A tag to narrow a category down by, with how many of its recipes have it. */
export interface TagChip {
  ref: string;
  name: string;
  count: number;
}

/** A chip needs this many recipes behind it. */
const CHIP_AT_LEAST = 2;

/** The tags of one group the given recipes have, the most used first. */
export function tagChips(
  recipes: readonly RecipeSummary[],
  group: TagGroup | undefined,
): TagChip[] {
  if (!group) return [];
  return group.tags
    .map((tag) => ({
      ref: tag.ref,
      name: tag.name,
      count: recipes.filter((recipe) => recipe.tags.includes(tag.ref)).length,
    }))
    .filter((chip) => chip.count >= CHIP_AT_LEAST)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
}

/**
 * A theme to browse: filters put together into something to cook, with a line that says what
 * is behind it. Not the filters one by one again: those are in the panel (October 2026).
 */
export interface Theme {
  key: string;
  title: string;
  /** What is behind it, said plainly: "Hauptgerichte in höchstens 30 Minuten". */
  line: string;
  picture: Pictogram;
  filter: RecipeFilter;
  count: number;
}

interface ThemeIdea extends Omit<Theme, "filter" | "count"> {
  filter: Partial<RecipeFilter>;
  /** The months it belongs to (1 to 12); all year where none are said. */
  months?: readonly number[];
}

const THEME_IDEAS: readonly ThemeIdea[] = [
  {
    key: "feierabend",
    title: "Feierabendküche",
    line: "Hauptgerichte in höchstens 30 Minuten",
    picture: "blitz",
    filter: { category: "hauptgericht", maxMinutes: 30 },
  },
  {
    key: "wochenende",
    title: "Wochenendprojekt",
    line: "Hauptgerichte, die Zeit brauchen",
    picture: "sanduhr",
    filter: { category: "hauptgericht", tags: ["aufwendig"] },
  },
  {
    key: "vegetarisch",
    title: "Vegetarisch satt",
    line: "Vegetarische Hauptgerichte",
    picture: "gemuese",
    filter: { category: "hauptgericht", diet: "vegetarisch" },
  },
  {
    key: "pasta",
    title: "Pasta, schnell",
    line: "Nudeln in höchstens 30 Minuten",
    picture: "pasta",
    filter: { tags: ["pasta"], maxMinutes: 30 },
  },
  {
    key: "fisch",
    title: "Fisch, schnell",
    line: "Fisch in höchstens 30 Minuten",
    picture: "fisch",
    filter: { diet: "fisch", maxMinutes: 30 },
  },
  {
    key: "ofen",
    title: "Ab in den Ofen",
    line: "Aufläufe und Gratins",
    picture: "auflauf",
    filter: { tags: ["auflauf"] },
  },
  {
    key: "gaeste",
    title: "Besuch kommt",
    line: "Rezepte für Gäste",
    picture: "glas",
    filter: { tags: ["fuer-gaeste"] },
  },
  {
    key: "suppe",
    title: "Suppenzeit",
    line: "Suppen und Eintöpfe",
    picture: "suppe",
    filter: { category: "suppe-eintopf" },
    months: [10, 11, 12, 1, 2, 3],
  },
  {
    key: "grill",
    title: "Grillabend",
    line: "Rezepte zum Grillen",
    picture: "grill",
    filter: { tags: ["grillen"] },
    months: [5, 6, 7, 8, 9],
  },
  {
    key: "salat",
    title: "Leicht im Sommer",
    line: "Salate",
    picture: "salat",
    filter: { category: "salat" },
    months: [6, 7, 8],
  },
  {
    key: "plaetzchen",
    title: "Weihnachtsbäckerei",
    line: "Plätzchen und Kekse",
    picture: "keks",
    filter: { category: "plaetzchen" },
    months: [11, 12],
  },
  {
    key: "kuchen",
    title: "Kaffee & Kuchen",
    line: "Kuchen und Gebäck",
    picture: "kuchen",
    filter: { category: "kuchen" },
  },
  {
    key: "mitnehmen",
    title: "Für unterwegs",
    line: "Rezepte zum Mitnehmen",
    picture: "korb",
    filter: { tags: ["mitnehmen"] },
  },
];

/** A theme with fewer recipes is not offered; this many are. */
const THEME_AT_LEAST = 4;
const THEMES_SHOWN = 6;

/**
 * The themes worth offering today: those with enough recipes, the ones of this time of year
 * first, then a few of the others, a different few each day.
 */
export function themes(recipes: readonly RecipeSummary[], today: IsoDate): Theme[] {
  const month = Number(today.slice(5, 7));
  const offered = THEME_IDEAS.filter((idea) => !idea.months || idea.months.includes(month))
    .map(({ months, ...idea }) => {
      const filter = { ...NO_FILTER, ...idea.filter };
      return {
        ...idea,
        filter,
        count: recipes.filter((recipe) => matchesFilter(recipe, filter)).length,
        timely: months !== undefined,
      };
    })
    .filter((theme) => theme.count >= THEME_AT_LEAST)
    .sort((a, b) => Number(b.timely) - Number(a.timely) || rank(today, a.key) - rank(today, b.key));
  return offered.slice(0, THEMES_SHOWN).map(({ key, title, line, picture, filter, count }) => ({
    key,
    title,
    line,
    picture,
    filter,
    count,
  }));
}

export const DIET_LABEL: Record<Diet, string> = {
  vegetarisch: "Vegetarisch",
  vegan: "Vegan",
  fisch: "Fisch",
  gefluegel: "Geflügel",
  fleisch: "Fleisch",
};

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
