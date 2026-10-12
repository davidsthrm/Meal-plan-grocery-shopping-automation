import type { Servings } from "../recipe";
import type { ExtractedRecipe } from "./extraction";

/**
 * What the printed servings line of a recipe counts. Most lines count persons ("Für 4
 * Personen"). Baking and finger food often count something else: "Zutaten für 1 Springform
 * (Ø 26 cm)", "ergibt ca. 30 Stück", "für 1 Blech". Scaled to the persons of a household, such
 * a recipe would bake four cakes, so the app has to know the difference.
 */
export type ServingsLine =
  /** Nothing is printed. */
  | { kind: "none" }
  /** The line counts persons or portions. Its numbers are the ones the model read. */
  | { kind: "persons" }
  /** The line counts something else, named in `unit` as printed. */
  | { kind: "counted"; min: number; max: number; unit: string }
  /** A line the app cannot interpret. Nothing is assumed about it; a person decides. */
  | { kind: "unclear" };

/** Longest text the unit of a recipe may have. The database enforces the same limit. */
export const SERVINGS_UNIT_MAX_LENGTH = 60;

/** Words in front of the number that say nothing about what is counted. */
const LEAD_INS = new Set([
  "zutaten",
  "rezept",
  "menge",
  "für",
  "ergibt",
  "reicht",
  "macht",
  "ca",
  "circa",
  "etwa",
  "ungefähr",
]);

const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einen: 1,
  einem: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  acht: 8,
  zehn: 10,
  zwölf: 12,
};

const LETTER = "a-zäöüß";
const PERSON_WORD = "person(?:en)?|portion(?:en)?|pers\\.?|port\\.?|essern?|erwachsenen?|tellern?";
/** A person word at the start of what follows the number: "Personen", "Port. als Vorspeise". */
const PERSONS_FIRST = new RegExp(`^(${PERSON_WORD})(?![${LETTER}])`, "i");
/** A person word anywhere, for lines without a leading number: "Personen: 4". */
const PERSONS_ANYWHERE = new RegExp(`(^|[^${LETTER}])(${PERSON_WORD})(?![${LETTER}])`, "i");
/** A time or a nutrition value that ended up in the servings line is not what a recipe makes. */
const NOT_A_YIELD = new RegExp(`^(min|minuten|std|stunden?|kcal|kj)(?![${LETTER}])`, "i");
/** Words that are written in lower case when a book prints the whole line in capitals. */
const LOWER_CASE = new Set([
  ...["cm", "mm", "ml", "cl", "l", "g", "kg", "ca"],
  ...["runde", "rundes", "kleine", "kleines", "große", "großes", "eckige", "flache", "tiefe"],
]);

/** True when a typed or printed unit means persons, which the app stores as no unit. */
export function meansPersons(unit: string): boolean {
  return PERSONS_FIRST.test(unit.trim());
}

/** "BACKBLECH" becomes "Backblech"; everything else stays as printed. */
function tidyUnit(text: string): string {
  const capitals = new RegExp(`(?<![${LETTER}])[A-ZÄÖÜ][A-ZÄÖÜẞ]+(?![${LETTER}])`, "g");
  return text
    .replace(/\s+/g, " ")
    .replace(/[\s:;,.]+$/, "")
    .replace(capitals, (word) =>
      LOWER_CASE.has(word.toLowerCase())
        ? word.toLowerCase()
        : word[0] + word.slice(1).toLowerCase(),
    );
}

/** Reads the servings line of a recipe as printed. */
export function readServingsLine(raw: string): ServingsLine {
  let rest = raw.trim();
  if (rest === "") return { kind: "none" };
  // "(für 4 Personen)"
  const bracketed = /^[([]\s*(.*?)\s*[)\]]$/.exec(rest);
  if (bracketed) rest = bracketed[1];

  for (;;) {
    const word = new RegExp(`^([${LETTER}]+)(?:[.:]\\s*|\\s+)`, "i").exec(rest);
    if (!word || !LEAD_INS.has(word[1].toLowerCase())) break;
    rest = rest.slice(word[0].length);
  }

  let min: number;
  let max: number;
  const digits = /^(\d{1,3})(?:\s*(?:[–—-]|bis)\s*(\d{1,3}))?(?=\s|[:.]?$)/i.exec(rest);
  const word = new RegExp(`^([${LETTER}]+)\\s+`, "i").exec(rest);
  if (digits) {
    min = Number(digits[1]);
    max = digits[2] === undefined ? min : Number(digits[2]);
    rest = rest.slice(digits[0].length);
  } else if (word && NUMBER_WORDS[word[1].toLowerCase()] !== undefined) {
    min = max = NUMBER_WORDS[word[1].toLowerCase()];
    rest = rest.slice(word[0].length);
  } else {
    // "Personen: 4" still counts persons. Anything else without a number in front is unknown.
    return PERSONS_ANYWHERE.test(rest) ? { kind: "persons" } : { kind: "unclear" };
  }

  const counted = rest.trim();
  // A bare number, or a number with a remark in brackets, counts persons: "für 4".
  if (/^[:.]?$/.test(counted) || counted.startsWith("(")) return { kind: "persons" };
  if (PERSONS_FIRST.test(counted)) return { kind: "persons" };
  // "1,5 l", "20 Min.": not something the app can count.
  if (!new RegExp(`^[${LETTER}]`, "i").test(counted) || NOT_A_YIELD.test(counted)) {
    return { kind: "unclear" };
  }
  const unit = tidyUnit(counted);
  if (min < 1 || max < min || unit.length > SERVINGS_UNIT_MAX_LENGTH) return { kind: "unclear" };
  return { kind: "counted", min, max, unit };
}

/**
 * The base amount of a recipe as it was read. When the printed line counts something other
 * than persons, the line decides: its number and what it counts. Otherwise the numbers are
 * the ones the model read, and they are persons.
 */
export function resolveServings(
  extracted: Pick<ExtractedRecipe, "servingsMin" | "servingsMax" | "servingsRaw">,
): Servings | null {
  const line = readServingsLine(extracted.servingsRaw);
  if (line.kind === "counted") return { min: line.min, max: line.max, unit: line.unit };
  if (extracted.servingsMin === null || extracted.servingsMax === null) return null;
  return { min: extracted.servingsMin, max: extracted.servingsMax, unit: null };
}
