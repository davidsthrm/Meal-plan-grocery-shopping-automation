import { findIngredient, type CatalogIndex, type Ingredient } from "../catalog";
import { nameVariants } from "../import/map-ingredient";
import { parseUnit, type Amount, type Unit } from "../units";

/** A hand-typed line, split into what the catalog knows and what stays free text. */
export interface FreeEntry {
  ingredient: Ingredient | null;
  /** What the line shows. The catalog name if one matched, otherwise the text as typed. */
  label: string;
  amount: Amount | null;
  /** Whatever follows the ingredient name: brand, offer price, a reminder. */
  note: string | null;
}

const LEADING_QUANTITY = /^(\d+(?:[.,]\d+)?)\s*(.*)$/;

/**
 * Reads a line as the household writes it: "Milch WS 1.29", "600 g Leberkäse",
 * "2x Garnelen", "kl. Tomaten".
 *
 * The longest leading run of words that names a catalog ingredient wins, and the rest
 * becomes the note. Where the ingredient is named after what describes it ("grüne
 * Trauben", "frische Petersilie"), the longest run of words anywhere that names one wins, in
 * the singular or the plural too, and the other words are the note: the grapes are fruit
 * and add up with what the recipes need. Text that names no ingredient is kept exactly as
 * typed.
 */
export function parseFreeEntry(text: string, index: CatalogIndex): FreeEntry {
  const typed = text.trim().replace(/\s+/g, " ");
  let rest = typed;
  let quantity: number | null = null;
  let unit: Unit | null = null;

  const match = LEADING_QUANTITY.exec(typed);
  if (match && match[2] !== "") {
    quantity = Number(match[1].replace(",", "."));
    rest = match[2];
    const [first, ...others] = rest.split(" ");
    const parsed = others.length > 0 ? parseUnit(first) : null;
    if (parsed) {
      unit = parsed;
      rest = others.join(" ");
    } else {
      // A bare number counts pieces: "12 Tomaten".
      unit = "Stück";
    }
  }

  const words = rest.split(" ");
  for (let count = words.length; count >= 1; count--) {
    const ingredient = findIngredient(index, words.slice(0, count).join(" "));
    if (ingredient) {
      return {
        ingredient,
        label: ingredient.name,
        amount: quantity !== null && unit !== null ? { quantity, unit } : null,
        note: words.slice(count).join(" ") || null,
      };
    }
  }
  for (let count = words.length; count >= 1; count--) {
    for (let start = 1; start + count <= words.length; start++) {
      const run = words.slice(start, start + count).join(" ");
      const ingredient = nameVariants(run)
        .map((variant) => findIngredient(index, variant))
        .find((found) => found !== undefined);
      if (ingredient) {
        const others = [...words.slice(0, start), ...words.slice(start + count)];
        return {
          ingredient,
          label: ingredient.name,
          amount: quantity !== null && unit !== null ? { quantity, unit } : null,
          note: others.join(" ") || null,
        };
      }
    }
  }
  return { ingredient: null, label: typed, amount: null, note: null };
}
