import { normalizeName } from "../catalog";
import type { ProteinType, RecipeSummary } from "./summary";

/**
 * What the household can narrow the library down by. The filter lives in the address of the
 * page, so a filtered view can be reloaded, shared and left with the back button.
 */

export const DIETS = ["vegetarisch", "vegan", "fisch", "gefluegel", "fleisch"] as const;
export type Diet = (typeof DIETS)[number];

export const TIME_LIMITS = [20, 30, 45] as const;

export interface RecipeFilter {
  /** Words of the title, or an ingredient. Empty for none. */
  text: string;
  /** Key of a category tag. */
  category: string | null;
  diet: Diet | null;
  /** Ready in at most this many minutes. */
  maxMinutes: number | null;
  book: string | null;
  /** An edition of that book, when it is a magazine. */
  edition: string | null;
  favorites: boolean;
  /** Tags the recipe must all have, as the app refers to them. */
  tags: string[];
}

/** More tags than this do not narrow a library down any further. */
const MAX_TAGS = 6;

export const NO_FILTER: RecipeFilter = {
  text: "",
  category: null,
  diet: null,
  maxMinutes: null,
  book: null,
  edition: null,
  favorites: false,
  tags: [],
};

const DIET_TYPES: Record<Diet, ProteinType[]> = {
  vegetarisch: ["vegetarian", "vegan"],
  vegan: ["vegan"],
  fisch: ["fish"],
  gefluegel: ["poultry"],
  fleisch: ["red_meat"],
};

export type Params = Record<string, string | string[] | undefined>;

/**
 * A word as the search compares it: "Gemüse", "Gemuese" and "gemuse" are the same. A phone
 * keyboard without umlauts should not hide a recipe.
 */
export function searchKey(text: string): string {
  return normalizeName(text).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
}

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Reads a filter from the address. Anything it does not understand is no filter. */
export function readFilter(params: Params): RecipeFilter {
  const diet = one(params.kost);
  const minutes = Number(one(params.zeit));
  return {
    text: one(params.q).slice(0, 80),
    category: one(params.kategorie) || null,
    diet: (DIETS as readonly string[]).includes(diet) ? (diet as Diet) : null,
    maxMinutes: (TIME_LIMITS as readonly number[]).includes(minutes) ? minutes : null,
    book: one(params.buch) || null,
    // An edition only counts within its book.
    edition: (one(params.buch) && one(params.ausgabe).slice(0, 60)) || null,
    favorites: one(params.favoriten) === "1",
    tags: [
      ...new Set(
        one(params.tag)
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => /^[a-z0-9-]{1,40}$/.test(tag)),
      ),
    ].slice(0, MAX_TAGS),
  };
}

/** The address parameters of a filter, without the ones that are not set. */
export function filterParams(filter: RecipeFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.text.trim() !== "") params.q = filter.text.trim();
  if (filter.category) params.kategorie = filter.category;
  if (filter.diet) params.kost = filter.diet;
  if (filter.maxMinutes !== null) params.zeit = String(filter.maxMinutes);
  if (filter.book) params.buch = filter.book;
  if (filter.book && filter.edition) params.ausgabe = filter.edition;
  if (filter.favorites) params.favoriten = "1";
  if (filter.tags.length > 0) params.tag = filter.tags.join(",");
  return params;
}

export function isNoFilter(filter: RecipeFilter): boolean {
  return Object.keys(filterParams(filter)).length === 0;
}

/**
 * Whether a recipe passes everything of the filter except its text. The text is a search of
 * its own, see `searchRecipes`.
 */
export function matchesFilter(recipe: RecipeSummary, filter: RecipeFilter): boolean {
  if (filter.favorites && !recipe.isFavorite) return false;
  if (filter.category && recipe.category !== filter.category) return false;
  if (filter.book && recipe.sourceBook !== filter.book) return false;
  if (filter.edition && recipe.sourceEdition !== filter.edition) return false;
  if (!filter.tags.every((tag) => recipe.tags.includes(tag))) return false;
  if (filter.diet) {
    if (!recipe.proteinType || !DIET_TYPES[filter.diet].includes(recipe.proteinType)) return false;
  }
  if (filter.maxMinutes !== null) {
    // A recipe without a printed time is not known to be quick.
    if (recipe.prepMinutes === null || recipe.prepMinutes > filter.maxMinutes) return false;
  }
  return true;
}

/** Favourites first, then by title. */
export function byFavoriteThenTitle(a: RecipeSummary, b: RecipeSummary): number {
  return Number(b.isFavorite) - Number(a.isFavorite) || a.title.localeCompare(b.title, "de");
}

/** The recipes that pass everything of the filter except its text, favourites first. */
export function filterRecipes(
  recipes: readonly RecipeSummary[],
  filter: RecipeFilter,
): RecipeSummary[] {
  return recipes.filter((recipe) => matchesFilter(recipe, filter)).sort(byFavoriteThenTitle);
}
