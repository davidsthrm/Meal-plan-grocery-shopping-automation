import { parseIngredientLine } from "./library/typed-recipe";
import { parseQuantity } from "./quantity";
import { dimensionOf, parseUnit, type Unit } from "./units";

/**
 * A recipe cooked for more or fewer than it was written for: its amounts, in the list of
 * ingredients and inside the steps, scaled by the same factor as the shopping list
 * (`scaleFactor`) and rounded to what a cook measures. "2 Eier unterrühren" for 4 reads
 * "3 Eier unterrühren" for 6.
 *
 * A number in a step is an amount only when it says what of: a weight or a volume ("200 g",
 * "½ TL"), a counted unit with one of the recipe's ingredients behind it ("1 Dose Tomaten"),
 * or one of the ingredients itself ("2 Eier"). Times, temperatures, sizes and anything else
 * ("20 Min.", "180 °C", "Ø 26 cm", "in 4 Portionen teilen", "in 2 Stücke schneiden") stay as
 * written. Where the words around a number would have to change and it is not known how,
 * the step stays as written too: never a guess.
 */

/** An ingredient of the recipe as a step may name it. */
export interface StepIngredient {
  /** The names it goes by: the catalog's name and other names, or the printed line's nouns. */
  names: readonly string[];
  /** Its word for one piece and for several, where both are known ("Ei", "Eier"). */
  one?: string;
  many?: string;
}

/** A piece of a step: as written, or an amount scaled, with what was written there. */
export type StepPart = string | { text: string; original: string };

/**
 * A line of the ingredients scaled: both ends of a range, rounded as a cook measures. A range
 * that rounds to one number is that number.
 */
export function scaleLine(
  quantity: number | null,
  quantityMax: number | null,
  unit: Unit | null,
  factor: number,
): { quantity: number | null; quantityMax: number | null } {
  if (quantity === null || Math.abs(factor - 1) < 1e-9) return { quantity, quantityMax };
  const low = cookingAmount(quantity * factor, unit);
  const high = quantityMax === null ? null : cookingAmount(quantityMax * factor, unit);
  return { quantity: low, quantityMax: high !== null && high > low ? high : null };
}

/** Rounds a scaled amount to what a cook measures: no "1,33 Eier", no "133,33 g". */
export function cookingAmount(quantity: number, unit: Unit | null): number {
  if (quantity <= 0) return quantity;
  if (unit === "kg" || unit === "l") return roundWeight(quantity * 1000) / 1000;
  if (unit === "g" || unit === "ml") return roundWeight(quantity);
  if (unit === "EL" || unit === "TL")
    return quantity < 1 ? fraction(quantity, true) : nearest(quantity, 0.5);
  if (unit === "Prise" || unit === "Msp" || unit === "Handvoll")
    return Math.max(1, Math.round(quantity));
  // Pieces and other counted units: whole ones, and a fraction below one ("½ Zwiebel").
  return quantity < 1 ? fraction(quantity) : Math.round(quantity);
}

/** Grams or millilitres: 7 g, 135 g, 330 g, 1150 g. */
function roundWeight(quantity: number): number {
  const step = quantity < 10 ? 1 : quantity <= 100 ? 5 : quantity <= 1000 ? 10 : 50;
  return nearest(quantity, step);
}

/**
 * Below one: the nearest of the fractions a cookbook prints, the larger one of two as near.
 * A spoon has no thirds.
 */
function fraction(quantity: number, spoon = false): number {
  const choices = spoon
    ? [1 / 8, 1 / 4, 1 / 2, 3 / 4, 1]
    : [1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
  return choices.reduce((best, choice) =>
    Math.abs(choice - quantity) <= Math.abs(best - quantity) + 1e-9 ? choice : best,
  );
}

/** The nearest multiple of `step`, at least one step. */
function nearest(quantity: number, step: number): number {
  return Math.max(step, Math.round(quantity / step + 1e-9) * step);
}

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

/**
 * A number as a cookbook prints it: "3", "1½", "¼", and weights and volumes in decimals,
 * "1,5 l", "1,15 kg".
 */
export function cookingNumber(value: number, unit: Unit | null = null): string {
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (rest < 1e-6) return String(whole);
  if (
    unit !== null &&
    ["mass", "volume"].includes(dimensionOf(unit)) &&
    unit !== "EL" &&
    unit !== "TL"
  ) {
    return String(Math.round(value * 100) / 100).replace(".", ",");
  }
  const fraction = FRACTIONS.find(([part]) => Math.abs(part - rest) < 1e-6);
  if (fraction) return `${whole > 0 ? whole : ""}${fraction[1]}`;
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

const WORD_NUMBERS: Record<string, number> = {
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
};

const VULGAR = "½¼¾⅓⅔⅛";
const NUMBER = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d*[${VULGAR}]|\d{1,3}(?:\.\d{3})+(?![\d,])|\d+(?:,\d+)?`;
const WORDS = Object.keys(WORD_NUMBERS).join("|");
/**
 * A number or a range of two, not inside a word, a code or another number. "Ein" and "eine"
 * are left alone: mostly they are an article ("einen Topf"), and as one piece the noun after
 * them would have to change too.
 */
const AMOUNT = new RegExp(
  String.raw`(?<![\p{L}\d.,/°Ø${VULGAR}–-])(${NUMBER}|${WORDS})(?:(\s*(?:–|—|-|bis)\s*)(${NUMBER}|${WORDS}))?(?![\d${VULGAR}]|[.,]\d)`,
  "giu",
);
const PER_PIECE = /(?:^|[\s(])(?:je|jeweils|pro|à|a)\s*$/iu;
const WORD = /^(\s*)(\p{L}[\p{L}-]*\.?)/u;

/** Reads a number as printed: "2", "1,5", "½", "1½", "1 1/2", "1.000", "zwei". */
function readNumber(text: string): number | null {
  const word = WORD_NUMBERS[text.toLowerCase()];
  if (word !== undefined) return word;
  const value = parseQuantity(/^\d{1,3}(\.\d{3})+$/.test(text) ? text.replaceAll(".", "") : text);
  return typeof value === "number" && value > 0 ? value : null;
}

/** A word without umlauts and case, as names are compared. */
function fold(word: string): string {
  return word
    .toLowerCase()
    .replace(/\.$/, "")
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ß", "ss");
}

/** A word without the endings of its plural: "Tomaten" and "Tomate" are "tomat". */
function stem(word: string): string {
  const folded = fold(word);
  for (const ending of ["nen", "ern", "en", "er", "es", "e", "n", "s"]) {
    if (folded.endsWith(ending) && folded.length - ending.length >= 2) {
      return folded.slice(0, -ending.length);
    }
  }
  return folded;
}

/**
 * Whether a word of a step names an ingredient by one of its words: the same word in the
 * singular or plural, or a kind of it ("Cocktailtomaten" are Tomaten). Not the other way
 * round: "Würfel" in a step are no Speckwürfel.
 */
function sameThing(inStep: string, ofIngredient: string): boolean {
  const [word, name] = [stem(inStep), stem(ofIngredient)];
  return word === name || (name.length >= 4 && word.endsWith(name));
}

/**
 * Words after a number that say it is no amount: a size, a time, a temperature, how often,
 * how many plates. "2 cm große Würfel", "10 Min garen", "1–2 Tag alte Semmeln".
 */
const NO_AMOUNT = new Set(
  [
    "mm",
    "cm",
    "m",
    "zentimeter",
    "millimeter",
    "min",
    "minute",
    "minuten",
    "sek",
    "sekunde",
    "sekunden",
    "std",
    "stunde",
    "stunden",
    "tag",
    "tage",
    "tagen",
    "woche",
    "wochen",
    "grad",
    "mal",
    "portion",
    "portionen",
    "person",
    "personen",
    "teil",
    "teile",
    "stufe",
    "prozent",
  ].map(fold),
);

/** What a recipe is baked or served in is no ingredient: "2 Springformen", "4 Förmchen". */
const VESSEL =
  /(form|formen|formchen|blech|bleche|schussel|schusseln|teller|topf|topfe|pfanne|pfannen)$/;

/**
 * Words between a number and a noun that make it a share, not an amount: "⅔ der Kräuter",
 * "¼ vom Käse", "2 von den Eiern".
 */
const SHARE = new Set(
  ["der", "die", "das", "des", "dem", "den", "vom", "von", "davon", "und", "oder", "je", "pro"].map(
    fold,
  ),
);

/** The recipe's ingredient a word of a step names, if any. */
function ingredientNamed(
  word: string,
  ingredients: readonly StepIngredient[],
): StepIngredient | null {
  const bare = word.replace(/\.$/, "");
  if (bare.length < 2) return null;
  return (
    ingredients.find((ingredient) =>
      ingredient.names.some((name) =>
        name.split(/[\s,()/]+/).some((part) => part.length >= 2 && sameThing(bare, part)),
      ),
    ) ?? null
  );
}

/**
 * The noun right after a number or a unit, past up to two words that describe it ("2 große
 * Eier", "1 Dose gehackte Tomaten"), where it is one of the recipe's ingredients.
 */
function nounAfter(
  text: string,
  ingredients: readonly StepIngredient[],
): {
  ingredient: StepIngredient;
  word: string;
  start: number;
  end: number;
  described: boolean;
} | null {
  let at = 0;
  for (let words = 0; words < 3; words += 1) {
    const found = WORD.exec(text.slice(at));
    if (!found) return null;
    // A full stop after a noun ends the sentence; it is no part of the word.
    const word = found[2].replace(/\.$/, "");
    const start = at + found[1].length;
    const end = start + word.length;
    if (words > 0 && found[1] === "") return null;
    if (NO_AMOUNT.has(fold(word)) || SHARE.has(fold(word)) || VESSEL.test(fold(word))) return null;
    const ingredient = ingredientNamed(word, ingredients);
    if (ingredient) return { ingredient, word, start, end, described: words > 0 };
    // Only an adjective describes what follows ("große", "gehackten"); a noun that is no
    // ingredient, a word such as "mit" or the end of a sentence ends it.
    if (word[0] !== word[0].toLowerCase() || found[2].endsWith(".")) return null;
    if (!/(e|en|er|es|em)$/.test(word)) return null;
    at = end;
  }
  return null;
}

/** The singular or plural of a unit as a cookbook writes it out. */
const UNIT_WORDS: Partial<Record<Unit, [string, string]>> = {
  Zehe: ["Zehe", "Zehen"],
  Zweig: ["Zweig", "Zweige"],
  Blatt: ["Blatt", "Blätter"],
  Scheibe: ["Scheibe", "Scheiben"],
  Dose: ["Dose", "Dosen"],
  Glas: ["Glas", "Gläser"],
  Packung: ["Packung", "Packungen"],
  Kopf: ["Kopf", "Köpfe"],
  Knolle: ["Knolle", "Knollen"],
  Stange: ["Stange", "Stangen"],
  Prise: ["Prise", "Prisen"],
  Stängel: ["Stängel", "Stängel"],
  Würfel: ["Würfel", "Würfel"],
  Becher: ["Becher", "Becher"],
  Beutel: ["Beutel", "Beutel"],
  Bund: ["Bund", "Bund"],
  Handvoll: ["Handvoll", "Handvoll"],
};

/**
 * A word that says one or several in the other number: the unit written out, or the
 * ingredient's own word for one and for several. Undefined where it is not known.
 */
function otherForm(
  word: string,
  many: boolean,
  forms: [string, string] | undefined,
): string | undefined {
  if (!forms) return undefined;
  const [one, several] = forms;
  const folded = fold(word);
  if (folded === fold(one) || folded === fold(several)) return many ? several : one;
  return undefined;
}

/**
 * The step with its amounts scaled by `factor`. Every amount that changed is a part of its
 * own with what was written there; the rest is as written. A factor of 1 changes nothing.
 */
export function scaleStep(
  text: string,
  factor: number,
  ingredients: readonly StepIngredient[],
): StepPart[] {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return [text];
  const parts: StepPart[] = [];
  let written = 0;
  for (const match of text.matchAll(AMOUNT)) {
    const start = match.index;
    const end = start + match[0].length;
    // "je 2 Scheiben", "à 150 g": so much for every piece, whose number is what scales.
    if (PER_PIECE.test(text.slice(0, start))) continue;
    const scaled = scaleAmount(match, text.slice(end), factor, ingredients);
    if (!scaled) continue;
    if (start > written) parts.push(text.slice(written, start));
    parts.push({ text: scaled.text, original: text.slice(start, end + scaled.consumed) });
    written = end + scaled.consumed;
  }
  if (written < text.length) parts.push(text.slice(written));
  return parts.length > 0 ? parts : [text];
}

/** Units whose word is the same for one and for several, and those that are no word. */
const SAME_FOR_SEVERAL = new Set<Unit>([
  "g",
  "kg",
  "ml",
  "l",
  "EL",
  "TL",
  "Msp",
  "Stück",
  "Stängel",
  "Würfel",
  "Becher",
  "Beutel",
  "Bund",
  "Handvoll",
]);

/** Scaled text of one amount, and how much of the text after the numbers it takes along. */
function scaleAmount(
  match: RegExpMatchArray,
  after: string,
  factor: number,
  ingredients: readonly StepIngredient[],
): { text: string; consumed: number } | null {
  const [, lowText, separator, highText] = match;
  const isWord = (value: string | undefined) =>
    value !== undefined && WORD_NUMBERS[value.toLowerCase()] !== undefined;
  // "zweimal" is no amount: a number written out stands alone as a word.
  if ((isWord(lowText) || isWord(highText)) && /^\p{L}/u.test(after)) return null;
  const low = readNumber(lowText);
  const high = highText === undefined ? null : readNumber(highText);
  if (low === null || (highText !== undefined && (high === null || high <= low))) return null;

  const first = WORD.exec(after);
  const unit = first ? unitOf(first[2]) : null;
  // Only a unit stands right against its number: "200g", but "6er-Muffinform" is a size.
  if (first && first[1] === "" && unit === null) return null;
  const unitEnd = unit !== null && first ? first[1].length + first[2].length : 0;
  const measured = unit !== null && ["mass", "volume"].includes(dimensionOf(unit));
  // A weight or a volume is an amount of something. Anything else counts only with an
  // ingredient behind it: "in 2 Stücke schneiden" cuts, "2 Stück Ingwer" is an amount.
  const noun = measured ? null : nounAfter(after.slice(unitEnd), ingredients);
  if (!measured && !noun) return null;

  const newLow = cookingAmount(low * factor, unit);
  const newHigh = high === null ? null : cookingAmount(high * factor, unit);
  if (newLow === low && newHigh === high) return null;
  const range = newHigh !== null && newHigh > newLow;
  const numbers = range
    ? `${cookingNumber(newLow, unit)}${separator}${cookingNumber(newHigh, unit)}`
    : cookingNumber(newLow, unit);
  const several = (range ? newHigh : newLow) > 1;

  // The words after the number stay as they are, unless one became several or the other way.
  if (several === (high ?? low) > 1 || (unit !== null && SAME_FOR_SEVERAL.has(unit))) {
    return { text: numbers, consumed: 0 };
  }
  if (unit !== null && first) {
    // "1 Dose" for twice as many is "2 Dosen"; an abbreviation stays ("2 Pck.").
    const word = first[2];
    const form = word.endsWith(".") ? word : otherForm(word, several, UNIT_WORDS[unit]);
    if (form === undefined) return null;
    return { text: `${numbers}${first[1]}${form}`, consumed: unitEnd };
  }
  // "1 Ei" for three times as many is "3 Eier", where the catalog knows both words. A word
  // that describes it would change its ending too ("1 großes Ei", "3 große Eier").
  if (!noun || noun.described) return null;
  const { one, many } = noun.ingredient;
  const form = otherForm(noun.word, several, one && many ? [one, many] : undefined);
  if (form === undefined) return null;
  return { text: `${numbers}${after.slice(0, noun.start)}${form}`, consumed: noun.end };
}

/** The unit a word after a number is, where it is one. "x" is none here: "2x umrühren". */
function unitOf(word: string): Unit | null {
  if (fold(word) === "x") return null;
  return parseUnit(word);
}

/**
 * The ingredients of a recipe as its steps may name them: a known ingredient by its names
 * and its words for one and several, a line the catalog does not know by the nouns of its
 * printed text.
 */
export function stepIngredients(
  lines: readonly {
    known: { name: string; synonyms: readonly string[]; one: string } | null;
    originalText: string;
  }[],
): StepIngredient[] {
  return lines.map(({ known, originalText }) => {
    // The product's name alone, not what its note says ("Brötchen, vom Vortag").
    const product = (parseIngredientLine(originalText)?.name ?? originalText).split(
      /\s(?:für|zum|zur|von|vom|aus|mit|ohne|in|auf)\s/u,
    )[0];
    const printed = (product.match(/\p{Lu}[\p{L}-]{2,}/gu) ?? []).filter(
      (word) => parseUnit(word) === null && !NO_AMOUNT.has(fold(word)),
    );
    if (!known) return { names: printed };
    return {
      names: [known.name, ...known.synonyms, ...printed],
      ...(known.one !== known.name ? { one: known.one, many: known.name } : {}),
    };
  });
}
