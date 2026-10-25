import { after, NextResponse } from "next/server";
import { handOn } from "@/domain/import/run";
import { runBatch } from "@/server/import/run-batch";
import { createSessionClient } from "@/server/supabase/server";

// The reading goes on after the answer, for as long as a function may run.
export const maxDuration = 300;

/**
 * Starts reading a batch on the server and answers at once: photos taken or picked on the
 * phone are read while the phone is put away. A run that runs out of time hands the batch on
 * to a new one, with the same login, while that lasts (`handOn`): many photos of a gallery
 * are read to the end too. Anything left then is read when the batch page is open.
 */
export async function POST(request: Request, context: RouteContext<"/api/import/[batchId]/run">) {
  const { batchId } = await context.params;
  const db = await createSessionClient();
  // Row level security: a batch of another household does not exist for this user.
  const { data: batch } = await db
    .from("import_batch")
    .select("id, household_id")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: login } = await db.auth.getClaims();
  const round = Number(new URL(request.url).searchParams.get("runde")) || 1;
  const cookie = request.headers.get("cookie") ?? "";
  after(async () => {
    // A shorter run, only to try the handing on in a test (`IMPORT_RUN_BUDGET_MS`).
    const budget = Number(process.env.IMPORT_RUN_BUDGET_MS) || undefined;
    const done = await runBatch(db, batch.household_id, batchId, budget);
    console.log(`import run ${round} of ${batchId}: ${done ? "through" : "handing on"}`);
    const expires = typeof login?.claims?.exp === "number" ? login.claims.exp : null;
    if (!handOn(done, round, expires, Math.floor(Date.now() / 1000))) return;
    const next = new URL(`/api/import/${batchId}/run?runde=${round + 1}`, request.url);
    await fetch(next, { method: "POST", headers: { cookie } }).catch((error: unknown) => {
      console.error("import run could not be handed on", error);
    });
  });
  return NextResponse.json({ started: true });
}
