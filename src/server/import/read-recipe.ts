import type { CatalogIndex } from "@/domain/catalog";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import type { IngredientProposal } from "@/domain/import/proposal";
import type { Verification } from "@/domain/import/verification";
import type { PreparedImage } from "./normalize-image";

/**
 * The one place a model is called to read a recipe. Everything else in the import works with
 * this function type, so another model or provider only needs its own reader.
 */

export interface RecipeReading {
  recipe: ExtractedRecipe;
  /** The model that answered, as the provider reports it. */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export type RecipeReader = (images: PreparedImage[]) => Promise<RecipeReading>;

export interface RecipeVerification {
  verification: Verification;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Compares a finished transcription with the photos it was made from. */
export type RecipeVerifier = (
  images: PreparedImage[],
  recipe: ExtractedRecipe,
) => Promise<RecipeVerification>;

/** Suggests catalog entries for ingredient names the catalog does not know. */
export type CatalogSuggester = (
  names: string[],
  index: CatalogIndex,
) => Promise<IngredientProposal[]>;

export type ReadFailure =
  /** The provider declined the request. */
  | "refused"
  /** The answer was cut off before it was complete. */
  | "truncated"
  /** The answer did not match the required format. */
  | "invalid";

export class RecipeReadError extends Error {
  constructor(
    readonly failure: ReadFailure,
    message: string,
  ) {
    super(message);
    this.name = "RecipeReadError";
  }
}
