/**
 * "Was ist noch da?": the ingredients someone taps, and the recipes that use most of them,
 * each saying what is still missing. What is always at home (salt, oil, flour) is neither
 * offered nor missing: it decides nothing.
 */

/** A recipe as the fridge sees it: which of the foods it uses, by their place in the list. */
export interface FridgeRecipe {
  id: string;
  uses: readonly number[];
}

/** A recipe that uses something of what is there, with what it has and what it lacks. */
export interface FridgeMatch<T extends FridgeRecipe> {
  recipe: T;
  have: number[];
  missing: number[];
}

/**
 * The recipes that use something of what is there: those using the most of it first, then
 * those lacking the least, else in the order given.
 */
export function fridgeMatches<T extends FridgeRecipe>(
  recipes: readonly T[],
  there: ReadonlySet<number>,
): FridgeMatch<T>[] {
  if (there.size === 0) return [];
  return recipes
    .map((recipe, order) => ({
      recipe,
      order,
      have: recipe.uses.filter((food) => there.has(food)),
      missing: recipe.uses.filter((food) => !there.has(food)),
    }))
    .filter((match) => match.have.length > 0)
    .sort(
      (a, b) =>
        b.have.length - a.have.length || a.missing.length - b.missing.length || a.order - b.order,
    )
    .map(({ recipe, have, missing }) => ({ recipe, have, missing }));
}

/** How many recipes use each food, by its place in the list: what is offered to tap first. */
export function foodCounts(recipes: readonly FridgeRecipe[], foods: number): number[] {
  const counts = Array.from({ length: foods }, () => 0);
  for (const recipe of recipes) for (const food of new Set(recipe.uses)) counts[food] += 1;
  return counts;
}

/** The foods whose name contains what was typed, those used most first. */
export function findFoods(
  names: readonly string[],
  counts: readonly number[],
  typed: string,
  limit = 6,
): number[] {
  const key = fold(typed.trim());
  if (key === "") return [];
  return names
    .map((name, food) => ({ food, name: fold(name) }))
    .filter((entry) => entry.name.includes(key))
    .sort(
      (a, b) =>
        Number(b.name.startsWith(key)) - Number(a.name.startsWith(key)) ||
        counts[b.food] - counts[a.food],
    )
    .slice(0, limit)
    .map((entry) => entry.food);
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ß", "ss");
}
