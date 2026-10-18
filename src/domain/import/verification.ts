import { z } from "zod";
import type { ExtractedRecipe } from "./extraction";
import { resolveServings } from "./servings";

/**
 * The second pass: a separate request that gets the photos and the finished transcription and
 * reports where the two differ. It never sees how the first pass arrived at its values.
 */

export const VERIFICATION_FIELDS = [
  "title",
  "servings",
  "page",
  "prepMinutes",
  "quantity",
  "unit",
  "name",
  "secondary",
  "alternative",
  "optional",
  "missing_line",
  "extra_line",
  "step",
  "missing_step",
  "extra_step",
] as const;

export const verificationSchema = z.object({
  problems: z.array(
    z.object({
      /** Position of the transcribed ingredient, from 0. Null for a recipe field or a missing line. */
      ingredientIndex: z.number().int().nullable(),
      /** Position of the transcribed step, from 0. Null for anything that is no step. */
      stepIndex: z.number().int().nullable(),
      field: z.enum(VERIFICATION_FIELDS),
      /** What the photo shows, quoted as printed. */
      printed: z.string(),
      /** What the transcription says instead. */
      transcribed: z.string(),
    }),
  ),
});

export type Verification = z.infer<typeof verificationSchema>;

/**
 * The transcription as the second pass sees it: values only, without the printed line. With
 * the printed text next to each value, checking would turn into comparing the transcription
 * with itself instead of with the photo.
 */
export function transcriptionForVerification(recipe: ExtractedRecipe) {
  // The servings as they will be stored, so the second pass checks what the household gets:
  // "1 Springform (Ø 26 cm)" and not a number of persons nobody printed.
  const servings = resolveServings(recipe);
  return {
    title: recipe.title,
    servingsMin: servings?.min ?? null,
    servingsMax: servings?.max ?? null,
    servingsUnit: servings?.unit ?? null,
    page: recipe.page,
    prepMinutes: recipe.prepMinutes,
    ingredients: recipe.ingredients.map((line, index) => ({
      index,
      quantity: line.quantity,
      quantityMax: line.quantityMax,
      unit: line.unit,
      name: line.name,
      note: line.note,
      approximate: line.approximate,
      optional: line.optional,
      secondaryQuantity: line.secondaryQuantity,
      secondaryUnit: line.secondaryUnit,
      secondaryScope: line.secondaryScope,
      alternativeTo: line.alternativeTo,
    })),
    // The steps are compared as text: there is nothing else to compare them by.
    steps: (recipe.steps ?? []).map((text, index) => ({ index, text })),
  };
}
