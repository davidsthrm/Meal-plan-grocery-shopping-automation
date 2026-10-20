import { normalizeName, type CatalogIndex } from "../catalog";
import type { RecipeIngredient, Servings } from "../recipe";
import { COUNT_UNITS, type Unit } from "../units";
import type { ExtractedRecipe } from "./extraction";
import { amountOfCut, mapToCatalog, wholeOfCut } from "./map-ingredient";
import { resolveServings } from "./servings";
import { cleanSteps } from "./steps";

/** What the household entered on the upload form because a photo cannot show it. */
export interface ProvidedMetadata {
  title?: string | null;
  book?: string | null;
  page?: number | null;
  /**
   * Whether the first look at the pages saw preparation steps for this recipe. Null or left
   * out when it is not known.
   */
  stepsShown?: boolean | null;
}

/** A recipe line on its way into the library, with the name as it was read. */
export interface DraftIngredient extends RecipeIngredient {
  /** The ingredient name as read from the photo. Kept for proposing unknown ingredients. */
  readName: string;
  /** True when the model could not read part of the line with certainty. */
  unclear: boolean;
}

/** A recipe as read and mapped, before anyone has decided whether it can be trusted. */
export interface RecipeDraft {
  /** What the household calls it: their own title, or the printed one. */
  title: string | null;
  /** Title as printed. Null when it is not on the photos. */
  sourceTitle: string | null;
  sourceBook: string | null;
  sourcePage: number | null;
  servings: Servings | null;
  prepMinutes: number | null;
  dishType: ExtractedRecipe["dishType"];
  proteinType: ExtractedRecipe["proteinType"];
  ingredients: DraftIngredient[];
  /** The preparation steps as read, one per printed step. Empty when none were read. */
  steps: string[];
}

const blank = (text: string | null | undefined) =>
  text && text.trim() !== "" ? text.trim() : null;

/** "2 Stiele Petersilie", "Blätter von 8 Stielen Minze": an amount printed in stalks. */
const PRINTED_STALKS = /\d\s*Stiel(?:e|en)?\s/i;
/** The word for stalks in a note, with the amount in front of it ("je 2 Stiele"). */
const STALK_WORD = /(?:\bje\s+)?(?:[\d½¼¾][\d½¼¾,.\s–-]*)?\bStiel(?:e|en)?\b(?!-)/gi;

/**
 * A line printed in stalks ("Stiel", "Stiele") is counted in Stängel, the unit of the app,
 * and the word does not stay in its note: "3 Stiele Thymian" is 3 Stängel Thymian, not
 * Thymian with the note "Stiele". Other units and lines are left as they are.
 */
export function stalksAsStaengel<
  T extends { raw: string; quantity: number | null; unit: string | null; note: string | null },
>(line: T): T {
  if (line.quantity === null || !PRINTED_STALKS.test(line.raw)) return line;
  if (line.unit !== null && line.unit !== "Stück" && line.unit !== "Stängel") return line;
  const note = line.note
    // What the reading said about the unit goes with the word: "gedruckt als Stiele",
    // "Stiele (Einheit nicht in der Liste)".
    ?.replace(/\(?[^(),]*\bEinheit\b[^(),]*\)?/gi, " ")
    .replace(/\bgedruckt als\s+/gi, "")
    .replace(STALK_WORD, " ")
    .replace(/\s*,(\s*,)+/g, ",")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "");
  return { ...line, unit: "Stängel", note: note ? note : null };
}

/**
 * Turns what a model read into a recipe draft: maps every line to the catalog and fills in
 * what the household provided. Nothing is invented here. A line the catalog does not know
 * keeps `ingredientId` null.
 */
export function toDraft(
  extracted: ExtractedRecipe,
  provided: ProvidedMetadata,
  index: CatalogIndex,
): RecipeDraft {
  const ingredients = extracted.ingredients.map((read): DraftIngredient => {
    const ingredient = mapToCatalog(index, read);
    // "2 Zitronenscheiben" are two slices of a lemon, "Zitronenachtel" an eighth of one.
    const cut = ingredient ? wholeOfCut(index, read.name) : null;
    const line = stalksAsStaengel(
      cut && cut.ingredient.id === ingredient?.id ? amountOfCut(read, cut.cut) : read,
    );
    let unit = line.unit as Unit | null;
    // "1 Knoblauchzehe" is read as one piece. For an ingredient counted in cloves, bunches or
    // leaves, a piece named after that unit is that unit.
    if (
      unit === "Stück" &&
      ingredient &&
      ingredient.defaultUnit !== "Stück" &&
      (COUNT_UNITS as readonly string[]).includes(ingredient.defaultUnit) &&
      normalizeName(line.name).includes(normalizeName(ingredient.defaultUnit))
    ) {
      unit = ingredient.defaultUnit;
    }
    const hasSecondary = line.secondaryQuantity !== null && line.secondaryUnit !== null;
    return {
      ingredientId: ingredient?.id ?? null,
      quantity: line.quantity,
      quantityMax: line.quantityMax,
      // A quantity without a known unit stays as read; the checks flag it.
      unit: line.quantity === null ? null : unit,
      approximate: line.approximate,
      secondary: hasSecondary
        ? {
            quantity: line.secondaryQuantity as number,
            unit: line.secondaryUnit as Unit,
            scope:
              line.secondaryScope === "total" || line.secondaryScope === "perPiece"
                ? line.secondaryScope
                : null,
          }
        : null,
      alternativeTo: line.alternativeTo,
      optional: line.optional,
      originalText: line.raw,
      note: blank(line.note),
      readName: line.name,
      unclear: line.unclear,
    };
  });

  return {
    title: blank(provided.title) ?? blank(extracted.title),
    sourceTitle: blank(extracted.title),
    sourceBook: blank(provided.book),
    sourcePage: provided.page ?? extracted.page,
    servings: resolveServings(extracted),
    prepMinutes: extracted.prepMinutes,
    dishType: extracted.dishType,
    proteinType: extracted.proteinType,
    ingredients,
    // A reading stored before steps were read has none.
    steps: cleanSteps(extracted.steps ?? []),
  };
}
