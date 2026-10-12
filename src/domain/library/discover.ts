import { daysBetween, type IsoDate } from "../dates";
import { rank } from "../rank";
import { matchesFilter, NO_FILTER, type RecipeFilter } from "./filter";
import { isMeal, type Category, type History, type RecipeSummary } from "./summary";

/**
 * The library as shelves to browse: the same recipes grouped by different criteria. A shelf
 * shows a handful and says how many there are; "show all" is the shelf's filter.
 */

export interface Shelf {
  key: string;
  title: string;
  /** The filter that lists the whole shelf. Null for a shelf no filter can express. */
  filter: RecipeFilter | null;
  total: number;
  /** The first few. */
  recipes: RecipeSummary[];
}

export interface ShelfGroup {
  title: string;
  shelves: Shelf[];
}

export interface DiscoverOptions {
  today: IsoDate;
  history: History;
  /** The household's categories, in their order. */
  categories: Category[];
  /** How many recipes a shelf shows. */
  size?: number;
}

/** After this many days without it, a dish the household knows is worth bringing up again. */
export const LONG_AGO_DAYS = 56;
/** For this long a recipe counts as new. */
const NEW_DAYS = 14;
const QUICK_MINUTES = 20;

const DIET_SHELVES = [
  { diet: "vegetarisch", title: "Vegetarisch" },
  { diet: "vegan", title: "Vegan" },
  { diet: "fisch", title: "Fisch" },
  { diet: "gefluegel", title: "Geflügel" },
  { diet: "fleisch", title: "Fleisch" },
] as const;

export function discover(
  recipes: readonly RecipeSummary[],
  options: DiscoverOptions,
): ShelfGroup[] {
  const { today, history, categories } = options;
  const size = options.size ?? 10;

  // Favourites lead every shelf. The rest changes from day to day, so that browsing shows
  // more than the same ten recipes of a shelf with four hundred.
  const order = (a: RecipeSummary, b: RecipeSummary) =>
    Number(b.isFavorite) - Number(a.isFavorite) || rank(today, a.id) - rank(today, b.id);
  const shelf = (
    key: string,
    title: string,
    members: RecipeSummary[],
    filter: RecipeFilter | null,
    sort = order,
  ): Shelf => ({
    key,
    title,
    filter,
    total: members.length,
    recipes: [...members].sort(sort).slice(0, size),
  });
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

  const picked: Shelf[] = [
    filtered("favoriten", "Favoriten", { ...NO_FILTER, favorites: true }),
    shelf(
      "schnell",
      `Bis ${QUICK_MINUTES} Minuten`,
      recipes.filter(
        (recipe) =>
          isMeal(recipe) && recipe.prepMinutes !== null && recipe.prepMinutes <= QUICK_MINUTES,
      ),
      null,
    ),
    // Longest ago first.
    shelf("lange-nicht", "Lange nicht gekocht", longAgo, null, (a, b) =>
      (lastCooked(a) as IsoDate).localeCompare(lastCooked(b) as IsoDate),
    ),
  ];
  // Right after a cookbook was photographed, everything is new, and a shelf saying so says
  // nothing. It appears once new recipes are the exception.
  if (fresh.length * 3 < recipes.length) {
    picked.push(shelf("neu", "Neu", fresh, null, (a, b) => b.addedOn.localeCompare(a.addedOn)));
  }

  const books = [...new Set(recipes.flatMap((recipe) => recipe.sourceBook ?? []))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );
  const groups: ShelfGroup[] = [
    { title: "Auswahl", shelves: picked },
    {
      title: "Nach Art",
      shelves: categories.map((category) =>
        filtered(`kategorie-${category.key}`, category.name, {
          ...NO_FILTER,
          category: category.key,
        }),
      ),
    },
    {
      title: "Nach Ernährung",
      shelves: DIET_SHELVES.map(({ diet, title }) =>
        filtered(`kost-${diet}`, title, { ...NO_FILTER, diet }),
      ),
    },
    {
      title: "Nach Kochbuch",
      shelves: books.map((book) => filtered(`buch-${book}`, book, { ...NO_FILTER, book })),
    },
  ];
  return groups
    .map((group) => ({ ...group, shelves: group.shelves.filter((s) => s.total > 0) }))
    .filter((group) => group.shelves.length > 0);
}
