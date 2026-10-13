import "server-only";
import sharp from "sharp";
import type { IsoDate } from "@/domain/dates";
import type { RecipeDraft } from "@/domain/import/draft";
import { groupPages } from "@/domain/import/group-pages";
import type { PageSurvey } from "@/domain/import/survey";
import type { Meal } from "@/domain/plan";
import { loadCatalogIndex, must, type Db } from "../catalog";
import type { Json } from "../supabase/database.types";
import { frameNextPage } from "./frame-stored";
import { importFromImages } from "./import-recipe";
import { importModels } from "./models";
import { normalizeImage, prepareForModel, type PreparedImage } from "./normalize-image";
import { RecipeReadError } from "./read-recipe";
import { tagRecipes } from "../tagging";
import { saveImportedRecipe, StoreError, type StoredRecipe } from "./save-recipe";
import {
  createUploadTarget,
  downloadPhoto,
  fullPhotoPath,
  originalPath,
  pagePhotoPath,
  removeFolder,
  removePhotos,
  storePhoto,
} from "./storage";

/**
 * A batch is one sitting of photographing a cookbook: any number of pages, one cookbook name.
 *
 * The work is done one small step per request, driven by the page that shows the batch:
 * look at a page, group the pages into recipes, import a recipe. Every step records its
 * result, so a closed tab or a dropped connection loses nothing and the batch simply
 * continues when it is opened again.
 */

/** Longest edge of the full-size copy. Larger than any phone photo, so nothing is scaled. */
const FULL_SIZE_EDGE = 8192;

/** A step that has been "in progress" for longer than this was abandoned and is redone. */
const ABANDONED_AFTER_MS = 5 * 60 * 1000;

const now = () => new Date().toISOString();
const json = (value: unknown) => value as Json;

/**
 * Starts a batch. `forMeal` is the meal of the week plan the upload was started from: the
 * recipe read from it is planned there, see `placeForMeal`.
 */
export async function createBatch(
  db: Db,
  householdId: string,
  userId: string,
  sourceBook: string | null,
  forMeal: { date: IsoDate; meal: Meal } | null = null,
): Promise<string> {
  const batch = must(
    await db
      .from("import_batch")
      .insert({
        household_id: householdId,
        created_by: userId,
        source_book: sourceBook,
        for_date: forMeal?.date ?? null,
        for_meal: forMeal?.meal ?? null,
      })
      .select("id")
      .single(),
    "create batch",
  );
  return batch.id;
}

export interface UploadTarget {
  pageId: string;
  path: string;
  token: string;
}

/** Registers the photos of a batch in the order given and returns where to upload each. */
export async function addPages(
  db: Db,
  householdId: string,
  batchId: string,
  fileNames: string[],
): Promise<UploadTarget[]> {
  const last = must(
    await db
      .from("import_page")
      .select("position")
      .eq("batch_id", batchId)
      .order("position", { ascending: false })
      .limit(1),
    "load last page",
  );
  const first = (last[0]?.position ?? -1) + 1;
  const rows = fileNames.map((fileName, i) => ({
    household_id: householdId,
    batch_id: batchId,
    position: first + i,
    file_name: fileName,
    original_path: originalPath(householdId, batchId, first + i, fileName),
  }));
  const pages = must(
    await db
      .from("import_page")
      .insert(rows)
      .select("id, position, original_path")
      .order("position"),
    "register pages",
  );
  // New pages may complete recipes, so the batch has to be grouped again.
  await db.from("import_batch").update({ grouped_at: null }).eq("id", batchId);
  return Promise.all(
    pages.map(async (page) => ({
      pageId: page.id,
      ...(await createUploadTarget(page.original_path as string)),
    })),
  );
}

export interface BatchProgress {
  pages: { total: number; waiting: number; ignored: number; failed: number };
  recipes: {
    total: number;
    waiting: number;
    approved: number;
    needsReview: number;
    failed: number;
    discarded: number;
  };
  /**
   * Page photos that are still to be turned upright and cut to their recipes. The recipes
   * are read by then, so this keeps nobody from reviewing or planning them.
   */
  photosWaiting: number;
  /** Every recipe is read. Nothing left to do without a person. */
  done: boolean;
}

export async function batchProgress(db: Db, batchId: string): Promise<BatchProgress> {
  const [pages, jobs, batch, photos] = await Promise.all([
    db.from("import_page").select("status").eq("batch_id", batchId),
    db.from("import_job").select("status").eq("batch_id", batchId),
    db.from("import_batch").select("grouped_at").eq("id", batchId).single(),
    db
      .from("recipe_photo")
      .select("storage_path")
      .is("framed_at", null)
      .like("storage_path", `%/${batchId}/pages/%`),
  ]);
  const pageStatus = must(pages, "load pages").map((p) => p.status);
  const jobStatus = must(jobs, "load jobs").map((j) => j.status);
  const count = <T>(list: T[], ...values: T[]) => list.filter((v) => values.includes(v)).length;
  const waitingPages = count(pageStatus, "uploaded", "processing");
  const waitingJobs = count(jobStatus, "uploaded", "processing");
  return {
    pages: {
      total: pageStatus.length,
      waiting: waitingPages,
      ignored: count(pageStatus, "ignored"),
      failed: count(pageStatus, "failed"),
    },
    recipes: {
      total: jobStatus.length,
      waiting: waitingJobs,
      approved: count(jobStatus, "approved"),
      needsReview: count(jobStatus, "needs_review"),
      failed: count(jobStatus, "failed"),
      discarded: count(jobStatus, "discarded"),
    },
    // A page shared by several recipes has a row for each of them.
    photosWaiting: new Set(must(photos, "load photos").map((photo) => photo.storage_path)).size,
    done:
      pageStatus.length > 0 &&
      waitingPages === 0 &&
      waitingJobs === 0 &&
      must(batch, "load batch").grouped_at !== null,
  };
}

type Claimable = "import_page" | "import_job";

/**
 * Takes the next waiting row of a table for this request. Two requests can never take the
 * same row: the update only succeeds while the row is still as it was found.
 */
async function claim(db: Db, table: Claimable, batchId: string): Promise<string | null> {
  const abandoned = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();
  const found = must(
    await db
      .from(table)
      .select("id, status, claimed_at")
      .eq("batch_id", batchId)
      .or(`status.eq.uploaded,and(status.eq.processing,claimed_at.lt.${abandoned})`)
      .order("position")
      .limit(1),
    `find waiting ${table}`,
  )[0];
  if (!found) return null;
  let update = db
    .from(table)
    .update({ status: "processing", claimed_at: now() })
    .eq("id", found.id)
    .eq("status", found.status);
  update =
    found.claimed_at === null
      ? update.is("claimed_at", null)
      : update.eq("claimed_at", found.claimed_at);
  const taken = must(await update.select("id"), `claim ${table}`);
  // Someone else was faster. The caller just asks again.
  return taken.length > 0 ? found.id : "";
}

async function lookAtPage(db: Db, householdId: string, pageId: string): Promise<void> {
  const page = must(
    await db
      .from("import_page")
      .select("id, batch_id, position, original_path, photo_path")
      .eq("id", pageId)
      .single(),
    "load page",
  );
  const finish = (update: Record<string, unknown>) =>
    db
      .from("import_page")
      .update({ claimed_at: null, ...update })
      .eq("id", page.id);

  let image: PreparedImage;
  let upload: Buffer;
  let photoPath = page.photo_path;
  try {
    // A page that is looked at again already has its stored photo.
    upload = await downloadPhoto((page.original_path ?? photoPath) as string);
    image = await normalizeImage(upload);
  } catch (error) {
    await finish({ status: "failed", error: `Kein lesbares Foto: ${(error as Error).message}` });
    return;
  }
  try {
    if (page.original_path) {
      photoPath = pagePhotoPath(householdId, page.batch_id, page.position);
      await storePhoto(photoPath, image.data);
    }
    const { survey } = await importModels().look(image);
    // Several recipes on one photo have small print. Keep a clean full-size copy, so they
    // can be read from enlarged parts. It is removed once the batch is through.
    let fullPath: string | null = null;
    if (page.original_path && survey.recipes.length > 1) {
      fullPath = fullPhotoPath(householdId, page.batch_id, page.position);
      await storePhoto(fullPath, (await normalizeImage(upload, "Page 1", FULL_SIZE_EDGE)).data);
    }
    await finish({
      status: survey.recipes.length > 0 ? "read" : "ignored",
      photo_path: photoPath,
      full_path: fullPath,
      original_path: null,
      printed_page: survey.printedPage,
      survey: json(survey),
      error: null,
    });
    // The upload carries the phone's metadata. It goes once the clean photo is safely stored.
    if (page.original_path) await removePhotos([page.original_path]);
  } catch (error) {
    if (error instanceof RecipeReadError) {
      await finish({ status: "failed", photo_path: photoPath, error: error.message });
      return;
    }
    // An outage, not a verdict on the page: put it back and let the caller see the error.
    await finish({ status: "uploaded" });
    throw error;
  }
}

/** Groups the pages that are not part of a recipe yet and creates one job per recipe. */
async function groupBatch(db: Db, householdId: string, batchId: string): Promise<boolean> {
  const taken = must(
    await db
      .from("import_batch")
      .update({ grouped_at: now() })
      .eq("id", batchId)
      .is("grouped_at", null)
      .select("id"),
    "claim grouping",
  );
  if (taken.length === 0) return false;
  try {
    const [pages, jobs] = await Promise.all([
      db
        .from("import_page")
        .select("id, position, printed_page, photo_path, survey")
        .eq("batch_id", batchId)
        .eq("status", "read"),
      db.from("import_job").select("page_ids, position").eq("batch_id", batchId),
    ]);
    const existing = must(jobs, "load jobs");
    const assigned = new Set(existing.flatMap((job) => job.page_ids));
    const open = must(pages, "load pages").filter((page) => !assigned.has(page.id));
    const grouping = groupPages(
      open.map((page) => ({
        id: page.id,
        position: page.position,
        printedPage: page.printed_page,
        parts: (page.survey as unknown as PageSurvey).recipes,
      })),
    );
    const photoOf = new Map(open.map((page) => [page.id, page.photo_path as string]));
    const nextPosition = Math.max(-1, ...existing.map((job) => job.position)) + 1;
    if (grouping.units.length > 0) {
      const created = await db.from("import_job").insert(
        grouping.units.map((unit, i) => ({
          household_id: householdId,
          batch_id: batchId,
          position: nextPosition + i,
          page_ids: unit.pageIds,
          photo_paths: unit.pageIds.map((id) => photoOf.get(id) as string),
          focus_title: unit.focusTitle,
          focus_position: unit.focus?.position ?? null,
          focus_count: unit.focus?.count ?? null,
        })),
      );
      if (created.error) throw new Error(`create recipes of batch: ${created.error.message}`);
    }
    if (grouping.ignoredPageIds.length > 0) {
      await db.from("import_page").update({ status: "ignored" }).in("id", grouping.ignoredPageIds);
    }
    return true;
  } catch (error) {
    await db.from("import_batch").update({ grouped_at: null }).eq("id", batchId);
    throw error;
  }
}

function toStored(draft: RecipeDraft): StoredRecipe {
  return {
    // A recipe without a title waits in review, where one is asked for.
    title: draft.title ?? "Ohne Titel",
    sourceTitle: draft.sourceTitle,
    sourceBook: draft.sourceBook,
    sourcePage: draft.sourcePage,
    servings: draft.servings,
    prepMinutes: draft.prepMinutes,
    dishType: draft.dishType,
    proteinType: draft.proteinType,
    lines: draft.ingredients,
  };
}

async function importJob(db: Db, householdId: string, jobId: string): Promise<void> {
  const job = must(
    await db
      .from("import_job")
      .select(
        "id, batch_id, page_ids, photo_paths, focus_title, focus_position, focus_count, provided_title, provided_page",
      )
      .eq("id", jobId)
      .single(),
    "load recipe job",
  );
  const finish = (update: Record<string, unknown>) =>
    db
      .from("import_job")
      .update({ claimed_at: null, ...update })
      .eq("id", job.id);

  try {
    const [batch, pages, index] = await Promise.all([
      db.from("import_batch").select("source_book").eq("id", job.batch_id).single(),
      db.from("import_page").select("id, printed_page, full_path, survey").in("id", job.page_ids),
      loadCatalogIndex(db),
    ]);
    const pageRows = must(pages, "load pages");
    const fullOf = new Map(pageRows.map((p) => [p.id, p.full_path]));
    const images = (
      await Promise.all(
        job.photo_paths.map(async (path, i): Promise<PreparedImage[]> => {
          const label = `Page ${i + 1}`;
          const full = fullOf.get(job.page_ids[i]);
          // A photo shared by several recipes is read from the page plus enlarged parts.
          if (full) return prepareForModel(await downloadPhoto(full), label);
          const data = await downloadPhoto(path);
          const { width = 0, height = 0 } = await sharp(data).metadata();
          return [{ label, data, width, height }];
        }),
      )
    ).flat();
    const printed = new Map(pageRows.map((p) => [p.id, p.printed_page]));
    const firstPrinted = job.page_ids.map((id) => printed.get(id)).find((n) => n != null);
    // On a photo shared by several recipes, the first look noted the page of each one.
    const ownPage =
      job.focus_position === null
        ? firstPrinted
        : pageRows
            .map((p) => (p.survey as unknown as PageSurvey | null)?.recipes ?? [])
            .filter((parts) => parts.length === job.focus_count)
            .map((parts) => parts[(job.focus_position as number) - 1]?.page)
            .find((n) => n != null);
    const models = importModels();
    const result = await importFromImages(
      images,
      {
        title: job.provided_title,
        book: must(batch, "load batch").source_book,
        // Without a page from the first look, the reader's own reading of it is used.
        page: job.provided_page ?? ownPage ?? null,
      },
      { read: models.read, verify: models.verify, index },
      {
        focusTitle: job.focus_title,
        focus:
          job.focus_position !== null && job.focus_count !== null
            ? { position: job.focus_position, count: job.focus_count }
            : null,
      },
    );

    const recipeId = result.draft
      ? await saveImportedRecipe(db, {
          householdId,
          recipe: toStored(result.draft),
          status: result.status === "approved" ? "approved" : "needs_review",
          photoPaths: job.photo_paths,
          index,
          suggest: models.suggest,
        })
      : null;
    await finish({
      status: result.status,
      recipe_id: recipeId,
      extraction: json(result.extraction),
      verification: json(result.verification),
      issues: json(result.issues),
      notes: json(result.notes),
      model: models.readingModel,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      finished_at: now(),
    });
  } catch (error) {
    if (error instanceof StoreError) {
      // Read, but refused by the database. Trying again would fail the same way and block
      // the batch, so it is recorded as failed and the batch moves on.
      await finish({
        status: "failed",
        issues: json([{ code: "store_failed", ingredientIndex: null, detail: error.message }]),
        finished_at: now(),
      });
      return;
    }
    // An outage, not a verdict on the recipe: put it back and let the caller see the error.
    await finish({ status: "uploaded" });
    throw error;
  }
}

export type StepResult =
  /** One step was done. Ask again. */
  | "worked"
  /** Other requests are working on the last open steps. Ask again shortly. */
  | "waiting"
  /** Nothing left to do without a person, and every page photo is framed. */
  | "done";

/** Does the next open step of a batch, if there is one. */
export async function processNext(
  db: Db,
  householdId: string,
  batchId: string,
): Promise<StepResult> {
  const pageId = await claim(db, "import_page", batchId);
  if (pageId !== null) {
    if (pageId !== "") await lookAtPage(db, householdId, pageId);
    return "worked";
  }
  const busyPages = must(
    await db
      .from("import_page")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "processing")
      .limit(1),
    "check pages",
  );
  if (busyPages.length > 0) return "waiting";

  if (await groupBatch(db, householdId, batchId)) return "worked";
  // Another request may still be turning the pages into recipes. Until it is through, there
  // are no recipes to import, which must not be mistaken for a finished batch.
  if (await groupingUnfinished(db, batchId)) return "waiting";

  const jobId = await claim(db, "import_job", batchId);
  if (jobId !== null) {
    if (jobId !== "") await importJob(db, householdId, jobId);
    return "worked";
  }
  const busyJobs = must(
    await db
      .from("import_job")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "processing")
      .limit(1),
    "check recipes",
  );
  if (busyJobs.length > 0) return "waiting";

  // Every recipe is read. What is left is to make the page photos presentable: upright, and
  // cut to the recipe where a page shows several. One page per request.
  try {
    const framed = await frameNextPage(
      db,
      householdId,
      importModels(),
      `${householdId}/${batchId}/`,
    );
    if (framed !== null) return "worked";
  } catch (error) {
    // A page the model cannot frame keeps its photo as it was taken, which is a valid view.
    // An outage or a rate limit put the page back and is for the caller, as in every step.
    if (!(error instanceof RecipeReadError)) throw error;
    return "worked";
  }

  // Last, the recipes get the tags that describe them, a few per request. They are
  // suggestions: a recipe the model has nothing to say about simply stays without.
  try {
    const read = must(
      await db.from("import_job").select("recipe_id").eq("batch_id", batchId),
      "load recipes of batch",
    );
    const described = await tagRecipes(
      db,
      householdId,
      importModels().tag,
      read.flatMap((job) => job.recipe_id ?? []),
    );
    if (described.tagged > 0) return "worked";
  } catch (error) {
    if (!(error instanceof RecipeReadError)) throw error;
  }
  await removeFullCopies(db, batchId);
  return "done";
}

/** True while pages that hold recipes have not been turned into recipe jobs yet. */
async function groupingUnfinished(db: Db, batchId: string): Promise<boolean> {
  const [pages, jobs, batch] = await Promise.all([
    db.from("import_page").select("id").eq("batch_id", batchId).eq("status", "read"),
    db.from("import_job").select("page_ids").eq("batch_id", batchId),
    db.from("import_batch").select("grouped_at").eq("id", batchId).single(),
  ]);
  const assigned = new Set(must(jobs, "load jobs").flatMap((job) => job.page_ids));
  if (must(pages, "load pages").every((page) => assigned.has(page.id))) return false;
  // Grouping that was claimed long ago and never finished was abandoned: let it start again.
  const claimedAt = must(batch, "load batch").grouped_at;
  if (claimedAt && Date.now() - Date.parse(claimedAt) > ABANDONED_AFTER_MS) {
    await db.from("import_batch").update({ grouped_at: null }).eq("id", batchId);
  }
  return true;
}

/**
 * Removes a batch with everything that came from it: its pages and photos, and the recipes
 * read from it, approved or not. Ingredients that were confirmed along the way stay.
 */
export async function deleteBatch(db: Db, householdId: string, batchId: string): Promise<void> {
  const jobs = must(
    await db.from("import_job").select("recipe_id").eq("batch_id", batchId),
    "load recipes of batch",
  );
  const recipeIds = jobs.flatMap((job) => (job.recipe_id ? [job.recipe_id] : []));
  if (recipeIds.length > 0) {
    const removed = await db.from("recipe").delete().in("id", recipeIds);
    if (removed.error) throw new Error(`remove recipes of batch: ${removed.error.message}`);
  }
  const gone = await db.from("import_batch").delete().eq("id", batchId);
  if (gone.error) throw new Error(`remove batch: ${gone.error.message}`);
  await removeFolder(`${householdId}/${batchId}`);
}

/** The full-size copies were only needed for reading. They go once the batch is through. */
async function removeFullCopies(db: Db, batchId: string): Promise<void> {
  const kept = must(
    await db
      .from("import_page")
      .select("id, full_path")
      .eq("batch_id", batchId)
      .not("full_path", "is", null),
    "load full-size copies",
  );
  if (kept.length === 0) return;
  await removePhotos(kept.map((page) => page.full_path as string));
  await db
    .from("import_page")
    .update({ full_path: null })
    .in(
      "id",
      kept.map((page) => page.id),
    );
}
