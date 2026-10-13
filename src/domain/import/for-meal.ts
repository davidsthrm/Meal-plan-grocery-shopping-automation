import { searchKey } from "../library/filter";

/**
 * An upload started from a meal of the week plan: "Lasagne" stands there as text, the page
 * of the cookbook is photographed, and the recipe read from it takes the place of the text.
 */

/**
 * The recipe meant for the meal, among those read from the photos. One recipe is the one. Of
 * several, as on a double page, it is the one whose title and the typed text name each
 * other. Null when that does not decide it: nothing is planned by guessing.
 */
export function recipeForMeal<T extends { title: string }>(
  typed: string,
  recipes: readonly T[],
): T | null {
  if (recipes.length === 1) return recipes[0];
  const wanted = searchKey(typed);
  if (wanted === "") return null;
  const named = recipes.filter((recipe) => {
    const title = searchKey(recipe.title);
    return title !== "" && (title.includes(wanted) || wanted.includes(title));
  });
  return named.length === 1 ? named[0] : null;
}
