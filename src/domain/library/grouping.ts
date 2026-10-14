import { groupOf, type BalanceGroup } from "../recommend/balance";
import { isSweet, type RecipeSummary } from "./summary";

/**
 * A way to sort a list of recipes into groups: by the kind of meal now, by a group of tags
 * ("Küche", "Aufwand") later. A grouping names its groups in the order they are shown and
 * says which one a recipe belongs to.
 */
export interface Grouping<K extends string> {
  order: readonly K[];
  /** The group of a recipe. Null puts it with the rest, after every named group. */
  keyOf: (recipe: RecipeSummary) => K | null;
}

export interface RecipeGroup<K extends string> {
  /** Null for the recipes that belong to none of the named groups. */
  key: K | null;
  recipes: RecipeSummary[];
}

/** Recipes in their groups, in the grouping's order, each group by title. Empty ones are left out. */
export function groupRecipes<K extends string>(
  recipes: readonly RecipeSummary[],
  grouping: Grouping<K>,
): RecipeGroup<K>[] {
  const known = new Set<string>(grouping.order);
  const members = new Map<K | null, RecipeSummary[]>();
  for (const recipe of recipes) {
    const found = grouping.keyOf(recipe);
    const key = found !== null && known.has(found) ? found : null;
    members.set(key, [...(members.get(key) ?? []), recipe]);
  }
  return [...grouping.order, null]
    .map((key) => ({
      key,
      recipes: (members.get(key) ?? []).sort((a, b) => a.title.localeCompare(b.title, "de")),
    }))
    .filter((group) => group.recipes.length > 0);
}

/** The kinds a recipe is coloured by: the four the week counts, and cakes and desserts. */
export type RecipeKindGroup = BalanceGroup | "sweet";

/** By the kind of meal, as the week counts it. A cake is sweet, whatever is in it. */
export const BY_KIND: Grouping<RecipeKindGroup> = {
  order: ["vegetarian", "fish", "poultry", "red_meat", "sweet"],
  keyOf: (recipe) => (isSweet(recipe) ? "sweet" : groupOf(recipe.proteinType)),
};

/**
 * By one tag of a group, such as the cuisine: the first of the recipe's tags that is one of
 * `tags`, in their order. For a group in which a recipe has one tag at most.
 */
export function byTag(tags: readonly string[]): Grouping<string> {
  return {
    order: tags,
    keyOf: (recipe) => tags.find((tag) => recipe.tags.includes(tag)) ?? null,
  };
}
