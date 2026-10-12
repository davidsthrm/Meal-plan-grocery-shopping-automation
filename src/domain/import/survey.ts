import { z } from "zod";

/**
 * The first look at one photographed page of a cookbook: which recipes are on it? It does not
 * read any amounts. Its only job is to let pages be grouped into recipes, because a recipe
 * can have its title on one page and its ingredients on the next.
 */
export const pageSurveySchema = z.object({
  /** Page number printed on the page. The lower one if a double page shows two. */
  printedPage: z.number().int().nullable(),
  /** One entry per recipe that has its title or its ingredient list on this photo. */
  recipes: z.array(
    z.object({
      /** The recipe's printed title if it is on this photo, otherwise null. */
      title: z.string().nullable(),
      /** Number printed on the page this recipe is on. On a double page: its own side. */
      page: z.number().int().nullable(),
      hasIngredientList: z.boolean(),
      hasSteps: z.boolean(),
      /** The recipe's text visibly breaks off at the end of the page. */
      continuesOnNextPage: z.boolean(),
    }),
  ),
  /** What the page shows when it has no recipe: cover, contents, a photo. Empty otherwise. */
  otherContent: z.string(),
});

export type PageSurvey = z.infer<typeof pageSurveySchema>;
export type PagePart = PageSurvey["recipes"][number];
