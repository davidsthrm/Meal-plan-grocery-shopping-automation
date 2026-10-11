import { findIngredient, normalizeName, type CatalogIndex, type Ingredient } from "../catalog";

/**
 * Finds the catalog ingredient a printed recipe line means.
 *
 * The longest stretch of the printed line that contains the ingredient's name and is itself a
 * catalog name wins. That way "1 getrocknete Chilischote" finds the dried chili and not the
 * fresh one, and "Tomaten gehackt" finds canned chopped tomatoes, while "2 kleine, feste
 * Tomaten" stays plain tomatoes. Returns null when the catalog does not know the ingredient;
 * the caller then proposes it instead of guessing.
 */
export function mapToCatalog(
  index: CatalogIndex,
  line: { raw: string; name: string },
): Ingredient | null {
  const wanted = normalizeName(line.name);
  const words = line.raw.trim().split(/\s+/);
  if (wanted !== "") {
    for (let length = words.length; length >= 1; length--) {
      for (let start = 0; start + length <= words.length; start++) {
        const candidate = words.slice(start, start + length).join(" ");
        if (!normalizeName(candidate).includes(wanted)) continue;
        const found = findIngredient(index, candidate);
        if (found) return found;
      }
    }
  }
  return findIngredient(index, line.name) ?? null;
}
