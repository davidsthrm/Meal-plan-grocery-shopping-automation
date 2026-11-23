import { isBought, type Decision } from "./decisions";

/**
 * Lines ticked off go to the end of their note and of the view for the shop, under
 * "Gekauft", by the same shop sections and kinds of grocery as what is still open above
 * them. David, 22 November 2026: "when ticking entries they should drop to the very end of
 * the page. keep the categories tho." A ticked line among the open ones had to be read past
 * on every look at the note.
 *
 * A line goes a moment after the last tick in the view, not with the tap: quick ticks go
 * together, and nothing jumps away under the thumb that reaches for the next line. Where a
 * line stands comes from what the device shows as decided, never from the server's order,
 * so that the page read again cannot move a line a second time.
 */

/** How long after the last tick in the view the lines ticked go to "Gekauft". */
export const SETTLE_MS = 450;

/** How long a line folds out of its place on its way (`.swipe-row[data-gone]`). */
export const FOLD_MS = 160;

/** A line of the view as the device shows it. */
export interface ShownLine {
  key: string;
  /** What it shows as decided: this device's own decision over an older page. */
  decision: Decision;
  /** When this device made the decision shown, where it did (`Tick.at`). */
  at?: number;
  /** Opened on the note: it stays where it is until it is closed. */
  held?: boolean;
}

/** Where the lines of a view stand, and when that changes next. */
export interface Settled {
  /** Under "Gekauft". */
  placed: ReadonlySet<string>;
  /** Folding out of their place, on their way to "Gekauft". */
  folding: ReadonlySet<string>;
  /** What came under "Gekauft" last, to be said and to unfold; empty once one came back. */
  arrived: readonly string[];
  /** Bought and not opened, when last seen: a change is a tick in the view. */
  ticked: ReadonlySet<string>;
  /** When `ticked` last changed. */
  tickedAt: number;
  /** When the lines folding began to. */
  foldingSince: number;
  /** When the view was drawn. */
  drawnAt: number;
  /** When to settle again, or null while nothing waits. */
  due: number | null;
}

const NONE: ReadonlySet<string> = new Set();

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((key) => b.has(key));

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, index) => b[index] === key);

const keep = (keys: ReadonlySet<string>, wanted: (key: string) => boolean) =>
  new Set([...keys].filter(wanted));

/**
 * Where the lines stand at `now`, from where they stood (`before`, null when the view is
 * drawn) and what they show as decided now. Bought when the view is drawn, a line is under
 * "Gekauft" at once; ticked later, it folds out of its place `delayMs` after the last tick
 * and comes under "Gekauft" `foldMs` later (no fold at all with 0). Taken back, it is in its
 * kind again at once. A line removed or bought on another note goes nowhere: it folds away
 * where it stands, as it always has.
 */
export function settleTicked(
  before: Settled | null,
  lines: readonly ShownLine[],
  now: number,
  { delayMs = SETTLE_MS, foldMs = FOLD_MS }: { delayMs?: number; foldMs?: number } = {},
): Settled {
  const bought = lines.filter((line) => isBought(line.decision));
  const ticked = new Set(bought.filter((line) => !line.held).map((line) => line.key));
  if (!before) {
    return {
      placed: new Set(bought.map((line) => line.key)),
      folding: NONE,
      arrived: [],
      ticked,
      tickedAt: now,
      foldingSince: now,
      drawnAt: now,
      due: null,
    };
  }

  const sameTicked = sameSet(ticked, before.ticked);
  const tickedAt = sameTicked ? before.tickedAt : now;
  const here = new Set(lines.map((line) => line.key));
  const back = new Set(
    lines.filter((line) => line.decision.kind === "open" && !line.held).map((line) => line.key),
  );
  // Taken back: in its kind again at once. No longer on the page: forgotten.
  let placed = keep(before.placed, (key) => here.has(key) && !back.has(key));
  let arrived = [...before.placed].some((key) => back.has(key))
    ? []
    : before.arrived.filter((key) => placed.has(key));
  // Ticked before the view was drawn and known only now, as a tick kept on the device that
  // is read after the page: it was there when the page was drawn.
  for (const line of bought) {
    if (!line.held && line.at !== undefined && line.at <= before.drawnAt) placed.add(line.key);
  }
  let folding: ReadonlySet<string> = keep(before.folding, (key) => ticked.has(key));
  let foldingSince = before.foldingSince;
  if (folding.size > 0 && now >= foldingSince + foldMs) {
    placed = new Set([...placed, ...folding]);
    arrived = [...folding];
    folding = NONE;
  }
  let waiting = [...ticked].filter((key) => !placed.has(key) && !folding.has(key));
  if (waiting.length > 0 && now >= tickedAt + delayMs) {
    if (foldMs > 0) {
      folding = new Set([...folding, ...waiting]);
      foldingSince = now;
    } else {
      placed = new Set([...placed, ...waiting]);
      arrived = waiting;
    }
    waiting = [];
  }
  const next = Math.min(
    folding.size > 0 ? foldingSince + foldMs : Infinity,
    waiting.length > 0 ? tickedAt + delayMs : Infinity,
  );
  const due = Number.isFinite(next) ? next : null;

  if (
    sameTicked &&
    sameSet(placed, before.placed) &&
    sameSet(folding, before.folding) &&
    sameList(arrived, before.arrived) &&
    foldingSince === before.foldingSince &&
    due === before.due
  ) {
    return before;
  }
  return {
    placed,
    folding,
    arrived,
    ticked: sameTicked ? before.ticked : ticked,
    tickedAt,
    foldingSince,
    drawnAt: before.drawnAt,
    due,
  };
}

/**
 * The open part of a view and its "Gekauft", each by the same shop sections and kinds of
 * grocery, in their order, without a kind or a section left empty.
 */
export function splitByPlaced<
  S extends { groups: readonly { lines: readonly { key: string }[] }[] },
>(sections: readonly S[], placed: ReadonlySet<string>): { open: S[]; bought: S[] } {
  const part = (underBought: boolean): S[] =>
    sections.flatMap((section) => {
      const groups = section.groups.flatMap((group) => {
        const lines = group.lines.filter((line) => placed.has(line.key) === underBought);
        return lines.length > 0 ? [{ ...group, lines }] : [];
      });
      return groups.length > 0 ? [{ ...section, groups }] : [];
    });
  return { open: part(false), bought: part(true) };
}
