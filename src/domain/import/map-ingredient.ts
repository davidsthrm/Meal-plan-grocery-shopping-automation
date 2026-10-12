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
  for (const variant of nameVariants(line.name)) {
    const found = findIngredient(index, variant);
    if (found) return found;
  }
  return null;
}

const PLURAL_ENDINGS = ["en", "n", "s", "e"];

/**
 * Other ways a recipe writes the same product: singular or plural ("Forellenfilets"), and with
 * or without "Bio-". The name itself comes first. Short words get no variants, because
 * there an added or dropped letter makes a different word ("Ei", "Eis").
 */
export function nameVariants(name: string): string[] {
  const typed = name.trim();
  const variants = new Set<string>();
  for (const form of [typed, typed.replace(/^bio[-\s]+/i, "")]) {
    variants.add(form);
    if (form.length < 4) continue;
    for (const ending of PLURAL_ENDINGS) {
      variants.add(form + ending);
      if (form.toLowerCase().endsWith(ending) && form.length - ending.length >= 4) {
        variants.add(form.slice(0, -ending.length));
      }
    }
  }
  return [...variants];
}

/** Whether two names are the same product written differently, by the rules above. */
export function sameProductName(a: string, b: string): boolean {
  const forms = new Set(nameVariants(a).map(normalizeName));
  return nameVariants(b).some((variant) => forms.has(normalizeName(variant)));
}
