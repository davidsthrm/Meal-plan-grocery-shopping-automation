import { findIngredient, normalizeName, type CatalogIndex, type Ingredient } from "../catalog";
import { describedName, nameVariants } from "../import/map-ingredient";
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
 * The longest leading run of words that names a catalog ingredient wins, in the singular or
 * the plural too, and the rest becomes the note. Words in front that only describe it
 * ("grüne Trauben", "kleines Bauernbrot", `describedName`) are left out for finding it and
 * kept in the note: the grapes are fruit and add up with what the recipes need. Text that
 * names no ingredient keeps its name as typed, a number in front as its amount: "4
 * Ingwer-Shots" are 4 pieces of "Ingwer-Shots".
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

  const amount = quantity !== null && unit !== null ? { quantity, unit } : null;
  /** The longest leading run of `words` that names an ingredient, and what follows it. */
  const leading = (words: string[]) => {
    for (let count = words.length; count >= 1; count--) {
      const run = words.slice(0, count).join(" ");
      // "Bio" is left out only as a describing word below, so that the note keeps it.
      const ingredient = (/^bio[-\s]/i.test(run) ? [run] : nameVariants(run))
        .map((variant) => findIngredient(index, variant))
        .find((found) => found !== undefined);
      if (ingredient) return { ingredient, rest: words.slice(count) };
    }
    return null;
  };
  // The name as written first: "kleine Tomaten" is a product of its own.
  const { name, described } = describedName(rest);
  const found =
    leading(rest.split(" ")) ??
    (described.length > 0 ? mapped(leading(name.split(" ")), described) : null);
  if (found) {
    return {
      ingredient: found.ingredient,
      label: found.ingredient.name,
      amount,
      note: found.rest.join(" ") || null,
    };
  }
  // A number that stands apart is an amount: "4 Ingwer-Shots", "2x Tee". In "2in1 Shampoo" it
  // is part of the name.
  if (amount && /^\d+(?:[.,]\d+)?(?:\s|x\s)/i.test(typed)) {
    return { ingredient: null, label: rest, amount, note: null };
  }
  return { ingredient: null, label: typed, amount: null, note: null };
}

/** A match found behind describing words keeps those words in front of its note. */
function mapped<T extends { rest: string[] }>(found: T | null, described: string[]): T | null {
  return found ? { ...found, rest: [...described, ...found.rest] } : null;
}

/** The shortest catalog name a compound may end with: "Vollmilch" in "milch", not "Ei". */
const HEAD_MIN = 4;

/**
 * The kind of grocery a typed line the catalog does not know probably is, from the end of
 * its last word: a German compound names what it is last. "Bio-Vollmilch" ends with
 * "Milch" and is dairy, "Pestonudeln" pasta; "Ingwer-Shots" end with nothing the catalog
 * knows and stay unsorted, though they start with ginger. The longest such ending wins.
 * Null where none fits: the line stands under "Sonstiges" until the household says.
 */
export function guessKind(text: string, index: CatalogIndex): string | null {
  const words = parseFreeEntry(text, index)
    .label.split(/[\s-]+/)
    .filter(Boolean);
  const last = normalizeName(words.at(-1) ?? "");
  if (last.length < HEAD_MIN) return null;
  let best: { length: number; aisleGroupId: string } | null = null;
  for (const [name, ingredient] of index.ingredientByName) {
    if (name.length < HEAD_MIN || name.length > last.length || !last.endsWith(name)) continue;
    if (!best || name.length > best.length) {
      best = { length: name.length, aisleGroupId: ingredient.aisleGroupId };
    }
  }
  return best?.aisleGroupId ?? null;
}
