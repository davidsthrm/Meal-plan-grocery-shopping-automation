import { searchKey } from "./filter";

/**
 * Recipes that are the same dish twice: the same page photographed in two batches, or one
 * recipe printed in two cookbooks. Two recipes are compared by their titles and by what they
 * are made of. A title alone is not enough (two books each have their own "Apfelkuchen"),
 * and neither are ingredients (a pasta with tomatoes and one with tomatoes and olives).
 */

export interface DuplicateCandidate {
  id: string;
  title: string;
  sourceBook: string | null;
  sourcePage: number | null;
  /**
   * What it is made of, each ingredient once: a catalog id, or the printed name of a line the
   * catalog does not know. Pantry staples are left out where enough else is left.
   */
  ingredients: readonly string[];
  /** The names of its ingredients, to tell which words of its title name one of them. */
  names: readonly string[];
}

export interface DuplicatePair {
  /** The two recipes, in a fixed order (`pairKey`). */
  a: string;
  b: string;
  /** 0 to 1: how alike the titles are. */
  title: number;
  /** 0 to 1: the share of ingredients both have. Null when one of them has too few to tell. */
  ingredients: number | null;
  /** The same book and page. Said, but no reason by itself: one page often holds several. */
  samePage: boolean;
  /** 0 to 1, for the order they are shown in. */
  score: number;
}

/** Words that say nothing about the dish. */
const FILLER = new Set([
  "mit",
  "und",
  "an",
  "in",
  "im",
  "auf",
  "aus",
  "vom",
  "von",
  "zu",
  "zum",
  "der",
  "die",
  "das",
  "dem",
  "den",
  "ein",
  "eine",
  "art",
  "nach",
  "a",
  "la",
  "al",
  "alla",
  "uber",
]);

function words(title: string): string[] {
  return title
    .split(/[^\p{L}\p{N}]+/u)
    .map(searchKey)
    .filter((word) => word.length > 0 && !FILLER.has(word));
}

/** Pairs of neighbouring letters: "Pestonudeln" and "Pesto-Nudeln" share all of them. */
function letterPairs(title: string): Set<string> {
  return pairsOf(words(title).join(""));
}

function pairsOf(text: string): Set<string> {
  const pairs = new Set<string>();
  for (let at = 0; at < text.length - 1; at++) pairs.add(text.slice(at, at + 2));
  return pairs;
}

/**
 * Whether two words of titles or ingredients are one: the same, one part of the other
 * ("kichererbsen" in "kichererbsencurry"), or nearly the same letters ("nudel", "nudeln").
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4) return false;
  return long.includes(short) || dice(pairsOf(a), pairsOf(b)) >= 0.8;
}

/**
 * Whether the title of one recipe names an ingredient the other does not have: "mit
 * Garnelen" and "mit Kichererbsen" are two dishes, however much else they share. A word that
 * names no ingredient, such as "rustikal", does not count.
 */
function namesOwnIngredient(
  title: readonly string[],
  ownNames: readonly string[],
  otherTitle: readonly string[],
  otherNames: readonly string[],
): boolean {
  return title.some(
    (word) =>
      !otherTitle.some((other) => sameWord(word, other)) &&
      ownNames.some((name) => sameWord(word, name)) &&
      !otherNames.some((name) => sameWord(word, name)),
  );
}

function shared<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const item of small) if (large.has(item)) count++;
  return count;
}

function dice<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size + b.size === 0) return 0;
  return (2 * shared(a, b)) / (a.size + b.size);
}

function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  const both = shared(a, b);
  const either = a.size + b.size - both;
  return either === 0 ? 0 : both / either;
}

/**
 * How alike two titles are, from 0 to 1. Case, umlauts, hyphens and small words do not
 * count: "Pesto-Nudeln mit Rucola" and "Pestonudeln und Rucola" are the same title.
 */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(words(a));
  const wordsB = new Set(words(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  return Math.max(jaccard(wordsA, wordsB), dice(letterPairs(a), letterPairs(b)));
}

/** Fewer ingredients than this say too little to compare. */
const FEWEST_INGREDIENTS = 3;

/** The share of ingredients two recipes have in common, or null when one has too few. */
export function ingredientOverlap(a: readonly string[], b: readonly string[]): number | null {
  if (a.length < FEWEST_INGREDIENTS || b.length < FEWEST_INGREDIENTS) return null;
  return jaccard(new Set(a), new Set(b));
}

/** The key a pair is stored and looked up by: the two ids in order. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The two ids in the order a pair is stored in. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Whether two recipes are probably one. Each rule wants both signals, one of them strong:
 * - nearly the same title and some ingredients in common,
 * - a similar title and most ingredients in common,
 * - almost all of many ingredients in common and a title that is at least related,
 * - the same title and too few ingredients to tell.
 * A title that names an ingredient only its own recipe has makes a variant, not a
 * duplicate, unless almost all ingredients are the same.
 */
function isDuplicate(title: number, ingredients: number | null, variant: boolean): boolean {
  if (variant && (ingredients === null || ingredients < 0.85)) return false;
  if (ingredients === null) return title >= 0.95;
  if (title >= 0.8 && ingredients >= 0.3) return true;
  if (title >= 0.5 && ingredients >= 0.6) return true;
  return title >= 0.3 && ingredients >= 0.85;
}

/**
 * The pairs of recipes that are probably the same dish, the most certain first. Pairs the
 * household decided to keep both of (`kept`, by `pairKey`) are left out.
 */
export function findDuplicates(
  recipes: readonly DuplicateCandidate[],
  kept: ReadonlySet<string> = new Set(),
): DuplicatePair[] {
  const prepared = recipes.map((recipe) => ({
    recipe,
    words: new Set(words(recipe.title)),
    titleWords: words(recipe.title),
    nameWords: recipe.names.flatMap(words),
    pairs: letterPairs(recipe.title),
    ingredients: new Set(recipe.ingredients),
  }));
  const found: DuplicatePair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const one = prepared[i];
    for (let j = i + 1; j < prepared.length; j++) {
      const other = prepared[j];
      if (one.words.size === 0 || other.words.size === 0) continue;
      const title = Math.max(jaccard(one.words, other.words), dice(one.pairs, other.pairs));
      // Below this no rule can hold; most pairs end here.
      if (title < 0.3) continue;
      const ingredients =
        one.ingredients.size < FEWEST_INGREDIENTS || other.ingredients.size < FEWEST_INGREDIENTS
          ? null
          : jaccard(one.ingredients, other.ingredients);
      const samePage =
        one.recipe.sourceBook !== null &&
        one.recipe.sourceBook === other.recipe.sourceBook &&
        one.recipe.sourcePage !== null &&
        one.recipe.sourcePage === other.recipe.sourcePage;
      const variant =
        namesOwnIngredient(one.titleWords, one.nameWords, other.titleWords, other.nameWords) ||
        namesOwnIngredient(other.titleWords, other.nameWords, one.titleWords, one.nameWords);
      if (!isDuplicate(title, ingredients, variant)) continue;
      const [a, b] = orderedPair(one.recipe.id, other.recipe.id);
      if (kept.has(pairKey(a, b))) continue;
      found.push({
        a,
        b,
        title,
        ingredients,
        samePage,
        score: ingredients === null ? title * 0.9 : (title + ingredients) / 2,
      });
    }
  }
  return found.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a));
}

/**
 * What a recipe is made of for the comparison: each ingredient once, without the pantry
 * staples (salt, oil, flour) that half the library shares, unless that leaves too little.
 */
export function comparableIngredients(
  ingredients: readonly { key: string; staple: boolean }[],
): string[] {
  const all = [...new Set(ingredients.map((ingredient) => ingredient.key))];
  const particular = [
    ...new Set(ingredients.filter((ingredient) => !ingredient.staple).map((i) => i.key)),
  ];
  return particular.length >= FEWEST_INGREDIENTS ? particular : all;
}

export interface MergeSide {
  id: string;
  isFavorite: boolean;
  /** How often it was on a plan. */
  planned: number;
}

/**
 * Which of two duplicates to keep, where something speaks for one: it was planned more
 * often, or it is a favourite. Null where nothing does; the household decides.
 */
export function keepReason(
  one: MergeSide,
  other: MergeSide,
): { id: string; reason: string } | null {
  if (one.planned !== other.planned) {
    return { id: one.planned > other.planned ? one.id : other.id, reason: "Öfter geplant" };
  }
  if (one.isFavorite !== other.isFavorite) {
    return { id: one.isFavorite ? one.id : other.id, reason: "Favorit" };
  }
  return null;
}
