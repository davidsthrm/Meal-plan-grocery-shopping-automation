import "server-only";
import sharp from "sharp";
import { settleSteps, type StepsReading } from "@/domain/import/steps";
import type { Verification } from "@/domain/import/verification";
import { allRows, type Db } from "../catalog";
import type { PreparedImage } from "./normalize-image";
import {
  RecipeReadError,
  type ReadOptions,
  type StepsReader,
  type StepsVerifier,
} from "./read-recipe";
import { downloadPhoto } from "./storage";

/**
 * Filling in the preparation steps of recipes that were imported before steps were read.
 * Only the steps are read, from the page photos in storage; the ingredients, which the
 * household may have corrected, are not touched. A second request checks what was read.
 */

/** A recipe whose steps can be read from its stored photos. */
export interface StepsTarget {
  recipeId: string;
  title: string;
  book: string | null;
  /** Stored pages in order, each with the cut-out of this recipe where it shares the page. */
  photos: { path: string; cropPath: string | null }[];
  /** Which recipe of the page is meant, as the import knew it. */
  read: ReadOptions;
  /** Steps read already: only those with doubts are read again, never ones a person saved. */
  hasSteps: boolean;
}

/**
 * The household's recipes with photos whose steps are not read yet, or with `again` those
 * whose steps were read with doubts. Narrowed to one cookbook by `book`.
 */
export async function loadStepsTargets(
  db: Db,
  householdId: string,
  options: { book?: string | null; again?: boolean } = {},
): Promise<StepsTarget[]> {
  const [recipes, photos, jobs] = await Promise.all([
    allRows(
      (from, to) =>
        db
          .from("recipe")
          .select("id, title, source_book, prep_steps, prep_steps_doubts")
          .eq("household_id", householdId)
          .eq("status", "approved")
          .order("id")
          .range(from, to),
      "load recipes",
    ),
    allRows(
      (from, to) =>
        db
          .from("recipe_photo")
          .select("id, recipe_id, storage_path, crop_path, sort_order")
          .eq("household_id", householdId)
          .order("id")
          .range(from, to),
      "load recipe photos",
    ),
    allRows(
      (from, to) =>
        db
          .from("import_job")
          .select("id, recipe_id, focus_title, focus_position, focus_count")
          .eq("household_id", householdId)
          .eq("status", "approved")
          .not("recipe_id", "is", null)
          .order("id")
          .range(from, to),
      "load import jobs",
    ),
  ]);
  const photosOf = new Map<string, typeof photos>();
  for (const photo of photos) {
    photosOf.set(photo.recipe_id, [...(photosOf.get(photo.recipe_id) ?? []), photo]);
  }
  const jobOf = new Map(jobs.map((job) => [job.recipe_id as string, job]));

  return recipes
    .filter((recipe) => options.book == null || recipe.source_book === options.book)
    .filter((recipe) =>
      options.again
        ? recipe.prep_steps !== null && recipe.prep_steps_doubts.length > 0
        : recipe.prep_steps === null,
    )
    .flatMap((recipe): StepsTarget[] => {
      const own = (photosOf.get(recipe.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
      if (own.length === 0) return [];
      const job = jobOf.get(recipe.id);
      const focus =
        job && job.focus_position !== null && job.focus_count !== null
          ? { position: job.focus_position, count: job.focus_count }
          : null;
      return [
        {
          recipeId: recipe.id,
          title: recipe.title,
          book: recipe.source_book,
          photos: own.map((photo) => ({ path: photo.storage_path, cropPath: photo.crop_path })),
          read: { focus, focusTitle: focus ? (job?.focus_title ?? null) : null },
          hasSteps: recipe.prep_steps !== null,
        },
      ];
    });
}

async function image(path: string, label: string): Promise<PreparedImage> {
  const data = await downloadPhoto(path);
  const { width = 0, height = 0 } = await sharp(data).metadata();
  return { label, data, width, height };
}

/** The pages of a recipe as the model sees them: each page, then its cut-out if it has one. */
export async function stepsImages(target: StepsTarget): Promise<PreparedImage[]> {
  const images = await Promise.all(
    target.photos.map(async (photo, i) => {
      const page = await image(photo.path, `Page ${i + 1}`);
      if (!photo.cropPath) return [page];
      return [page, await image(photo.cropPath, `Cut-out of Page ${i + 1}`)];
    }),
  );
  return images.flat();
}

export interface FilledSteps {
  /** "read": steps without doubt; "doubtful": steps with doubts; "none": no steps printed. */
  outcome: "read" | "doubtful" | "none";
  steps: string[];
  doubts: string[];
  reading: StepsReading;
  verification: Verification | null;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Reads and checks the steps of one recipe, and stores them when `write` is set. A reading
 * the model refused or garbled throws `RecipeReadError`: the steps stay unknown and are tried
 * again on the next run. Any other error is an outage.
 */
export async function fillSteps(
  db: Db,
  target: StepsTarget,
  models: { readSteps: StepsReader; verifySteps: StepsVerifier },
  write: boolean,
): Promise<FilledSteps> {
  const images = await stepsImages(target);
  const usage = { inputTokens: 0, outputTokens: 0 };
  const read = await models.readSteps(images, target.read);
  usage.inputTokens += read.usage.inputTokens;
  usage.outputTokens += read.usage.outputTokens;

  let verification: Verification | null = null;
  try {
    const checked = await models.verifySteps(images, read.reading.steps, target.read);
    verification = checked.verification;
    usage.inputTokens += checked.usage.inputTokens;
    usage.outputTokens += checked.usage.outputTokens;
  } catch (error) {
    // Unchecked steps are kept, with a doubt that says they were not checked.
    if (!(error instanceof RecipeReadError)) throw error;
  }
  const disagreements =
    verification?.problems.filter(
      (problem) => problem.stepIndex !== null || /step/.test(problem.field),
    ) ?? null;
  const { steps, doubts } = settleSteps(read.reading, disagreements);

  if (write) {
    let update = db
      .from("recipe")
      .update({ prep_steps: steps, prep_steps_doubts: doubts })
      .eq("id", target.recipeId);
    // Steps a person saved in the meantime are never overwritten.
    update = target.hasSteps
      ? update.not("prep_steps_doubts", "eq", "{}")
      : update.is("prep_steps", null);
    const { error } = await update;
    if (error) throw new Error(`store steps: ${error.message}`);
  }
  return {
    outcome:
      steps.length === 0 && doubts.length === 0 ? "none" : doubts.length > 0 ? "doubtful" : "read",
    steps,
    doubts,
    reading: read.reading,
    verification,
    usage,
  };
}
