import { z } from "zod";
import type { PageSurvey } from "./survey";

/**
 * The preparation steps of a recipe: one entry per printed step, in printed order, so that
 * the app can stand in for the cookbook at the stove. A model copies them from the photo; a
 * person can type or correct them, one step per line.
 */

/** Where the model marks a part of a step it could not read. Never filled in with a guess. */
export const GAP = "[…]";

/** More than any recipe prints. A longer list is somebody's whole document. */
export const STEPS_MAX = 40;
/** Characters of one step. The longest printed paragraph in the samples has about 900. */
export const STEP_MAX_LENGTH = 2000;

/** "1.", "2)", "3 –", "Schritt 4:" in front of a step: the list numbers it already. */
const LEADING_NUMBER = /^(?:schritt\s*)?\d{1,2}\s*(?:[.):]|[-–]\s)\s*/i;

/** One step as it is stored: single spaces, no number of its own, a gap written one way. */
export function cleanStep(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\[\s*(?:\.\.\.|…)\s*\]/g, GAP)
    .trim()
    .replace(LEADING_NUMBER, "")
    .trim();
}

/** The steps as they are stored: cleaned, without empty entries. */
export function cleanSteps(steps: readonly string[]): string[] {
  return steps.map(cleanStep).filter((step) => step !== "");
}

export type StepProblem =
  /** A step holds a part the model could not read. */
  | { code: "steps_unreadable"; step: number }
  /** The last step ends in the middle of a word or a sentence: the rest is elsewhere. */
  | { code: "steps_cut_off"; step: number }
  /** The first look at the page saw steps, and none were read. */
  | { code: "steps_missing"; step: null };

/**
 * What can be told about read steps without a model. `shown` is whether the first look at the
 * pages saw steps for this recipe, null when it is not known.
 */
export function stepProblems(
  steps: readonly string[],
  shown: boolean | null = null,
): StepProblem[] {
  const problems: StepProblem[] = [];
  steps.forEach((step, at) => {
    if (step.includes(GAP)) problems.push({ code: "steps_unreadable", step: at });
  });
  const last = steps.at(-1);
  // A hyphen, comma or semicolon is never the end of a printed recipe.
  if (last !== undefined && /[-,;]$/.test(last)) {
    problems.push({ code: "steps_cut_off", step: steps.length - 1 });
  }
  if (steps.length === 0 && shown === true) problems.push({ code: "steps_missing", step: null });
  return problems;
}

/** A step problem in words, in German, for whoever cooks or reviews the recipe. */
export function stepProblemText(problem: StepProblem): string {
  switch (problem.code) {
    case "steps_unreadable":
      return `Schritt ${problem.step + 1} war nicht ganz lesbar (${GAP}).`;
    case "steps_cut_off":
      return `Schritt ${problem.step + 1} bricht mitten im Satz ab. Der Rest steht wohl auf einer anderen Seite.`;
    case "steps_missing":
      return "Auf dem Foto stehen Arbeitsschritte, gelesen wurde keiner.";
  }
}

/**
 * Whether the first look at the pages saw steps for the recipe meant: on a page with several
 * recipes the one at `focus.position`, otherwise the only recipe of a page. Null when no page
 * says it clearly.
 */
export function surveySawSteps(
  surveys: readonly (PageSurvey | null)[],
  focus: { position: number; count: number } | null,
): boolean | null {
  const parts = surveys.flatMap((survey) => {
    if (!survey) return [];
    if (focus) {
      return survey.recipes.length === focus.count ? [survey.recipes[focus.position - 1]] : [];
    }
    return survey.recipes.length === 1 ? survey.recipes : [];
  });
  if (parts.length === 0) return null;
  return parts.some((part) => part?.hasSteps === true);
}

/**
 * Steps as a person types them: one per line, numbered or not. Returns the steps, or what is
 * wrong. Nothing typed is null: the steps are not known, which is not the same as a recipe
 * that has none.
 */
export function readTypedSteps(
  text: string,
): { ok: true; steps: string[] | null } | { ok: false; error: string } {
  const steps = cleanSteps(text.split(/\r?\n/));
  if (steps.length > STEPS_MAX) {
    return { ok: false, error: `Höchstens ${STEPS_MAX} Schritte.` };
  }
  const long = steps.findIndex((step) => step.length > STEP_MAX_LENGTH);
  if (long !== -1) {
    return {
      ok: false,
      error: `Schritt ${long + 1} ist zu lang. Höchstens ${STEP_MAX_LENGTH} Zeichen pro Schritt.`,
    };
  }
  return { ok: true, steps: steps.length === 0 ? null : steps };
}

/**
 * Steps a person saved where the recipe's steps are looked at, on its page or among the steps
 * to check: one per line, and an empty field is a recipe without any. Unlike in the form for
 * the whole recipe, nothing here is left unknown, so the steps are not read from the photo
 * again.
 */
export function savedSteps(
  text: string,
): { ok: true; steps: string[] } | { ok: false; error: string } {
  const read = readTypedSteps(text);
  return read.ok ? { ok: true, steps: read.steps ?? [] } : read;
}

/** Steps as they stand in the form to change them: one per line. */
export function typedSteps(steps: readonly string[] | null): string {
  return (steps ?? []).join("\n");
}

/** What a model returns when it reads the steps alone, for a recipe in the library. */
export const stepsReadingSchema = z.object({
  steps: z.array(z.string()),
  /** What could not be read with certainty, in German. */
  uncertain: z.array(z.object({ field: z.string(), reason: z.string() })),
  notes: z.array(z.string()),
});

export type StepsReading = z.infer<typeof stepsReadingSchema>;

/** A place where the second look saw something else in the steps. */
export interface StepDisagreement {
  /** Position from 0 of the step concerned, null for a step that is missing. */
  stepIndex: number | null;
  field: string;
  printed: string;
  transcribed: string;
}

/**
 * Settles what is stored for a recipe whose steps were read after it was approved. The steps
 * are kept as read, with every doubt beside them in German: the recipe stays in the library,
 * and whoever cooks from it sees where to look at the photo. Without steps on the photos it
 * is an empty list, which is not read again.
 */
export function settleSteps(
  reading: StepsReading,
  disagreements: readonly StepDisagreement[] | null,
): { steps: string[]; doubts: string[] } {
  const steps = cleanSteps(reading.steps);
  const doubts = [
    ...reading.uncertain.map((doubt) => doubt.reason.trim()).filter(Boolean),
    ...stepProblems(steps)
      // The model has already said what it could not read; its gaps need no second word.
      .filter((problem) => problem.code !== "steps_unreadable" || reading.uncertain.length === 0)
      .map(stepProblemText),
  ];
  if (disagreements === null) {
    if (steps.length > 0) doubts.push("Die Arbeitsschritte konnten nicht gegengeprüft werden.");
  } else {
    for (const seen of disagreements) doubts.push(disagreementText(seen));
  }
  return { steps, doubts: [...new Set(doubts)] };
}

/** What the second look saw differently, in German. */
export function disagreementText(seen: StepDisagreement): string {
  const where = seen.stepIndex === null ? "Ein Schritt fehlt" : `Schritt ${seen.stepIndex + 1}`;
  if (seen.field === "missing_step") return `${where}: Auf dem Foto steht „${seen.printed}“.`;
  if (seen.field === "extra_step") return `${where} steht so nicht auf dem Foto.`;
  return `${where}: Auf dem Foto steht „${seen.printed}“, gelesen wurde „${seen.transcribed}“.`;
}
