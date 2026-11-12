/** The most persons or portions a recipe on the plan is made for, as the actions allow. */
export const MOST_SERVINGS = 99;

/** What one tap on the stepper asks for: one more or one less, from 0 to 99. Zero takes it off. */
export function servingsAfterStep(shown: number, step: 1 | -1): number {
  return Math.min(MOST_SERVINGS, Math.max(0, shown + step));
}

/**
 * The number the stepper shows: what the last tap on its way asked for (`sent`, from the
 * pending form), or else what is planned. Taps that queue behind each other each start from
 * the number shown, so three quick taps on "+" end three higher.
 */
export function shownServings(planned: number, sent: unknown): number {
  return typeof sent === "string" && /^\d+$/.test(sent) ? Number(sent) : planned;
}
