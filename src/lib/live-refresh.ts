/**
 * When an open page reads itself again after the household changed something elsewhere
 * (`LiveRefresh`). Kept apart from the component so that it can be tested without a browser.
 */

/** What the household changes together day by day: the plan, the notes, the Merkzettel. */
export const DAILY_TABLES = [
  "week_plan",
  "plan_slot",
  "plan_slot_item",
  "plan_slot_food",
  "plan_extra",
  "shopping_manual_entry",
  "shopping_line_state",
  "restock_item",
  "household",
] as const;

/**
 * What the household looks after: recipes with their favourites and wishes, tags, the
 * catalog, the shops, the members. An import writes these by the hundred.
 */
export const LIBRARY_TABLES = [
  "recipe",
  "recipe_tag",
  "tag",
  "ingredient",
  "aisle_group",
  "shop",
  "household_member",
  "household_invite",
] as const;

/** The tables whose change makes the search index of the browser out of date. */
export const SEARCHED_TABLES: ReadonlySet<string> = new Set([
  "recipe",
  "recipe_tag",
  "tag",
  "ingredient",
]);

export type Pace = "daily" | "library";

/** How long a burst of changes is waited out before the page is read: one read for it. */
export const SETTLE_MS: Record<Pace, number> = { daily: 500, library: 3000 };

/**
 * However long a burst lasts, the page is read at least this often while it does: another
 * device importing a cookbook should not make the open page wait until it is done.
 */
export const LONGEST_WAIT_MS = 10_000;

/**
 * How long after a tap on this device a change is taken for its own. The page that comes
 * back from the tap is already up to date, and reading it once more right away would only
 * make the next tap wait.
 */
export const OWN_MS = 3000;

/**
 * When the page should be read again, as a time.
 *
 * - `now`: when the latest change arrived
 * - `firstAt`: when the first change still waiting arrived (`now` for a new burst)
 * - `pace`: the quickest pace among the changes waiting
 * - `lastOwn`: when this device last sent a form
 */
export function refreshAt({
  now,
  firstAt,
  pace,
  lastOwn,
}: {
  now: number;
  firstAt: number;
  pace: Pace;
  lastOwn: number;
}): number {
  const settled = Math.min(now + SETTLE_MS[pace], firstAt + LONGEST_WAIT_MS);
  return Math.max(settled, lastOwn + OWN_MS);
}

/** The quicker of two paces: a planned meal is not held back by an import running alongside. */
export function quicker(a: Pace | null, b: Pace): Pace {
  return a === "daily" || b === "daily" ? "daily" : "library";
}

/**
 * Sent on `window` when this device changed something without a form: a tick sent to the
 * server. Its echo from Realtime is taken for the device's own, as after a tap on a button.
 */
export const OWN_CHANGE = "essensplan:own-change";

/**
 * How long a page may be out of view and still be up to date when it comes back, where no
 * change arrived meanwhile. Longer, the connection to Realtime may have broken off unnoticed.
 */
export const AWAY_MS = 30_000;

/**
 * Whether a page that comes back into view reads itself again: when a change arrived while
 * it was out of view, or it was away long enough to have missed one. Switching to another
 * app and back for a moment does not: on a phone that read the whole page every time.
 */
export function readOnReturn({ awayMs, missed }: { awayMs: number; missed: boolean }): boolean {
  return missed || awayMs >= AWAY_MS;
}
