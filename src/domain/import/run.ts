/**
 * Reading a batch on the server, without a page open to drive it: after a photo taken for
 * one recipe, the phone uploads it and may be put away. The server does the steps one after
 * the other (`processNext`) for as long as a function may run, and what is left is done the
 * next time the batch page is open.
 */

/** What one step of a batch came to. */
export type StepOutcome =
  | "worked"
  | "waiting"
  | "done"
  /** The model service asked for a pause or did not answer in time. */
  | "throttled"
  /** Anything else went wrong: stop, the batch page carries on later. */
  | "failed";

/** How long a function may run on Vercel, less a margin for the last step to end in. */
export const RUN_BUDGET_MS = 240_000;
/** A step of a model reading a recipe takes up to this long (two passes of 90 s at most). */
const LONGEST_STEP_MS = 60_000;
const WAIT_MS = 1_500;
const THROTTLED_MS = 20_000;

/**
 * What comes after a step: stop, or another step after a pause. A step is begun only while
 * there is time left for a long one.
 */
export function afterStep(
  outcome: StepOutcome,
  elapsedMs: number,
  budgetMs = RUN_BUDGET_MS,
): { stop: true } | { stop: false; pauseMs: number } {
  if (outcome === "done" || outcome === "failed") return { stop: true };
  const pauseMs = outcome === "waiting" ? WAIT_MS : outcome === "throttled" ? THROTTLED_MS : 0;
  if (elapsedMs + pauseMs + LONGEST_STEP_MS > budgetMs) return { stop: true };
  return { stop: false, pauseMs };
}

/** How many runs one after the other may read a batch: two hours, far more than any book. */
export const MAX_ROUNDS = 30;
/** A run is handed on only while the login it acts with is good for longer than this. */
const LOGIN_MARGIN_S = 6 * 60;

/**
 * Whether a run that ran out of time hands the batch on to a new one. It acts with the
 * login of whoever pressed "Fertig", and never renews it: a renewal from here would compete
 * with the phone's own and could sign it out. What is left after that is read when the batch
 * page is open.
 */
export function handOn(
  done: boolean,
  round: number,
  loginExpiresAt: number | null,
  nowS: number,
): boolean {
  if (done || round >= MAX_ROUNDS || loginExpiresAt === null) return false;
  return loginExpiresAt - nowS > LOGIN_MARGIN_S;
}
