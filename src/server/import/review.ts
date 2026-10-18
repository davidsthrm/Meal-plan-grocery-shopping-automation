import "server-only";
import { sourceLabel } from "@/domain/library/source";
import type { ImportIssue } from "@/domain/import/checks";
import type { ExtractedRecipe } from "@/domain/import/extraction";
import {
  readReview,
  type ReviewErrors,
  type ReviewInput,
  type ReviewLineInput,
} from "@/domain/import/review-input";
import type { Unit } from "@/domain/units";
import { loadCatalogIndex, loadIngredientNames, must, type Db } from "../catalog";
import { importModels } from "./models";
import { saveReviewedRecipe } from "./save-recipe";
import { viewUrls } from "./storage";

/**
 * The review of one imported recipe: what the household sees, and what happens with what
 * they confirm. Everything they type is checked again here; the form is not trusted.
 */

export async function approveReview(
  db: Db,
  householdId: string,
  jobId: string,
  input: ReviewInput,
): Promise<{ ok: true } | { ok: false; errors: ReviewErrors }> {
  const job = must(
    await db.from("import_job").select("id, recipe_id, extraction").eq("id", jobId).single(),
    "load recipe job",
  );
  if (!job.recipe_id) return { ok: false, errors: { title: "Dieses Rezept gibt es nicht mehr." } };
  const index = await loadCatalogIndex(db);
  const read = readReview(input, index);
  if (!read.ok) return read;

  const extraction = job.extraction as unknown as ExtractedRecipe | null;
  const existing = must(
    await db.from("recipe").select("source_title").eq("id", job.recipe_id).single(),
    "load recipe",
  );
  await saveReviewedRecipe(db, {
    householdId,
    recipeId: job.recipe_id,
    recipe: {
      title: input.title.trim(),
      sourceTitle: existing.source_title,
      sourceBook: input.sourceBook.trim() || null,
      sourcePage: read.page,
      servings: read.servings,
      prepMinutes: read.prep,
      dishType: extraction?.dishType ?? "unbekannt",
      proteinType: extraction?.proteinType ?? "unknown",
      lines: read.lines,
      steps: read.steps,
    },
    index,
    suggest: importModels().suggest,
  });
  const done = await db
    .from("import_job")
    .update({ status: "approved", issues: [], finished_at: new Date().toISOString() })
    .eq("id", jobId);
  if (done.error) throw new Error(`mark recipe as reviewed: ${done.error.message}`);
  return { ok: true };
}

/** The household decided this is not a recipe: the draft goes, the pages stay in the batch. */
export async function discardJob(db: Db, jobId: string): Promise<void> {
  const job = must(
    await db.from("import_job").select("recipe_id").eq("id", jobId).single(),
    "load recipe job",
  );
  if (job.recipe_id) {
    const removed = await db.from("recipe").delete().eq("id", job.recipe_id);
    if (removed.error) throw new Error(`remove draft recipe: ${removed.error.message}`);
  }
  const done = await db
    .from("import_job")
    .update({ status: "discarded", issues: [] })
    .eq("id", jobId);
  if (done.error) throw new Error(`discard recipe job: ${done.error.message}`);
}

/**
 * Adds the page photographed before or after to a recipe and has it read again. For when the
 * grouping missed that a recipe's title or ingredients are on the neighbouring page.
 * Returns false when there is no such page.
 */
export async function rereadWithNeighbour(
  db: Db,
  jobId: string,
  side: "before" | "after",
): Promise<boolean> {
  const job = must(
    await db
      .from("import_job")
      .select("id, batch_id, page_ids, recipe_id")
      .eq("id", jobId)
      .single(),
    "load recipe job",
  );
  const own = must(
    await db.from("import_page").select("id, position").in("id", job.page_ids).order("position"),
    "load pages of recipe",
  );
  if (own.length === 0) return false;
  const position = side === "before" ? own[0].position - 1 : own[own.length - 1].position + 1;
  const neighbour = must(
    await db
      .from("import_page")
      .select("id, photo_path")
      .eq("batch_id", job.batch_id)
      .eq("position", position)
      .not("photo_path", "is", null),
    "load neighbouring page",
  )[0];
  if (!neighbour) return false;

  const pageIds =
    side === "before" ? [neighbour.id, ...job.page_ids] : [...job.page_ids, neighbour.id];
  const pages = must(
    await db.from("import_page").select("id, photo_path").in("id", pageIds),
    "load pages",
  );
  const photoOf = new Map(pages.map((page) => [page.id, page.photo_path as string]));
  if (job.recipe_id) await db.from("recipe").delete().eq("id", job.recipe_id);
  const updated = await db
    .from("import_job")
    .update({
      status: "uploaded",
      page_ids: pageIds,
      photo_paths: pageIds.map((id) => photoOf.get(id) as string),
      recipe_id: null,
      issues: [],
      notes: [],
      extraction: null,
      verification: null,
      finished_at: null,
    })
    .eq("id", jobId);
  if (updated.error) throw new Error(`queue recipe for reading: ${updated.error.message}`);
  await db.from("import_page").update({ status: "read" }).eq("id", neighbour.id);
  return true;
}

/** Has a page read as a recipe that the first look left out. */
export async function readPageAsRecipe(
  db: Db,
  householdId: string,
  pageId: string,
): Promise<string> {
  const page = must(
    await db.from("import_page").select("id, batch_id, photo_path").eq("id", pageId).single(),
    "load page",
  );
  if (!page.photo_path) throw new Error("this page has no stored photo");
  const last = must(
    await db
      .from("import_job")
      .select("position")
      .eq("batch_id", page.batch_id)
      .order("position", { ascending: false })
      .limit(1),
    "load last recipe of batch",
  );
  const created = await db.from("import_job").insert({
    household_id: householdId,
    batch_id: page.batch_id,
    position: (last[0]?.position ?? -1) + 1,
    page_ids: [page.id],
    photo_paths: [page.photo_path],
  });
  if (created.error) throw new Error(`queue page for reading: ${created.error.message}`);
  await db.from("import_page").update({ status: "read" }).eq("id", page.id);
  return page.batch_id;
}

export interface ReviewLine {
  ingredient: string;
  /** False when the catalog does not know the ingredient yet. */
  known: boolean;
  quantity: number | null;
  quantityMax: number | null;
  unit: Unit | null;
  note: string;
  optional: boolean;
  approximate: boolean;
  alternativeTo: number | null;
  originalText: string;
  secondary: ReviewLineInput["secondary"];
}

export interface Review {
  jobId: string;
  batchId: string;
  title: string;
  /** False while the title is only the placeholder for a recipe without one. */
  hasTitle: boolean;
  sourceBook: string;
  sourcePage: number | null;
  servingsMin: number | null;
  servingsMax: number | null;
  /** What the recipe counts when it is not persons. Empty for persons. */
  servingsUnit: string;
  prepMinutes: number | null;
  lines: ReviewLine[];
  /** The preparation steps as read, one per printed step. */
  steps: string[];
  issues: ImportIssue[];
  notes: string[];
  photoUrls: string[];
  /** Whether the batch has a page before the first and after the last page of this recipe. */
  neighbours: { before: boolean; after: boolean };
}

export async function loadReview(db: Db, jobId: string): Promise<Review | null> {
  const { data: job } = await db
    .from("import_job")
    .select("id, batch_id, status, recipe_id, issues, notes, photo_paths, page_ids, extraction")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || !job.recipe_id || job.status !== "needs_review") return null;

  const [recipe, lines, ingredients, pages, allPages, urls] = await Promise.all([
    db
      .from("recipe")
      .select(
        "title, source_book, source_edition, source_page, servings_min, servings_max, servings_unit, prep_minutes, prep_steps",
      )
      .eq("id", job.recipe_id)
      .single(),
    db
      .from("recipe_ingredient")
      .select(
        "id, position, ingredient_id, quantity, quantity_max, unit, is_optional, is_approximate, alternative_to, original_text, note, secondary_quantity, secondary_unit, secondary_scope",
      )
      .eq("recipe_id", job.recipe_id)
      .order("position"),
    loadIngredientNames(db),
    db.from("import_page").select("position").in("id", job.page_ids).order("position"),
    db
      .from("import_page")
      .select("position")
      .eq("batch_id", job.batch_id)
      .not("photo_path", "is", null),
    viewUrls(job.photo_paths),
  ]);
  const names = new Map(ingredients.map((i) => [i.id, i.name]));
  const rows = must(lines, "load lines");
  const positionOf = new Map(rows.map((row, at) => [row.id, at]));
  const issues = job.issues as unknown as ImportIssue[];
  const extraction = job.extraction as unknown as ExtractedRecipe | null;
  const own = must(pages, "load pages of recipe").map((p) => p.position);
  const others = new Set(must(allPages, "load pages of batch").map((p) => p.position));
  const r = must(recipe, "load recipe");

  return {
    jobId: job.id,
    batchId: job.batch_id,
    title: r.title,
    hasTitle: !issues.some((issue) => issue.code === "title_missing"),
    sourceBook: sourceLabel(r.source_book, r.source_edition),
    sourcePage: r.source_page,
    servingsMin: r.servings_min,
    servingsMax: r.servings_max,
    servingsUnit: r.servings_unit ?? "",
    prepMinutes: r.prep_minutes,
    steps: r.prep_steps ?? [],
    lines: rows.map((row, at) => ({
      // An unknown ingredient shows the name it was read with, so it can be corrected or kept.
      ingredient: row.ingredient_id
        ? (names.get(row.ingredient_id) ?? "")
        : (extraction?.ingredients[at]?.name ?? row.original_text),
      known: row.ingredient_id !== null,
      quantity: row.quantity,
      quantityMax: row.quantity_max,
      unit: row.unit,
      note: row.note ?? "",
      optional: row.is_optional,
      approximate: row.is_approximate,
      alternativeTo: row.alternative_to ? (positionOf.get(row.alternative_to) ?? null) : null,
      originalText: row.original_text,
      secondary:
        row.secondary_quantity !== null && row.secondary_unit !== null
          ? {
              quantity: row.secondary_quantity,
              unit: row.secondary_unit,
              scope: row.secondary_scope,
            }
          : null,
    })),
    issues,
    notes: job.notes as unknown as string[],
    photoUrls: job.photo_paths.map((path) => urls[path]).filter(Boolean),
    neighbours: {
      before: own.length > 0 && others.has(own[0] - 1),
      after: own.length > 0 && others.has(own[own.length - 1] + 1),
    },
  };
}
