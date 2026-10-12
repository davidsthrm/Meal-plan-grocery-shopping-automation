import { z } from "zod";
import { EFFORTS, type Effort } from "./tags";

/**
 * Suggesting the tags that describe a recipe: how much work it is, what kind of dish, which
 * cuisine, season and occasion. A model suggests them from the title, the category, the
 * printed time and the ingredients; the household changes whatever is wrong.
 */

/** The tags the app suggests by itself, by group. Their keys are the ones in the database. */
export const SUGGESTED_TAGS = {
  dish: ["pasta", "reis", "kartoffeln", "auflauf", "pizza", "pfanne", "ofen", "burger"],
  cuisine: ["deutsch", "italienisch", "mediterran", "asiatisch", "orientalisch", "amerikanisch"],
  seasons: ["fruehling", "sommer", "herbst", "winter"],
  occasions: ["fuer-gaeste", "fest", "grillen", "mitnehmen", "weihnachten"],
} as const;

/** Every key the app suggests, the efforts included. */
export const ALL_SUGGESTED: readonly string[] = [
  ...EFFORTS,
  ...SUGGESTED_TAGS.dish,
  ...SUGGESTED_TAGS.cuisine,
  ...SUGGESTED_TAGS.seasons,
  ...SUGGESTED_TAGS.occasions,
];

export const taggingSchema = z.object({
  recipes: z.array(
    z.object({
      /** The number the recipe has in the list that was sent. */
      n: z.number().int(),
      effort: z.enum(EFFORTS),
      dish: z.array(z.enum(SUGGESTED_TAGS.dish)),
      cuisine: z.enum(SUGGESTED_TAGS.cuisine).nullable(),
      seasons: z.array(z.enum(SUGGESTED_TAGS.seasons)),
      occasions: z.array(z.enum(SUGGESTED_TAGS.occasions)),
    }),
  ),
});

export type TagSuggestion = z.infer<typeof taggingSchema>["recipes"][number];

/** What the model is told about one recipe. */
export interface RecipeToTag {
  title: string;
  /** Name of its category, if it has one. */
  category: string | null;
  prepMinutes: number | null;
  ingredients: string[];
}

/** One recipe as a numbered line of the list the model reads. */
export function taggingLine(recipe: RecipeToTag, n: number): string {
  return [
    `${n}. ${recipe.title}`,
    recipe.category ? `Art: ${recipe.category}` : null,
    recipe.prepMinutes !== null ? `Zeit laut Rezept: ${recipe.prepMinutes} Min.` : null,
    recipe.ingredients.length > 0 ? `Zutaten: ${recipe.ingredients.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * The effort to store. A printed time is a fact: a recipe that takes more than an hour is
 * never quick, whatever the estimate says. Without a printed time the estimate stands.
 */
export function settleEffort(printedMinutes: number | null, estimated: Effort): Effort {
  if (printedMinutes === null) return estimated;
  if (printedMinutes > 60) return "aufwendig";
  if (printedMinutes > 30 && estimated === "schnell") return "alltag";
  return estimated;
}

/** The keys of the tags to give a recipe, from what was suggested for it. */
export function tagsFromSuggestion(
  suggestion: TagSuggestion,
  printedMinutes: number | null,
): string[] {
  return [
    ...new Set([
      settleEffort(printedMinutes, suggestion.effort),
      ...suggestion.dish,
      ...(suggestion.cuisine ? [suggestion.cuisine] : []),
      ...suggestion.seasons,
      ...suggestion.occasions,
    ]),
  ];
}
