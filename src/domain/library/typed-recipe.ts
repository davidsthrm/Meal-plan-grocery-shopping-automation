import type { CatalogIndex } from "../catalog";
import { DISH_TYPES, PROTEIN_TYPES } from "../import/extraction";
import { mapToCatalog, splitJoinedName } from "../import/map-ingredient";
import type { ReviewedLine } from "../import/review-input";
import { meansPersons, SERVINGS_UNIT_MAX_LENGTH } from "../import/servings";
import { readTypedSteps } from "../import/steps";
import { parseQuantity } from "../quantity";
import type { Servings } from "../recipe";
import { parseUnit, type Unit } from "../units";

/**
 * A recipe typed in by hand: "Pestonudeln" with three lines of ingredients, entered in a
 * minute without a photo. One ingredient per line, written as on a shopping note.
 */

export interface TypedLine {
  quantity: number | null;
  /** Upper bound of a range such as "2-3". */
  quantityMax: number | null;
  unit: Unit | null;
  name: string;
  note: string | null;
}

const NUMBER = String.raw`(?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]`;
const AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|bis)\s*(${NUMBER}))?\s*(.*)$`);

/**
 * Reads one typed line: "200 g Spaghetti", "1 Glas Pesto", "2-3 Tomaten", "½ Bund Basilikum",
 * "Zwiebeln, gewürfelt", "Parmesan". A number without a unit counts pieces. What follows a
 * comma is a note. Returns null for an empty line.
 */
export function parseIngredientLine(text: string): TypedLine | null {
  const typed = text.trim().replace(/\s+/g, " ");
  if (typed === "") return null;

  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit: Unit | null = null;
  let rest = typed;
  const amount = AMOUNT.exec(typed);
  const first = amount ? parseQuantity(amount[1].replace(/\s+(?=[½¼¾⅓⅔⅛])/, "")) : undefined;
  // "7 Kräuter Mischung" is an amount, "5-Minuten-Terrine" is a name: the number must stand
  // on its own.
  if (amount && first && amount[3] !== "" && !amount[3].startsWith("-")) {
    quantity = first;
    const upper = amount[2] ? parseQuantity(amount[2]) : null;
    quantityMax = upper && upper > first ? upper : null;
    rest = amount[3];
    const [word, ...others] = rest.split(" ");
    const known = others.length > 0 ? parseUnit(word) : null;
    if (known) {
      unit = known;
      rest = others.join(" ");
    } else {
      unit = "Stück";
    }
  }
  const comma = rest.indexOf(",");
  const name = (comma === -1 ? rest : rest.slice(0, comma)).trim();
  const note = comma === -1 ? "" : rest.slice(comma + 1).trim();
  return { quantity, quantityMax, unit, name, note: note || null };
}

/** The form as it arrives: every field as typed. */
export interface TypedRecipeInput {
  title: string;
  /** Key of a category, or empty. */
  category: string;
  /** One of the protein types, or empty for "not said". */
  protein: string;
  servings: string;
  servingsUnit: string;
  minutes: string;
  book: string;
  page: string;
  /** One ingredient per line. Null when the ingredients are not part of what is saved. */
  lines: string | null;
  /** The preparation steps, one per line. May be empty. */
  steps: string;
}

export interface TypedRecipe {
  title: string;
  sourceBook: string | null;
  sourcePage: number | null;
  servings: Servings;
  prepMinutes: number | null;
  dishType: (typeof DISH_TYPES)[number];
  proteinType: (typeof PROTEIN_TYPES)[number];
  /** Null when the ingredients are not part of what is saved. */
  lines: ReviewedLine[] | null;
  /** Null when none were typed. */
  steps: string[] | null;
}

/** Messages for the form, by field name. */
export type TypedRecipeErrors = Partial<Record<keyof TypedRecipeInput, string>>;

function whole(text: string): number | null | undefined {
  const typed = text.trim();
  if (typed === "") return null;
  return /^\d{1,4}$/.test(typed) ? Number(typed) : undefined;
}

/** Checks what was typed and turns it into a recipe, or says what is wrong where. */
export function readTypedRecipe(
  input: TypedRecipeInput,
  index: CatalogIndex,
): { ok: true; recipe: TypedRecipe } | { ok: false; errors: TypedRecipeErrors } {
  const errors: TypedRecipeErrors = {};
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title === "") errors.title = "Wie heißt das Gericht?";
  else if (title.length > 120) errors.title = "Höchstens 120 Zeichen.";

  const servings = whole(input.servings);
  if (!servings) errors.servings = "Für wie viele reicht es? Eine Zahl ab 1.";
  const typedUnit = input.servingsUnit.trim().replace(/\s+/g, " ");
  const unit = typedUnit === "" || meansPersons(typedUnit) ? null : typedUnit;
  if (unit && unit.length > SERVINGS_UNIT_MAX_LENGTH) {
    errors.servingsUnit = `Höchstens ${SERVINGS_UNIT_MAX_LENGTH} Zeichen.`;
  }
  const minutes = whole(input.minutes);
  if (minutes === undefined || minutes === 0) errors.minutes = "Die Zeit in Minuten, als Zahl.";
  const page = whole(input.page);
  if (page === undefined) errors.page = "Die Seite muss eine Zahl sein.";
  const steps = readTypedSteps(input.steps);
  if (!steps.ok) errors.steps = steps.error;

  let lines: ReviewedLine[] | null = null;
  if (input.lines !== null) {
    lines = [];
    for (const text of input.lines.split(/\r?\n/)) {
      const line = parseIngredientLine(text);
      if (!line) continue;
      if (line.name === "") {
        errors.lines = `„${text.trim()}“: Welche Zutat ist das?`;
        continue;
      }
      const original = text.trim().replace(/\s+/g, " ");
      // "Salz, Pfeffer" on one line is two ingredients, not salt with the remark "Pfeffer".
      const joined =
        line.quantity === null
          ? splitJoinedName(index, [line.name, line.note].filter(Boolean).join(", "))
          : null;
      if (joined) {
        for (const ingredient of joined) {
          lines.push({
            ingredientId: ingredient.id,
            quantity: null,
            quantityMax: null,
            unit: null,
            approximate: false,
            secondary: null,
            alternativeTo: null,
            optional: false,
            originalText: original,
            note: null,
            readName: ingredient.name,
          });
        }
        continue;
      }
      lines.push({
        ingredientId: mapToCatalog(index, { raw: line.name, name: line.name })?.id ?? null,
        quantity: line.quantity,
        quantityMax: line.quantityMax,
        unit: line.unit,
        approximate: false,
        secondary: null,
        alternativeTo: null,
        optional: false,
        originalText: original,
        note: line.note,
        readName: line.name,
      });
    }
    if (lines.length === 0 && !errors.lines) {
      errors.lines = "Mindestens eine Zutat, eine pro Zeile.";
    }
  }

  if (Object.keys(errors).length > 0 || !servings || !steps.ok) return { ok: false, errors };
  const dishType = (DISH_TYPES as readonly string[]).includes(input.category)
    ? (input.category as TypedRecipe["dishType"])
    : "unbekannt";
  const proteinType = (PROTEIN_TYPES as readonly string[]).includes(input.protein)
    ? (input.protein as TypedRecipe["proteinType"])
    : "unknown";
  return {
    ok: true,
    recipe: {
      title,
      sourceBook: input.book.trim() || null,
      sourcePage: page ?? null,
      servings: { min: servings, max: servings, unit },
      prepMinutes: minutes ?? null,
      dishType,
      proteinType,
      lines,
      steps: steps.steps,
    },
  };
}
