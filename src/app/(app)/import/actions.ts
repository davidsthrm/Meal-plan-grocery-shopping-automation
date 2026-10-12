"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reviewInput, type ReviewErrors, type ReviewInput } from "@/domain/import/review-input";
import { requireHousehold } from "@/server/auth";
import { must } from "@/server/catalog";
import { addPages, createBatch, deleteBatch, type UploadTarget } from "@/server/import/batch";
import {
  acceptAllNew,
  acceptAsNew,
  acceptAsSynonym,
  rejectProposal,
  type NewIngredient,
} from "@/server/import/proposals";
import {
  approveReview,
  discardJob,
  readPageAsRecipe,
  rereadWithNeighbour,
} from "@/server/import/review";
import { createSessionClient } from "@/server/supabase/server";

/** Upper bound for one batch, to keep a slip of the finger from uploading a whole camera roll. */
const MAX_PHOTOS = 300;

export async function startBatch(
  sourceBook: string,
  fileNames: string[],
): Promise<{ batchId: string; targets: UploadTarget[] } | { error: string }> {
  const household = await requireHousehold();
  if (fileNames.length === 0) return { error: "Bitte mindestens ein Foto auswählen." };
  if (fileNames.length > MAX_PHOTOS) {
    return { error: `Höchstens ${MAX_PHOTOS} Fotos auf einmal. Teile das Buch in mehrere Stapel.` };
  }
  const db = await createSessionClient();
  const batchId = await createBatch(db, household.id, household.userId, sourceBook.trim() || null);
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
  revalidatePath("/", "layout");
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

export async function decideProposal(
  proposalId: string,
  decision:
    | { kind: "same"; ingredientId: string }
    | { kind: "new"; ingredient: NewIngredient }
    | { kind: "reject" },
): Promise<{ error: string | null }> {
  const household = await requireHousehold();
  const db = await createSessionClient();
  let error: string | null = null;
  if (decision.kind === "same") await acceptAsSynonym(db, proposalId, decision.ingredientId);
  else if (decision.kind === "new") {
    error = await acceptAsNew(db, household.id, proposalId, decision.ingredient);
  } else await rejectProposal(db, proposalId);
  if (!error) revalidatePath("/", "layout");
  return { error };
}

export async function acceptAllNewProposals(): Promise<void> {
  const household = await requireHousehold();
  await acceptAllNew(await createSessionClient(), household.id);
  revalidatePath("/", "layout");
}

export async function removeBatch(batchId: string): Promise<void> {
  const household = await requireHousehold();
  await deleteBatch(await createSessionClient(), household.id, batchId);
  revalidatePath("/", "layout");
  redirect("/import");
}
