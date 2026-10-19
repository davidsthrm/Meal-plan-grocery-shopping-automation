/**
 * Back from a recipe to the list it was opened from, where it was left: the same filter, the
 * same place on the page, each shelf scrolled as it was. A link that opened the list afresh
 * showed it unfiltered and at the top, so the way back is a step back in the history whenever
 * the step before the recipe is that list.
 */

export const LIST_RETURN_KEY = "liste-zurueck";

/** What a list remembers as a recipe is opened from it. */
export interface LeftList {
  /** Path and query of the list: "/rezepte?kategorie=hauptgericht". */
  path: string;
  /** The length of the history while the list was shown. */
  historyLength: number;
  scrollY: number;
  /** How far each shelf of the page was scrolled sideways, in their order. */
  shelves: number[];
}

/** Reads what a list remembered, or null for anything that is not that. */
export function readLeftList(stored: string | null): LeftList | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<LeftList>;
    if (typeof value.path !== "string" || !value.path.startsWith("/")) return null;
    if (typeof value.historyLength !== "number" || typeof value.scrollY !== "number") return null;
    const shelves = Array.isArray(value.shelves)
      ? value.shelves.filter((left): left is number => typeof left === "number")
      : [];
    return {
      path: value.path,
      historyLength: value.historyLength,
      scrollY: value.scrollY,
      shelves,
    };
  } catch {
    return null;
  }
}

/**
 * Whether the link back to `href` ("/rezepte") can be a step back: the list was left for
 * the page shown now, nothing else was opened in between, and it is the list the link names.
 */
export function canStepBack(left: LeftList | null, href: string, historyLength: number): boolean {
  if (!left) return false;
  const pathOf = (address: string) => address.split(/[?#]/)[0];
  return pathOf(left.path) === pathOf(href) && historyLength === left.historyLength + 1;
}

/**
 * Whether the list now shown is the one a recipe was opened from, reached by stepping back:
 * the history is as long as it was with the recipe in it. Opened afresh, from a tab or a
 * link, the history has grown by one more, and the list starts at the top.
 */
export function cameBack(left: LeftList, path: string, historyLength: number): boolean {
  return left.path === path && historyLength === left.historyLength + 1;
}
