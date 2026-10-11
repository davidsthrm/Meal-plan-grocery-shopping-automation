import type { ExtractedRecipe } from "./extraction";
import type { ExpectedRecipe } from "./score";

/** Test helper: readings built from the verified fixtures. */

/** What a flawless model would return for a verified recipe. */
export function flawless(expected: ExpectedRecipe): ExtractedRecipe {
  const ingredients: ExtractedRecipe["ingredients"] = [];
  for (const line of expected.ingredients) {
    const base = {
      raw: line.raw,
      note: "",
      optional: line.optional ?? false,
      unclear: false,
    };
    ingredients.push({
      ...base,
      quantity: line.quantity,
      quantityMax: line.quantityMax,
      unit: line.unit,
      name: line.name,
      approximate: line.approx,
      secondaryQuantity: line.secondary?.quantity ?? null,
      secondaryUnit: line.secondary?.unit ?? null,
      secondaryScope: line.secondary ? ((line.secondary.scope ?? "unknown") as "total") : "none",
      alternativeTo: null,
    });
    if (line.alternative) {
      ingredients.push({
        ...base,
        quantity: line.alternative.quantity,
        quantityMax: line.alternative.quantityMax,
        unit: line.alternative.unit,
        name: line.alternative.name,
        approximate: false,
        optional: false,
        secondaryQuantity: null,
        secondaryUnit: null,
        secondaryScope: "none",
        alternativeTo: ingredients.length - 1,
      });
    }
  }
  return {
    title: expected.title,
    subtitle: "",
    servingsMin: expected.servings.min,
    servingsMax: expected.servings.max,
    servingsRaw: "",
    page: expected.source.page,
    prepMinutes: expected.prepTimeMinutes,
    dishType: "unbekannt",
    proteinType: "unknown",
    ingredients,
    uncertain: [],
    notes: [],
  };
}
