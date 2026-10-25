import { NextResponse } from "next/server";
import { batchProgress, processNext } from "@/server/import/batch";
import { placeForMeal } from "@/server/import/for-meal";
import { isBusy } from "@/server/import/run-batch";
import { createSessionClient } from "@/server/supabase/server";

// One step can be a model reading a recipe twice. Leave it all the room Vercel Hobby has; each
// request to the model gives up long before (see `sharedClient`).
export const maxDuration = 300;

/**
 * Does the next open step of a batch and reports the progress. The batch page calls this
 * repeatedly, a few requests side by side, until nothing is left.
 */
export async function POST(_request: Request, context: RouteContext<"/api/import/[batchId]/step">) {
  const { batchId } = await context.params;
  const db = await createSessionClient();
  // Row level security: a batch of another household does not exist for this user.
  const { data: batch } = await db
    .from("import_batch")
    .select("id, household_id, for_date")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const result = await processNext(db, batch.household_id, batchId);
    // Uploaded for a meal of the week plan: the recipe goes there as soon as it is read.
    const placed = batch.for_date ? await placeForMeal(db, batch.household_id, batchId) : null;
    return NextResponse.json({ result, progress: await batchProgress(db, batchId), placed });
  } catch (error) {
    // The model service asks for a pause, is overloaded or did not answer in time. The step
    // was put back; the page waits a little and carries on by itself.
    if (isBusy(error)) {
      return NextResponse.json({ result: "throttled", progress: await batchProgress(db, batchId) });
    }
    console.error("import step failed", error);
    return NextResponse.json({ error: "step failed" }, { status: 500 });
  }
}
