import { searchKey, type RecipeFilter } from "./filter";
import { nearlyContains, searchRecipes, searchWords, type SearchResult } from "./search";
import type { Category, RecipeSummary } from "./summary";

/**
 * Everything the search needs, in one piece small enough to hand to the browser: the search
 * can then answer while someone is still typing, without asking the server for every letter.
 */
export interface SearchIndex {
  recipes: RecipeSummary[];
  categories: Category[];
  /** Tags by how the app refers to them, with the name the household gave them. */
  tags: { ref: string; name: string }[];
  /** Per ingredient of the catalog, its name and other names as the search compares them. */
  ingredients: string[][];
  /** Per recipe, in the order of `recipes`: which of `ingredients` it uses. */
  uses: number[][];
  /** Per recipe: its printed lines the catalog does not know, as the search compares them. */
  loose: string[];
}

/** Shorter words would match half the catalog ("ei" is in "Reis" and "Weizenmehl"). */
const MIN_INGREDIENT_WORD = 3;
/** A word that names more ingredients than this names no ingredient in particular. */
const MAX_INGREDIENTS_PER_WORD = 150;

/** An ingredient's names the way the index keeps them. */
export function ingredientKeys(names: readonly string[]): string[] {
  return names.map(searchKey).filter(Boolean);
}

/**
 * Per word of a search, the recipes with an ingredient of that name: its catalog name, one of
 * its other names, or a printed line the catalog does not know. A word that names no
 * ingredient as written may be one typing mistake away from one.
 */
export function ingredientHitsIn(
  index: Pick<SearchIndex, "recipes" | "ingredients" | "uses" | "loose">,
  text: string,
): Map<string, Set<string>> {
  const hits = new Map<string, Set<string>>();
  for (const word of searchWords(text)) {
    if (word.length < MIN_INGREDIENT_WORD) continue;
    const named = (fits: (name: string) => boolean) =>
      index.ingredients.flatMap((names, at) => (names.some(fits) ? [at] : []));
    let found = named((name) => name.includes(word));
    if (found.length === 0) found = named((name) => nearlyContains(name, word));
    const wanted = new Set(found.slice(0, MAX_INGREDIENTS_PER_WORD));
    const recipes = new Set<string>();
    index.recipes.forEach((recipe, at) => {
      if (index.uses[at]?.some((use) => wanted.has(use)) || index.loose[at]?.includes(word)) {
        recipes.add(recipe.id);
      }
    });
    hits.set(word, recipes);
  }
  return hits;
}

/** Searches the index: what fits, best first, and what fits in part. */
export function searchIndex(index: SearchIndex, filter: RecipeFilter): SearchResult {
  const categoryNames = new Map(index.categories.map((category) => [category.key, category.name]));
  const tagNames = new Map(index.tags.map((tag) => [tag.ref, tag.name]));
  return searchRecipes(index.recipes, filter, {
    ingredientHits: filter.text.trim() === "" ? undefined : ingredientHitsIn(index, filter.text),
    categoryName: (key) => categoryNames.get(key),
    tagName: (ref) => tagNames.get(ref),
  });
}
