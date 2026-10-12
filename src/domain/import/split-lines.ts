import type { CatalogIndex } from "../catalog";
import type { ExtractedRecipe } from "./extraction";
import { splitJoinedName } from "./map-ingredient";

/**
 * Turns a line that names several ingredients into one line per ingredient: "Salz und
 * Pfeffer" becomes salt and pepper. The reading instructions ask for that already, but a
 * model does not always do it, and the household then has "Salz & Pfeffer" in its catalog
 * next to salt and next to pepper.
 *
 * Only lines without an amount are split. "250 g Erbsen und Möhren" may be one product, and
 * nobody can say how the amount would be shared.
 */
export function splitJoinedLines(recipe: ExtractedRecipe, index: CatalogIndex): ExtractedRecipe {
  const ingredients: ExtractedRecipe["ingredients"] = [];
  // Where each line of the reading starts in the new list, for the lines that point at others.
  const startOf: number[] = [];
  for (const line of recipe.ingredients) {
    startOf.push(ingredients.length);
    const parts = line.quantity === null ? splitJoinedName(index, line.name) : null;
    if (!parts) ingredients.push(line);
    else for (const part of parts) ingredients.push({ ...line, name: part.name });
  }
  if (ingredients.length === recipe.ingredients.length) return recipe;
  return {
    ...recipe,
    ingredients: ingredients.map((line) => ({
      ...line,
      alternativeTo:
        line.alternativeTo !== null && line.alternativeTo in startOf
          ? startOf[line.alternativeTo]
          : line.alternativeTo,
    })),
  };
}
