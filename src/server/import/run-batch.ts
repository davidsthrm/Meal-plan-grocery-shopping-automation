import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { afterStep, type StepOutcome } from "@/domain/import/run";
import type { Db } from "../catalog";
import { processNext } from "./batch";
import { placeForMeal } from "./for-meal";

/** Steps side by side, as the batch page does: more only meet the model's rate limits. */
const WORKERS = 2;

/** Whether the model service asked for a pause, is overloaded or did not answer in time. */
export function isBusy(error: unknown): boolean {
  return (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.APIConnectionTimeoutError ||
    (error instanceof Anthropic.APIError && (error.status === 529 || error.status === 503))
  );
}

/**
 * Reads a batch on the server until it is through or the time is up (`afterStep`), and puts
 * the recipe on the meal it was uploaded for once it is read without doubts. A recipe with
 * doubts waits under "Prüfen", where approving it plans it. Steps are claimed, so the batch
 * page may run at the same time. Answers whether the batch is through.
 */
export async function runBatch(
  db: Db,
  householdId: string,
  batchId: string,
  budgetMs?: number,
): Promise<boolean> {
  const started = Date.now();
  let done = false;
  const worker = async () => {
    for (;;) {
      let outcome: StepOutcome;
      try {
        outcome = await processNext(db, householdId, batchId);
      } catch (error) {
        outcome = isBusy(error) ? "throttled" : "failed";
        if (outcome === "failed") console.error("import run failed", error);
      }
      if (outcome === "done") done = true;
      const next = afterStep(outcome, Date.now() - started, budgetMs);
      if (next.stop) return;
      if (next.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, next.pauseMs));
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await placeForMeal(db, householdId, batchId);
  return done;
}
