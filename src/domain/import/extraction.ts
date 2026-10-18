import { z } from "zod";
import { UNITS } from "../units";

/**
 * What a model must return for one recipe photo. This is the contract between the import and
 * any model behind it: strict JSON, every field present, null where the photo does not show
 * something. A value the model is not sure about is null plus a flag, never a guess.
 */

const unit = z.enum(UNITS as [string, ...string[]]);

/** The categories a recipe can have. Each is the key of a tag in the group "Kategorie". */
export const DISH_TYPES = [
  "hauptgericht",
  "suppe-eintopf",
  "salat",
  "beilage",
  "vesper",
  "snack",
  "dessert",
  "kuchen",
  "fruehstueck",
  "getraenk",
  "grundrezept",
  "unbekannt",
] as const;

export const PROTEIN_TYPES = [
  "red_meat",
  "poultry",
  "fish",
  "vegetarian",
  "vegan",
  "none",
  "unknown",
] as const;

export const extractedIngredientSchema = z.object({
  /** The line exactly as printed. Two ingredients printed on one line share it. */
  raw: z.string(),
  /** Decimal. Null when no quantity is printed or it cannot be read with certainty. */
  quantity: z.number().nullable(),
  /** Upper bound of a printed range such as "2-3". Null otherwise. */
  quantityMax: z.number().nullable(),
  /** "Stück" for a bare count. Null exactly when quantity is null. */
  unit: unit.nullable(),
  /** The ingredient as printed, without the amount. */
  name: z.string(),
  /** Preparation or quality words from the line ("gehackt", "reif"). Empty if none. */
  note: z.string(),
  /** The main amount is printed with "etwa", "ca." or similar. */
  approximate: z.boolean(),
  /** The recipe says it can be left out. */
  optional: z.boolean(),
  /** A second printed measure for the same line: "(etwa 200 g)", "à 150 g". */
  secondaryQuantity: z.number().nullable(),
  secondaryUnit: unit.nullable(),
  /** "unknown" when the print does not say whether it is the total or per piece. */
  secondaryScope: z.enum(["none", "total", "perPiece", "unknown"]),
  /** Position (from 0) of the line this one may replace ("oder Petersilie"). */
  alternativeTo: z.number().int().nullable(),
  /** True when any part of this line could not be read with certainty. */
  unclear: z.boolean(),
});

export const extractedRecipeSchema = z.object({
  /** As printed. Null when the title is not visible on the photos. */
  title: z.string().nullable(),
  /** A printed sub-heading such as "Gelingt leicht". Empty if none. */
  subtitle: z.string(),
  servingsMin: z.number().int().nullable(),
  servingsMax: z.number().int().nullable(),
  /** The servings line as printed. Empty if none. */
  servingsRaw: z.string(),
  /** Printed page number. Null if not visible. */
  page: z.number().int().nullable(),
  /** Preparation time in minutes without optional extras such as soaking. */
  prepMinutes: z.number().int().nullable(),
  dishType: z.enum(DISH_TYPES),
  proteinType: z.enum(PROTEIN_TYPES),
  ingredients: z.array(extractedIngredientSchema),
  /**
   * The preparation steps as printed, one entry per printed step, in printed order. A part
   * that cannot be read is "[…]" and named in `uncertain`. Empty when no steps are printed.
   */
  steps: z.array(z.string()),
  /**
   * What the model could not read or decide with certainty. Any entry sends the recipe to the
   * review queue, so observations that need no decision do not belong here.
   */
  uncertain: z.array(z.object({ field: z.string(), reason: z.string() })),
  /** Observations that need no decision: ignored tip boxes, a neighbouring recipe, and so on. */
  notes: z.array(z.string()),
});

export type ExtractedIngredient = z.infer<typeof extractedIngredientSchema>;
export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;
