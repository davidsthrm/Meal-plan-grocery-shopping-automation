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
  return wholeOfCut(index, line.name)?.ingredient ?? null;
}

/**
 * How a recipe names a part of something bought by the piece: "2 Zitronenscheiben",
 * "Zitronenachtel". A slice is counted in slices (`Scheibe`); an eighth or a quarter is that
 * part of a piece. Halves are left out: "Pfirsichhälften" and "Paprikahälften" come in a tin
 * or a jar, a product of their own.
 */
export type Cut = "Scheibe" | "Achtel" | "Viertel";

const CUT_ENDINGS: readonly { ending: string; cut: Cut }[] = [
  { ending: "scheiben", cut: "Scheibe" },
  { ending: "scheibe", cut: "Scheibe" },
  { ending: "achtel", cut: "Achtel" },
  { ending: "viertel", cut: "Viertel" },
];

/** The part of a piece each cut is, where that is a fixed part. */
export const PART_OF_PIECE: Partial<Record<Cut, number>> = {
  Achtel: 1 / 8,
  Viertel: 1 / 4,
};

/**
 * The ingredient a cut of it is named after, when it is bought by the piece:
 * "Zitronenscheiben" are lemons, "Bio-Orangenscheiben" oranges. Null for any other name, and
 * for a product of its own that the catalog sells in slices ("Toastscheiben", "Käsescheiben").
 */
export function wholeOfCut(
  index: CatalogIndex,
  name: string,
): { ingredient: Ingredient; cut: Cut } | null {
  const typed = name.trim();
  const match = CUT_ENDINGS.find(({ ending }) => typed.toLowerCase().endsWith(ending));
  if (!match) return null;
  // "Zitronen-Scheiben" and "Zitronen Scheiben" too.
  const head = typed.slice(0, typed.length - match.ending.length).replace(/[-\s]+$/, "");
  if (head.length < 4) return null;
  for (const variant of nameVariants(head)) {
    const found = findIngredient(index, variant);
    if (found && found.buyingMode === "count" && found.defaultUnit === "Stück") {
      return { ingredient: found, cut: match.cut };
    }
  }
  return null;
}

/**
 * A recipe line that names a cut, as an amount of the whole: two slices stay two slices, two
 * eighths are a quarter of a piece. A line without a quantity, or in another unit, is left
 * as it is.
 */
export function amountOfCut<
  T extends { quantity: number | null; quantityMax: number | null; unit: string | null },
>(line: T, cut: Cut): T {
  if (line.quantity === null) return line;
  if (line.unit !== null && line.unit !== "Stück" && line.unit !== "Scheibe") return line;
  const part = PART_OF_PIECE[cut];
  if (part === undefined) return { ...line, unit: "Scheibe" };
  return {
    ...line,
    quantity: line.quantity * part,
    quantityMax: line.quantityMax === null ? null : line.quantityMax * part,
    unit: "Stück",
  };
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

/**
 * Words that say how a product is, not which product it is: its size, freshness or
 * ripeness, that it is organic, seedless or green. "kleines Bauernbrot" is bread, "grüne
 * Trauben" are grapes. A word that makes another product ("getrocknete Tomaten", "rote
 * Linsen") is not among them: such a name stays as it is and is proposed if unknown.
 */
const DESCRIBING = [
  "klein",
  "gross",
  "mittelgross",
  "frisch",
  "reif",
  "fest",
  "jung",
  "zart",
  "bio",
  "kernlos",
  "gruen",
];
const DECLENSION = ["", "e", "es", "er", "en", "em"];

function isDescribing(word: string): boolean {
  const key = normalizeName(word).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
  return DESCRIBING.some((root) => {
    const plain = root.replace(/ue/g, "u");
    return DECLENSION.some((ending) => key === plain + ending);
  });
}

/** A name without the describing words in front of it, and those words. */
export function describedName(text: string): { name: string; described: string[] } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const described: string[] = [];
  while (words.length > 1 && isDescribing(words[0])) described.push(words.shift() as string);
  return { name: words.join(" "), described };
}

/**
 * The ingredient a name means once the words that only describe it are left out, in the
 * singular or the plural too. Null when nothing was left out or the rest is unknown.
 */
export function mapDescribed(index: CatalogIndex, text: string): Ingredient | null {
  const { name, described } = describedName(text);
  if (described.length === 0) return null;
  for (const variant of nameVariants(name)) {
    const found = findIngredient(index, variant);
    if (found) return found;
  }
  return null;
}

/** Whether two names are the same product written differently, by the rules above. */
export function sameProductName(a: string, b: string): boolean {
  const forms = new Set(nameVariants(a).map(normalizeName));
  return nameVariants(b).some((variant) => forms.has(normalizeName(variant)));
}

/**
 * The ingredients a name stands for when it joins several the catalog knows one by one:
 * "Salz und Pfeffer", "Salz & Pfeffer", "Pfeffer, Salz". Null for a name that is one thing:
 * a single ingredient, a product the catalog has under the joined name, or a name with a part
 * the catalog does not know ("Zwiebeln, gewürfelt").
 */
export function splitJoinedName(index: CatalogIndex, name: string): Ingredient[] | null {
  if (findIngredient(index, name)) return null;
  const parts = name
    .split(/\s*(?:,|&|\+|\/|\bund\b|\bsowie\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const found = parts.map((part) => mapToCatalog(index, { raw: part, name: part }));
  if (found.some((ingredient) => ingredient === null)) return null;
  // "Salz, Salz" is one ingredient, however often it is named.
  const unique = [...new Map((found as Ingredient[]).map((i) => [i.id, i])).values()];
  return unique.length < 2 ? null : unique;
}
