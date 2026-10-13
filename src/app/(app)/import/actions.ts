"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { reviewInput, type ReviewErrors, type ReviewInput } from "@/domain/import/review-input";
import type { Meal } from "@/domain/plan";
import { requireHousehold } from "@/server/auth";
import { must } from "@/server/catalog";
import { addPages, createBatch, deleteBatch, type UploadTarget } from "@/server/import/batch";
import { placeForMeal } from "@/server/import/for-meal";
import { decideProposals, type ProposalDecision } from "@/server/import/proposals";
import {
  approveReview,
  discardJob,
  readPageAsRecipe,
  rereadWithNeighbour,
} from "@/server/import/review";
import { createSessionClient } from "@/server/supabase/server";

/** Upper bound for one batch, to keep a slip of the finger from uploading a whole camera roll. */
const MAX_PHOTOS = 300;

const MEALS: readonly Meal[] = ["lunch", "dinner", "coffee"];

/**
 * Starts a batch for the photos named. `forMeal` is the meal of the week plan the upload
 * was started from, if it was.
 */
export async function startBatch(
  sourceBook: string,
  fileNames: string[],
  forMeal: { date: string; meal: string } | null = null,
): Promise<{ batchId: string; targets: UploadTarget[] } | { error: string }> {
  const household = await requireHousehold();
  if (fileNames.length === 0) return { error: "Bitte mindestens ein Foto auswählen." };
  if (fileNames.length > MAX_PHOTOS) {
    return { error: `Höchstens ${MAX_PHOTOS} Fotos auf einmal. Teile das Buch in mehrere Stapel.` };
  }
  const meal = MEALS.find((name) => name === forMeal?.meal);
  const place = forMeal && isIsoDate(forMeal.date) && meal ? { date: forMeal.date, meal } : null;
  const db = await createSessionClient();
  const batchId = await createBatch(
    db,
    household.id,
    household.userId,
    sourceBook.trim() || null,
    place,
  );
  const targets = await addPages(db, household.id, batchId, fileNames);
  return { batchId, targets };
}

/** Where to go after a recipe is dealt with: the next one waiting, or back to the batch. */
async function nextInQueue(batchId: string): Promise<string> {
  const db = await createSessionClient();
  const waiting = must(
    await db
      .from("import_job")
      .select("id")
      .eq("status", "needs_review")
      .not("recipe_id", "is", null)
      .order("created_at")
      .order("position")
      .limit(1),
    "load review queue",
  );
  return waiting[0] ? `/import/pruefen/${waiting[0].id}` : `/import/${batchId}`;
}

export async function submitReview(
  jobId: string,
  batchId: string,
  input: ReviewInput,
): Promise<{ errors: ReviewErrors }> {
  const household = await requireHousehold();
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) return { errors: { title: "Das Formular konnte nicht gelesen werden." } };
  const db = await createSessionClient();
  const result = await approveReview(db, household.id, jobId, parsed.data);
  if (!result.ok) return { errors: result.errors };
  // A recipe uploaded for a meal of the week plan goes there now, and so does its reader.
  const placed = await placeForMeal(db, household.id, batchId);
  revalidatePath("/", "layout");
  if (placed) redirect(`/woche?w=${mondayOf(placed.date)}#tag-${placed.date}`);
  redirect(await nextInQueue(batchId));
}

export async function discardRecipe(jobId: string, batchId: string): Promise<void> {
  await requireHousehold();
  await discardJob(await createSessionClient(), jobId);
  revalidatePath("/", "layout");
  redirect(await nextInQueue(batchId));
}

export async function rereadWithPage(
  jobId: string,
  batchId: string,
  side: "before" | "after",
): Promise<{ error: string }> {
  await requireHousehold();
  const found = await rereadWithNeighbour(await createSessionClient(), jobId, side);
  if (!found) return { error: "Auf dieser Seite gibt es kein weiteres Foto im Stapel." };
  revalidatePath("/", "layout");
  redirect(`/import/${batchId}`);
}

export async function readIgnoredPage(pageId: string): Promise<void> {
  const household = await requireHousehold();
  const batchId = await readPageAsRecipe(await createSessionClient(), household.id, pageId);
  revalidatePath("/", "layout");
  redirect(`/import/${batchId}`);
}

export async function submitProposalDecisions(
  decisions: ProposalDecision[],
): Promise<{ errors: Record<string, string> }> {
  const household = await requireHousehold();
  const errors = await decideProposals(await createSessionClient(), household.id, decisions);
  revalidatePath("/", "layout");
  return { errors };
}

export async function removeBatch(batchId: string): Promise<void> {
  const household = await requireHousehold();
  await deleteBatch(await createSessionClient(), household.id, batchId);
  revalidatePath("/", "layout");
  redirect("/import");
}
