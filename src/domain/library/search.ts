import {
  byFavoriteThenTitle,
  matchesFilter,
  searchKey,
  type Diet,
  type RecipeFilter,
} from "./filter";
import type { ProteinType, RecipeSummary } from "./summary";

/**
 * The search of the recipe library. It is meant to find, not to be exact: a word may be part
 * of a longer one ("nudel" in "Pestonudeln"), name an ingredient, a category, a diet or a
 * cookbook, and a typing mistake still leads to the recipe. What fits best comes first.
 */

/** A search does not get better with more words than this. */
const MAX_WORDS = 6;

/** The words of a search as they are compared: without umlauts, case or punctuation. */
export function searchWords(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;/]+/)
        .map(searchKey)
        .filter(Boolean),
    ),
  ].slice(0, MAX_WORDS);
}

/**
 * How many letters of a word may be wrong. Short words must be right: with one wrong letter
 * allowed, "Reis" would find "Eis".
 */
export function tolerance(word: string): number {
  if (word.length >= 9) return 2;
  return word.length >= 5 ? 1 : 0;
}

/**
 * The fewest changes that turn `word` into some part of `text`: a letter added, left out or
 * swapped for another, or two neighbouring letters the wrong way round ("lasange"). 0 means
 * the word is in the text as it is.
 */
export function distanceWithin(word: string, text: string): number {
  let beforeLast: number[] = [];
  let last: number[] = new Array<number>(text.length + 1).fill(0);
  for (let i = 1; i <= word.length; i++) {
    const current = [i];
    for (let j = 1; j <= text.length; j++) {
      current[j] = Math.min(
        last[j] + 1,
        current[j - 1] + 1,
        last[j - 1] + (word[i - 1] === text[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && word[i - 1] === text[j - 2] && word[i - 2] === text[j - 1]) {
        current[j] = Math.min(current[j], beforeLast[j - 2] + 1);
      }
    }
    beforeLast = last;
    last = current;
  }
  return Math.min(...last);
}

/** True when the word is in the text, give or take a typing mistake. */
export function nearlyContains(text: string, word: string): boolean {
  if (text.includes(word)) return true;
  const allowed = tolerance(word);
  return allowed > 0 && distanceWithin(word, text) <= allowed;
}

const DIET_WORDS: Record<ProteinType, Diet[]> = {
  vegetarian: ["vegetarisch"],
  vegan: ["vegan", "vegetarisch"],
  fish: ["fisch"],
  poultry: ["gefluegel"],
  red_meat: ["fleisch"],
  none: [],
};

export interface SearchContext {
  /** Per search word, the recipes with an ingredient of that name. Only the database knows. */
  ingredientHits?: ReadonlyMap<string, ReadonlySet<string>>;
  /** The name of a recipe's category, as the household named it. */
  categoryName?: (key: string) => string | undefined;
  /** The name of a tag, as the household named it. */
  tagName?: (ref: string) => string | undefined;
}

export interface SearchResult {
  /** Recipes that fit every word of the search, best first. */
  matches: RecipeSummary[];
  /** Recipes that fit only some of the words. Something to fall back on. */
  related: RecipeSummary[];
}

/** How well one word of the search fits one recipe. 0 means not at all. */
const POINTS = { word: 4, start: 3, inside: 2.5, ingredient: 2, keyword: 1.5, nearly: 1 } as const;

interface Searchable {
  recipe: RecipeSummary;
  title: string;
  words: string[];
  keywords: string;
}

function exactPoints(entry: Searchable, word: string, context: SearchContext): number {
  if (entry.words.includes(word)) return POINTS.word;
  if (entry.words.some((own) => own.startsWith(word))) return POINTS.start;
  if (entry.title.includes(word)) return POINTS.inside;
  if (context.ingredientHits?.get(word)?.has(entry.recipe.id)) return POINTS.ingredient;
  // A category, diet or cookbook is named by a whole word or its beginning: "suppe", "veg".
  if (word.length >= 3 && entry.keywords.includes(` ${word}`)) return POINTS.keyword;
  return 0;
}

/**
 * Searches recipes for a text. Recipes that do not pass the other settings of the filter are
 * left out before the text is looked at.
 */
export function searchRecipes(
  recipes: readonly RecipeSummary[],
  filter: RecipeFilter,
  context: SearchContext = {},
): SearchResult {
  const pool = recipes.filter((recipe) => matchesFilter(recipe, filter));
  const words = searchWords(filter.text);
  if (words.length === 0) return { matches: [...pool].sort(byFavoriteThenTitle), related: [] };

  const entries = pool.map((recipe): Searchable => {
    const category = recipe.category ? (context.categoryName?.(recipe.category) ?? "") : "";
    const diets = recipe.proteinType ? DIET_WORDS[recipe.proteinType] : [];
    const tags = recipe.tags.map((ref) => context.tagName?.(ref) ?? "");
    const keywords = [category, recipe.sourceBook ?? "", ...diets, ...tags]
      .flatMap((text) => text.split(/[^\p{L}\p{N}]+/u))
      .map(searchKey)
      .filter(Boolean);
    return {
      recipe,
      title: searchKey(recipe.title),
      words: recipe.title
        .split(/[^\p{L}\p{N}]+/u)
        .map(searchKey)
        .filter(Boolean),
      keywords: ` ${keywords.join(" ")}`,
    };
  });

  // A typing mistake is only assumed for a word that finds nothing as it is written.
  const mistyped = new Set(
    words.filter((word) => !entries.some((entry) => exactPoints(entry, word, context) > 0)),
  );
  const phrase = searchKey(filter.text);
  const scored = entries.map((entry) => {
    const points = words.map((word) => {
      const exact = exactPoints(entry, word, context);
      if (exact > 0 || !mistyped.has(word)) return exact;
      return nearlyContains(entry.title, word) ? POINTS.nearly : 0;
    });
    const found = points.filter((value) => value > 0).length;
    // The words in the order they were typed, next to each other, fit best of all.
    const bonus = words.length > 1 && entry.title.includes(phrase) ? 2 : 0;
    return { recipe: entry.recipe, found, score: points.reduce((a, b) => a + b, 0) + bonus };
  });
  const best = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.score - a.score || byFavoriteThenTitle(a.recipe, b.recipe);

  return {
    matches: scored
      .filter((entry) => entry.found === words.length)
      .sort(best)
      .map((entry) => entry.recipe),
    related: scored
      .filter((entry) => entry.found > 0 && entry.found < words.length)
      .sort(best)
      .map((entry) => entry.recipe),
  };
}
