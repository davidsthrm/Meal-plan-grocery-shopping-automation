import { normalizeName } from "../catalog";
import type { ExtractedIngredient, ExtractedRecipe } from "./extraction";

/**
 * Compares what a model read from a recipe photo with the hand-verified reading of the same
 * photo. Used to decide which model is good enough, on the household's own recipes.
 *
 * Amounts are compared strictly: a wrong quantity or unit puts the wrong thing on the
 * shopping list. Names are compared loosely, because where a descriptor ends and the name
 * begins is a judgment call.
 */

/** One ingredient line of the verified reading, as stored in the fixtures. */
export interface ExpectedIngredient {
  raw: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  name: string;
  approx: boolean;
  /** Present and true only where the recipe says the ingredient can be left out. */
  optional?: boolean;
  secondary: { quantity: number; unit: string; scope: string | null } | null;
  alternative: {
    quantity: number | null;
    quantityMax: number | null;
    unit: string | null;
    name: string;
  } | null;
}

export interface ExpectedRecipe {
  id: string;
  title: string | null;
  servings: { min: number; max: number };
  source: { page: number | null };
  prepTimeMinutes: number | null;
  ingredients: ExpectedIngredient[];
}

export interface Mistake {
  /** The printed line, or "recipe" for a recipe-level field. */
  where: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface Score {
  /** Ingredient lines in the verified reading, alternatives included. */
  expectedLines: number;
  /** Lines the model returned that match a verified line. */
  matchedLines: number;
  /** Verified lines the model did not return. */
  missing: string[];
  /** Lines the model returned that are not in the verified reading. */
  extra: string[];
  mistakes: Mistake[];
  perfect: boolean;
}

interface ExpectedLine {
  raw: string;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  approximate: boolean | null;
  optional: boolean;
  secondary: ExpectedIngredient["secondary"];
  isAlternative: boolean;
}

/** The fixtures nest an alternative in its main line; the model returns it as its own line. */
function expectedLines(recipe: ExpectedRecipe): ExpectedLine[] {
  return recipe.ingredients.flatMap((line): ExpectedLine[] => {
    const main: ExpectedLine = {
      raw: line.raw,
      name: line.name,
      quantity: line.quantity,
      quantityMax: line.quantityMax,
      unit: line.unit,
      approximate: line.approx,
      optional: line.optional ?? false,
      secondary: line.secondary,
      isAlternative: false,
    };
    if (!line.alternative) return [main];
    return [
      main,
      {
        raw: line.raw,
        name: line.alternative.name,
        quantity: line.alternative.quantity,
        quantityMax: line.alternative.quantityMax,
        unit: line.alternative.unit,
        approximate: null,
        optional: false,
        secondary: null,
        isAlternative: true,
      },
    ];
  });
}

function sameName(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  return left !== "" && right !== "" && (left.includes(right) || right.includes(left));
}

/**
 * "1 Knoblauchzehe" may be read as one piece of "Knoblauchzehe" or as one "Zehe" of
 * "Knoblauch". Both say the same, so a counted unit that is part of the expected name counts
 * as "Stück".
 */
function sameUnit(expected: ExpectedLine, actual: ExtractedIngredient): boolean {
  if (expected.unit === actual.unit) return true;
  return (
    expected.unit === "Stück" &&
    actual.unit !== null &&
    normalizeName(expected.name).includes(normalizeName(actual.unit))
  );
}

/**
 * Pairs every verified line with the line the model returned for it. Exact names are paired
 * first, so that "Pfeffer" is never satisfied by "grüner Pfeffer" while the real one waits.
 * Returns the model's line index per verified line, or -1.
 */
function pairLines(expected: ExpectedLine[], actual: ExtractedIngredient[]): number[] {
  const pairs = expected.map(() => -1);
  const used = new Set<number>();
  const sameRaw = (a: ExpectedLine, b: ExtractedIngredient) =>
    normalizeName(a.raw) === normalizeName(b.raw);
  const exactName = (a: ExpectedLine, b: ExtractedIngredient) =>
    normalizeName(a.name) === normalizeName(b.name);
  const looseName = (a: ExpectedLine, b: ExtractedIngredient) => sameName(a.name, b.name);
  const rounds = [
    (a: ExpectedLine, b: ExtractedIngredient) => sameRaw(a, b) && exactName(a, b),
    exactName,
    (a: ExpectedLine, b: ExtractedIngredient) => sameRaw(a, b) && looseName(a, b),
    looseName,
  ];
  for (const fits of rounds) {
    expected.forEach((line, at) => {
      if (pairs[at] !== -1) return;
      const index = actual.findIndex((candidate, i) => !used.has(i) && fits(line, candidate));
      if (index !== -1) {
        pairs[at] = index;
        used.add(index);
      }
    });
  }
  return pairs;
}

export function scoreExtraction(expected: ExpectedRecipe, actual: ExtractedRecipe): Score {
  const mistakes: Mistake[] = [];
  const check = (where: string, field: string, want: unknown, got: unknown) => {
    if (want !== got) mistakes.push({ where, field, expected: want, actual: got });
  };

  // A title that is not on the photo must stay empty. Inventing one is the worst mistake here.
  if (expected.title === null) check("recipe", "title", null, actual.title);
  else if (actual.title === null || normalizeName(actual.title) !== normalizeName(expected.title)) {
    mistakes.push({
      where: "recipe",
      field: "title",
      expected: expected.title,
      actual: actual.title,
    });
  }
  check("recipe", "servingsMin", expected.servings.min, actual.servingsMin);
  check("recipe", "servingsMax", expected.servings.max, actual.servingsMax);
  check("recipe", "page", expected.source.page, actual.page);
  check("recipe", "prepMinutes", expected.prepTimeMinutes, actual.prepMinutes);

  const lines = expectedLines(expected);
  const pairs = pairLines(lines, actual.ingredients);
  const used = new Set(pairs.filter((index) => index !== -1));
  const missing: string[] = [];

  for (const [at, line] of lines.entries()) {
    const index = pairs[at];
    if (index === -1) {
      missing.push(`${line.raw} [${line.name}]`);
      continue;
    }
    const got = actual.ingredients[index];
    const where = `${line.raw} [${line.name}]`;
    check(where, "quantity", line.quantity, got.quantity);
    check(where, "quantityMax", line.quantityMax, got.quantityMax);
    if (!sameUnit(line, got)) check(where, "unit", line.unit, got.unit);
    if (line.approximate !== null) check(where, "approximate", line.approximate, got.approximate);
    check(where, "optional", line.optional, got.optional);
    check(where, "secondaryQuantity", line.secondary?.quantity ?? null, got.secondaryQuantity);
    check(where, "secondaryUnit", line.secondary?.unit ?? null, got.secondaryUnit);
    check(
      where,
      "secondaryScope",
      line.secondary ? (line.secondary.scope ?? "unknown") : "none",
      got.secondaryScope,
    );
    check(where, "isAlternative", line.isAlternative, got.alternativeTo !== null);
  }

  const extra = actual.ingredients
    .filter((_, i) => !used.has(i))
    .map((line) => `${line.raw} [${line.name}]`);
  return {
    expectedLines: lines.length,
    matchedLines: used.size,
    missing,
    extra,
    mistakes,
    perfect: mistakes.length === 0 && missing.length === 0 && extra.length === 0,
  };
}
