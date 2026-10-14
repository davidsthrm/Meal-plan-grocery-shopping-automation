import { normalizeName, type AisleGroup, type CatalogIndex, type Ingredient } from "./catalog";

/**
 * What is usually at home ("Vorrat"): the ingredients of the catalog marked as such. What a
 * recipe needs of them goes under "Haben wir schon" instead of on a note.
 */

export interface PantryGroup {
  aisleGroup: AisleGroup;
  items: Ingredient[];
}

const byName = (a: Ingredient, b: Ingredient) => a.name.localeCompare(b.name, "de");

/** The staples by kind of grocery, in the household's order of the aisles, each by name. */
export function pantryByAisle(index: CatalogIndex): PantryGroup[] {
  const fallback = index.aisleGroupById.get(index.catalog.fallbackAisleGroupId);
  const groups = new Map<string, PantryGroup>();
  for (const ingredient of index.catalog.ingredients) {
    if (!ingredient.isPantryStaple) continue;
    const aisleGroup = index.aisleGroupById.get(ingredient.aisleGroupId) ?? fallback;
    if (!aisleGroup) continue;
    const group = groups.get(aisleGroup.id) ?? { aisleGroup, items: [] };
    group.items.push(ingredient);
    groups.set(aisleGroup.id, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.aisleGroup.sortOrder - b.aisleGroup.sortOrder)
    .map((group) => ({ ...group, items: group.items.sort(byName) }));
}

/**
 * The ingredients of the catalog a search names, best first: a name that starts with it,
 * then one that contains it, then one whose other names do ("Möhren" finds Karotten). Case,
 * umlauts and accents do not matter.
 */
export function searchCatalog(
  ingredients: readonly Ingredient[],
  query: string,
  limit = 40,
): Ingredient[] {
  const wanted = normalizeName(query);
  if (wanted === "") return [];
  const rank = (ingredient: Ingredient): number => {
    const name = normalizeName(ingredient.name);
    if (name.startsWith(wanted)) return 0;
    if (name.includes(wanted)) return 1;
    return ingredient.synonyms.some((other) => normalizeName(other).includes(wanted)) ? 2 : 3;
  };
  return ingredients
    .map((ingredient) => ({ ingredient, rank: rank(ingredient) }))
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || byName(a.ingredient, b.ingredient))
    .slice(0, limit)
    .map((entry) => entry.ingredient);
}
