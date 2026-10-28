/**
 * How a page follows the one before it, named on the link that leads there
 * (`transitionTypes`) and drawn by the view transition around the page in the layout
 * (`PAGE_MOTION`). Only a link that names one moves the page: a live refresh, the answer to
 * a form and the browser's own back button change it in place, or every tick in the shop
 * would make the note flicker.
 */

/** Deeper in, or the next one along: the new page comes in from the right. */
export const FORWARD = "nav-forward";
/** Back out, or the one before: the new page comes in from the left. */
export const BACK = "nav-back";
/** Another view of the same thing (Mahlzeiten and Außerdem): the two cross-fade. */
export const SWAP = "nav-swap";
/**
 * To a section further right in the bar, or further left: the same directions, nearer and
 * quicker. Sections are changed dozens of times a day, so their move is barely there.
 */
export const TAB_FORWARD = "nav-tab-forward";
export const TAB_BACK = "nav-tab-back";

/** The view transition classes of the page, by the type of the navigation. */
export const PAGE_MOTION = {
  [FORWARD]: FORWARD,
  [BACK]: BACK,
  [SWAP]: SWAP,
  [TAB_FORWARD]: TAB_FORWARD,
  [TAB_BACK]: TAB_BACK,
  default: "none",
} as const;

/**
 * Between two sections of the bar: the one further right comes in from the right, so that
 * the page moves the way the finger went along the bar.
 */
export function sideways(from: number, to: number): string[] {
  if (from < 0 || to === from) return [SWAP];
  return [to > from ? TAB_FORWARD : TAB_BACK];
}
