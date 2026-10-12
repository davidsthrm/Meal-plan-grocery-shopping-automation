import { normalizeName, type CatalogIndex } from "../catalog";
import type { RecipeIngredient, Servings } from "../recipe";
import { COUNT_UNITS, type Unit } from "../units";
import type { ExtractedRecipe } from "./extraction";
import { mapToCatalog } from "./map-ingredient";
import { resolveServings } from "./servings";

/** What the household entered on the upload form because a photo cannot show it. */
export interface ProvidedMetadata {
  title?: string | null;
  book?: string | null;
  page?: number | null;
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
}

const blank = (text: string | null | undefined) =>
  text && text.trim() !== "" ? text.trim() : null;

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
  const ingredients = extracted.ingredients.map((line): DraftIngredient => {
    const ingredient = mapToCatalog(index, line);
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
  };
}
