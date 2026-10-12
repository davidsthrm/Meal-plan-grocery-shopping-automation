import type { CatalogIndex } from "@/domain/catalog";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import type { CopyName, PageFrame } from "@/domain/import/frame";
import type { IngredientProposal } from "@/domain/import/proposal";
import type { RecipeToTag, TagSuggestion } from "@/domain/library/tagging";
import type { PageSurvey } from "@/domain/import/survey";
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

export interface ReadOptions {
  /** Which recipe to read when the photos show more than one. */
  focusTitle?: string | null;
  /** The same by position: the n-th of how many recipes on the photo, in reading order. */
  focus?: { position: number; count: number } | null;
}

export type RecipeReader = (
  images: PreparedImage[],
  options?: ReadOptions,
) => Promise<RecipeReading>;

/** Reads one recipe from text that was pasted in, in the same strict format as from photos. */
export type TextRecipeReader = (text: string) => Promise<RecipeReading>;

export interface RecipeVerification {
  verification: Verification;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Compares a finished transcription with the photos it was made from. */
export type RecipeVerifier = (
  images: PreparedImage[],
  recipe: ExtractedRecipe,
  options?: ReadOptions,
) => Promise<RecipeVerification>;

export interface PageLook {
  survey: PageSurvey;
  usage: { inputTokens: number; outputTokens: number };
}

/** Takes the first look at one photographed page: which recipes are on it? */
export type PageSurveyor = (image: PreparedImage) => Promise<PageLook>;

export interface PageFraming {
  frame: PageFrame;
  usage: { inputTokens: number; outputTokens: number };
}

/** Says how a page photo lies and where the recipes with the given titles are on it. */
export type PageFramer = (image: PreparedImage, titles: string[]) => Promise<PageFraming>;

/**
 * Says which of four copies of a page photo is upright. The copies show the photo in its
 * four turns and carry the names A to D as their labels.
 */
export type UprightFinder = (
  copies: PreparedImage[],
) => Promise<{ upright: CopyName; usage: { inputTokens: number; outputTokens: number } }>;

/** The two model calls that make a page photo presentable. */
export interface FrameModels {
  upright: UprightFinder;
  frame: PageFramer;
}

/** Suggests catalog entries for ingredient names the catalog does not know. */
export type CatalogSuggester = (
  names: string[],
  index: CatalogIndex,
) => Promise<IngredientProposal[]>;

/**
 * Suggests tags for a few recipes at once. Returns one suggestion per recipe it understood,
 * in the order the recipes were given; null for one it left out.
 */
export type RecipeTagger = (recipes: RecipeToTag[]) => Promise<{
  suggestions: (TagSuggestion | null)[];
  usage: { inputTokens: number; outputTokens: number };
}>;

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
