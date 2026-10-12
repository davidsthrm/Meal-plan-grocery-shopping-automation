import { convert, dimensionOf, type Unit } from "../units";
import type { RecipeDraft } from "./draft";
import type { ExtractedRecipe } from "./extraction";
import { readServingsLine } from "./servings";

/**
 * The automatic checks every imported recipe has to pass before it is approved without a
 * person looking at it. Any issue sends the recipe to the review queue.
 *
 * An ingredient the catalog does not know is deliberately not an issue. Nearly every recipe
 * of a new cookbook has one, and nothing about the recipe is doubtful: it was read
 * correctly. Unknown ingredients are collected as proposals and decided in one place.
 */

export type IssueCode =
  /** No title on the photos and none entered by the household. */
  | "title_missing"
  | "servings_missing"
  /** A servings line is printed, but the app cannot tell what it counts. */
  | "servings_unclear"
  | "no_ingredients"
  /** Only in recipes imported before unknown ingredients stopped being an issue. */
  | "unmapped_ingredient"
  /** The model could not read part of this line with certainty. */
  | "unclear_line"
  /** The model named something it could not decide. */
  | "model_uncertain"
  /** The amount per serving is far outside what recipes use. Likely a misread. */
  | "implausible_quantity"
  /** An amount without a unit the app knows ("1 Döschen"). It is kept as a count. */
  | "unit_missing"
  | "invalid_range"
  | "invalid_alternative"
  /** The second pass saw something different on the photo. */
  | "verification_disagrees"
  /** The model's answer could not be used at all. */
  | "read_failed"
  /** The recipe was read but could not be stored. A bug, shown instead of retried forever. */
  | "store_failed";

export interface ImportIssue {
  code: IssueCode;
  /** Position of the ingredient line, or null for the recipe as a whole. */
  ingredientIndex: number | null;
  detail: string;
}

/** Above these amounts per serving, a line is almost certainly misread. */
const MAX_PER_SERVING = {
  grams: 1000,
  millilitres: 1000,
  spoons: 6,
  pieces: 10,
  containers: 3,
} as const;

/**
 * A recipe that counts what it makes instead of persons (one cake tin, one tray) feeds about
 * this many. Without it, 1.5 kg of plums for one tray would look like a misreading.
 */
const PORTIONS_OF_A_COUNTED_RECIPE = 12;

const SPOONS: Unit[] = ["EL", "TL", "Prise", "Msp"];
const PIECES: Unit[] = ["Stück", "Zehe", "Scheibe", "Blatt", "Stängel", "Zweig"];

function limitFor(unit: Unit): { amount: (quantity: number) => number; max: number } {
  if (SPOONS.includes(unit)) return { amount: (q) => q, max: MAX_PER_SERVING.spoons };
  if (dimensionOf(unit) === "mass") {
    return { amount: (q) => convert(q, unit, "g") as number, max: MAX_PER_SERVING.grams };
  }
  if (dimensionOf(unit) === "volume") {
    return { amount: (q) => convert(q, unit, "ml") as number, max: MAX_PER_SERVING.millilitres };
  }
  if (PIECES.includes(unit)) return { amount: (q) => q, max: MAX_PER_SERVING.pieces };
  return { amount: (q) => q, max: MAX_PER_SERVING.containers };
}

export function checkDraft(draft: RecipeDraft, extracted: ExtractedRecipe): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const add = (code: IssueCode, ingredientIndex: number | null, detail: string) =>
    issues.push({ code, ingredientIndex, detail });

  if (draft.title === null) add("title_missing", null, "no title on the photos and none entered");
  if (draft.servings === null) add("servings_missing", null, "no servings on the photos");
  if (readServingsLine(extracted.servingsRaw).kind === "unclear") {
    add("servings_unclear", null, extracted.servingsRaw.trim());
  }
  if (draft.ingredients.length === 0) add("no_ingredients", null, "no ingredient lines were read");
  for (const item of extracted.uncertain) {
    // Doubt about how to file a recipe is no reason to read it again by hand.
    if (/^(dishType|proteinType)\b/i.test(item.field.trim())) continue;
    add("model_uncertain", null, `${item.field}: ${item.reason}`);
  }

  draft.ingredients.forEach((line, at) => {
    if (line.unclear) add("unclear_line", at, line.originalText);

    if (line.quantity !== null && line.unit === null) {
      add("unit_missing", at, line.originalText);
    }
    if (line.quantity !== null && line.quantity <= 0) {
      add("implausible_quantity", at, `${line.quantity} in "${line.originalText}"`);
    }
    if (
      line.quantityMax !== null &&
      (line.quantity === null || line.quantityMax <= line.quantity)
    ) {
      add("invalid_range", at, `${line.quantity} to ${line.quantityMax} in "${line.originalText}"`);
    }
    if (
      line.alternativeTo !== null &&
      (line.alternativeTo < 0 ||
        line.alternativeTo >= draft.ingredients.length ||
        line.alternativeTo === at)
    ) {
      add("invalid_alternative", at, `points at line ${line.alternativeTo}`);
    }

    if (line.quantity !== null && line.unit !== null && draft.servings !== null) {
      const { amount, max } = limitFor(line.unit);
      const portions =
        draft.servings.unit === null
          ? draft.servings.min
          : Math.max(draft.servings.min, PORTIONS_OF_A_COUNTED_RECIPE);
      const perServing = amount(line.quantityMax ?? line.quantity) / portions;
      if (perServing > max) {
        add(
          "implausible_quantity",
          at,
          `${line.quantityMax ?? line.quantity} ${line.unit} for ${draft.servings.min} ${draft.servings.unit ?? "servings"} in "${line.originalText}"`,
        );
      }
    }
  });
  return issues;
}
