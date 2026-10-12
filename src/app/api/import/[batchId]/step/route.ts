import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { batchProgress, processNext } from "@/server/import/batch";
import { createSessionClient } from "@/server/supabase/server";

// One step can be a model reading a recipe twice. Leave it room.
export const maxDuration = 120;

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
    .select("id, household_id")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const result = await processNext(db, batch.household_id, batchId);
    return NextResponse.json({ result, progress: await batchProgress(db, batchId) });
  } catch (error) {
    // The model service asks for a pause, or is overloaded. The step was put back; the page
    // waits a little and carries on by itself.
    const busy =
      error instanceof Anthropic.RateLimitError ||
      (error instanceof Anthropic.APIError && (error.status === 529 || error.status === 503));
    if (busy) {
      return NextResponse.json({ result: "throttled", progress: await batchProgress(db, batchId) });
    }
    console.error("import step failed", error);
    return NextResponse.json({ error: "step failed" }, { status: 500 });
  }
}
