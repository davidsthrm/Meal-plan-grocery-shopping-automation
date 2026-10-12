import { z } from "zod";
import { findIngredient, type CatalogIndex } from "../catalog";
import type { RecipeIngredient, Servings } from "../recipe";
import { parseQuantity } from "../quantity";
import { isUnit, type Unit } from "../units";
import { mapToCatalog } from "./map-ingredient";
import { meansPersons, SERVINGS_UNIT_MAX_LENGTH } from "./servings";

/**
 * What the household submits when it reviews an imported recipe, and the check of it.
 * Everything arrives as typed text and is read again here; the form is not trusted.
 */

/** A reviewed line: a recipe line plus the ingredient name as typed. */
export type ReviewedLine = RecipeIngredient & { readName: string };

const lineInput = z.object({
  quantity: z.string(),
  quantityMax: z.string(),
  unit: z.string(),
  ingredient: z.string(),
  note: z.string(),
  optional: z.boolean(),
  approximate: z.boolean(),
  /** Position of the line this one is an alternative to, among the submitted lines. */
  alternativeTo: z.number().int().nullable(),
  originalText: z.string(),
  secondary: z
    .object({
      quantity: z.number(),
      unit: z.string(),
      scope: z.enum(["total", "perPiece"]).nullable(),
    })
    .nullable(),
});

export const reviewInput = z.object({
  title: z.string(),
  sourceBook: z.string(),
  sourcePage: z.string(),
  servingsMin: z.string(),
  servingsMax: z.string(),
  /** What the recipe counts when it is not persons: "Springform", "Stück". Empty for persons. */
  servingsUnit: z.string().default(""),
  prepMinutes: z.string(),
  lines: z.array(lineInput),
});

export type ReviewInput = z.infer<typeof reviewInput>;
export type ReviewLineInput = z.infer<typeof lineInput>;

/** Messages for the form, by field name or "line <n>". */
export type ReviewErrors = Record<string, string>;

function wholeNumber(text: string): number | null | undefined {
  const typed = text.trim();
  if (typed === "") return null;
  return /^\d+$/.test(typed) ? Number(typed) : undefined;
}

/** Checks what was typed and turns it into recipe lines, or says what is wrong where. */
export function readReview(
  input: ReviewInput,
  index: CatalogIndex,
):
  | {
      ok: true;
      lines: ReviewedLine[];
      servings: Servings;
      page: number | null;
      prep: number | null;
    }
  | { ok: false; errors: ReviewErrors } {
  const errors: ReviewErrors = {};
  if (input.title.trim() === "") errors.title = "Bitte einen Titel eingeben.";

  const min = wholeNumber(input.servingsMin);
  const max = wholeNumber(input.servingsMax);
  if (!min) errors.servingsMin = "Für wie viele Portionen ist das Rezept?";
  if (max === undefined || (max !== null && min && max < min)) {
    errors.servingsMax = "Muss eine Zahl sein und nicht kleiner als die erste.";
  }
  // "Personen" typed into the unit is what an empty unit already means.
  const typedUnit = input.servingsUnit.trim().replace(/\s+/g, " ");
  const unit = typedUnit === "" || meansPersons(typedUnit) ? null : typedUnit;
  if (unit !== null && unit.length > SERVINGS_UNIT_MAX_LENGTH) {
    errors.servingsUnit = `Höchstens ${SERVINGS_UNIT_MAX_LENGTH} Zeichen.`;
  }
  const page = wholeNumber(input.sourcePage);
  if (page === undefined) errors.sourcePage = "Die Seite muss eine Zahl sein.";
  const prep = wholeNumber(input.prepMinutes);
  if (prep === undefined || prep === 0) errors.prepMinutes = "Die Zeit in Minuten, als Zahl.";

  if (input.lines.length === 0) errors.lines = "Ein Rezept braucht mindestens eine Zutat.";
  const lines = input.lines.map((line, at): ReviewedLine => {
    const fail = (message: string) => {
      errors[`line ${at}`] = message;
    };
    const quantity = parseQuantity(line.quantity);
    const quantityMax = parseQuantity(line.quantityMax);
    const name = line.ingredient.trim();
    if (name === "") fail("Welche Zutat ist das?");
    if (quantity === undefined || quantityMax === undefined) fail("Die Menge ist keine Zahl.");
    else if (quantity !== null && quantity <= 0) fail("Die Menge muss größer als 0 sein.");
    else if (quantity === null && quantityMax !== null) fail("Bei „bis“ fehlt die erste Menge.");
    else if (quantity !== null && quantityMax !== null && quantityMax <= quantity) {
      fail("Die zweite Menge muss größer sein als die erste.");
    } else if (quantity !== null && !isUnit(line.unit)) fail("Zur Menge fehlt die Einheit.");

    // The catalog name as typed, or the longest part of the printed line that the catalog knows.
    const ingredient =
      findIngredient(index, name) ?? mapToCatalog(index, { raw: name, name }) ?? null;
    const secondary =
      line.secondary && isUnit(line.secondary.unit)
        ? { ...line.secondary, unit: line.secondary.unit as Unit }
        : null;
    return {
      ingredientId: ingredient?.id ?? null,
      quantity: quantity ?? null,
      quantityMax: quantity != null ? (quantityMax ?? null) : null,
      unit: quantity != null && isUnit(line.unit) ? line.unit : null,
      approximate: line.approximate,
      secondary,
      alternativeTo:
        line.alternativeTo !== null &&
        line.alternativeTo >= 0 &&
        line.alternativeTo < input.lines.length
          ? line.alternativeTo
          : null,
      optional: line.optional,
      originalText: line.originalText.trim() || name,
      note: line.note.trim() || null,
      readName: name,
    };
  });

  if (Object.keys(errors).length > 0 || !min) return { ok: false, errors };
  return {
    ok: true,
    lines,
    servings: { min, max: max ?? min, unit },
    page: page ?? null,
    prep: prep ?? null,
  };
}
