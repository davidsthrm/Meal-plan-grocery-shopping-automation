import type { CatalogIndex } from "../catalog";
import { addDays, daysBetween, isoWeekday, type IsoDate } from "../dates";
import { AFTERNOON_WEEKDAYS, BUTCHER_REACH_DAYS, type ShoppingTrip } from "./trips";
import type { Contribution, ShoppingLine } from "./types";

/**
 * Buying something on another errand than its own: a whole errand on another day, or one
 * line on another note. Whether that works, and if not, why not. The household decides
 * when it shops; the app says what would go wrong.
 */

export type DayProblem =
  /** The day is over. */
  | { kind: "past" }
  /**
   * Something is needed before that errand: on an earlier day, or at lunch on the errand's
   * own working day, when the household shops in the afternoon.
   */
  | { kind: "too-late"; label: string; neededOn: IsoDate; lunch: boolean }
  /** Something would not keep from that day until it is needed. */
  | { kind: "does-not-keep"; label: string; neededOn: IsoDate; shelfLifeDays: number };

/** When a part of a line is needed: its day, and whether at lunch before the errands. */
interface Use {
  date: IsoDate;
  lunch: boolean;
  /** The last day an errand can buy for it. */
  lastErrand: IsoDate;
}

function useOf({ source }: Contribution): Use | null {
  if (source.type === "manual" || source.date === null) return null;
  const lunch =
    source.type !== "extra" &&
    source.meal === "lunch" &&
    AFTERNOON_WEEKDAYS.includes(isoWeekday(source.date));
  return { date: source.date, lunch, lastErrand: lunch ? addDays(source.date, -1) : source.date };
}

/**
 * When one line can be bought, as far as its meals say: what buying it on another day is
 * held against. Null for a line that belongs to no meal: toilet paper can be bought any day.
 */
export interface LineWindow {
  label: string;
  /** The first meal it is for: its day, whether at lunch, and the last errand in time. */
  first: Use;
  /** The last day it is needed. */
  lastUse: IsoDate;
  /** Days it stays good after buying, by the catalog. Null: it keeps. */
  shelfLifeDays: number | null;
  /** Bought shortly before its meal anyway. */
  later: boolean;
}

export function lineWindow(line: ShoppingLine, index: CatalogIndex): LineWindow | null {
  const uses = line.contributions.flatMap((part) => useOf(part) ?? []);
  if (uses.length === 0) return null;
  return {
    label: line.label,
    first: uses.reduce((a, b) => (b.lastErrand < a.lastErrand ? b : a)),
    lastUse: uses.reduce((a, b) => (b.date > a.date ? b : a)).date,
    shelfLifeDays: line.ingredientId
      ? (index.ingredientById.get(line.ingredientId)?.shelfLifeDays ?? null)
      : null,
    later: line.trip === "later",
  };
}

/**
 * What stands in the way of buying one line on `target`: an errand after it is needed, or
 * one so early that it would not keep. For the butcher a visit's reach stands for the shelf
 * life: the household buys there for those days on purpose and keeps the meat cold, as the
 * butcher's days are worked out (`butcherDay`). `later`: a line bought shortly before its
 * meal is only asked whether that errand comes too late; "skip" asks nothing.
 */
export function windowProblems(
  window: LineWindow | null,
  target: ShoppingTrip,
  later: "too-late" | "skip",
): DayProblem[] {
  if (!window || (window.later && later === "skip")) return [];
  const { first, label } = window;
  if (target.date > first.lastErrand) {
    return [{ kind: "too-late", label, neededOn: first.date, lunch: first.lunch }];
  }
  if (window.later) return [];
  const keeps = target.place === "butcher" ? BUTCHER_REACH_DAYS : window.shelfLifeDays;
  if (keeps !== null && daysBetween(target.date, window.lastUse) > keeps) {
    return [{ kind: "does-not-keep", label, neededOn: window.lastUse, shelfLifeDays: keeps }];
  }
  return [];
}

/**
 * Whether a problem rules a day out: it is over, or something is needed before it. That
 * something would not keep so long only warns: the catalog's shelf lives are estimates, and
 * the household knows whether its salad lasts from Wednesday to Sunday (October 2026).
 */
export function blocks(problem: DayProblem): boolean {
  return problem.kind !== "does-not-keep";
}

/**
 * What stands in the way of doing the errand of a note on `target` instead. Nothing does
 * when the answer is empty. A line that is bought shortly before its meal anyway is no
 * obstacle, and neither is one that belongs to no meal.
 */
export function dayProblems(
  lines: readonly ShoppingLine[],
  target: ShoppingTrip,
  today: IsoDate,
  index: CatalogIndex,
): DayProblem[] {
  if (target.date < today) return [{ kind: "past" }];
  return lines.flatMap((line) => windowProblems(lineWindow(line, index), target, "skip"));
}

/**
 * The days a whole errand is offered on instead of its own: from today, or a week before
 * it, up to three days after it. Earlier is as much a choice as later: Friday's errand done
 * on Wednesday (October 2026).
 */
export function noteDays(noteDate: IsoDate, today: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  const from = addDays(noteDate, -6) > today ? addDays(noteDate, -6) : today;
  for (let day = from; day <= addDays(noteDate, 3); day = addDays(day, 1)) {
    if (day !== noteDate) days.push(day);
  }
  return days;
}
