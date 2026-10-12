import type { CatalogIndex } from "@/domain/catalog";
import { checkDraft, type ImportIssue } from "@/domain/import/checks";
import { toDraft, type ProvidedMetadata, type RecipeDraft } from "@/domain/import/draft";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import { splitJoinedLines } from "@/domain/import/split-lines";
import type { Verification } from "@/domain/import/verification";
import { normalizeImage, type PreparedImage } from "./normalize-image";
import {
  RecipeReadError,
  type ReadOptions,
  type RecipeReader,
  type RecipeVerifier,
} from "./read-recipe";

/**
 * The import of one recipe, from uploaded photos to a decision:
 * normalise the photos, read them, map to the catalog, run the automatic checks, have a second
 * pass compare the result with the photos, and approve only if nothing at all came up.
 */

export interface ImportDeps {
  read: RecipeReader;
  verify: RecipeVerifier;
  index: CatalogIndex;
}

export type ImportStatus =
  /** Nothing came up. The recipe can be used without anyone looking at it. */
  | "approved"
  /** Something came up. A person decides, with photo and fields side by side. */
  | "needs_review"
  /** The photos could not be read at all. */
  | "failed";

export interface ImportResult {
  status: ImportStatus;
  draft: RecipeDraft | null;
  /** Why the recipe needs a person. Empty for an approved recipe. */
  issues: ImportIssue[];
  /** The model's observations that need no decision. */
  notes: string[];
  extraction: ExtractedRecipe | null;
  verification: Verification | null;
  usage: { inputTokens: number; outputTokens: number };
  /** The photos as they are stored: upright JPEGs without metadata. */
  images: PreparedImage[];
}

/** Imports a recipe from photos as they come from a phone. */
export async function importRecipe(
  photos: Buffer[],
  provided: ProvidedMetadata,
  deps: ImportDeps,
  options: ReadOptions = {},
): Promise<ImportResult> {
  const images = await Promise.all(
    photos.map((photo, i) => normalizeImage(photo, `Page ${i + 1}`)),
  );
  return importFromImages(images, provided, deps, options);
}

/** Imports a recipe from photos that are already upright JPEGs without metadata. */
export async function importFromImages(
  images: PreparedImage[],
  provided: ProvidedMetadata,
  deps: ImportDeps,
  options: ReadOptions = {},
): Promise<ImportResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const spend = (used: { inputTokens: number; outputTokens: number }) => {
    usage.inputTokens += used.inputTokens;
    usage.outputTokens += used.outputTokens;
  };

  let extraction: ExtractedRecipe;
  try {
    const reading = await deps.read(images, options);
    // "Salz und Pfeffer" is two ingredients, whatever the model made of the line.
    extraction = splitJoinedLines(reading.recipe, deps.index);
    spend(reading.usage);
  } catch (error) {
    // A declined or unusable answer is an outcome of the import. Anything else is a bug or an
    // outage and must surface.
    if (!(error instanceof RecipeReadError)) throw error;
    return {
      status: "failed",
      draft: null,
      issues: [{ code: "read_failed", ingredientIndex: null, detail: error.message }],
      notes: [],
      extraction: null,
      verification: null,
      usage,
      images,
    };
  }

  const draft = toDraft(extraction, provided, deps.index);
  const issues = checkDraft(draft, extraction);

  let verification: Verification | null = null;
  try {
    const checked = await deps.verify(images, extraction, options);
    verification = checked.verification;
    spend(checked.usage);
    for (const problem of verification.problems) {
      issues.push({
        code: "verification_disagrees",
        ingredientIndex: problem.ingredientIndex,
        detail: `${problem.field}: printed "${problem.printed}", read as "${problem.transcribed}"`,
      });
    }
  } catch (error) {
    if (!(error instanceof RecipeReadError)) throw error;
    // Without a second pass the recipe is unverified, and unverified is never approved.
    issues.push({
      code: "read_failed",
      ingredientIndex: null,
      detail: `second check: ${error.message}`,
    });
  }

  return {
    status: issues.length === 0 ? "approved" : "needs_review",
    draft,
    issues,
    notes: extraction.notes,
    extraction,
    verification,
    usage,
    images,
  };
}
