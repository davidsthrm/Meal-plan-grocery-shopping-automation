import type { CatalogIndex } from "../catalog";
import { addDays, daysBetween, isoWeekday, type IsoDate } from "../dates";
import { AFTERNOON_WEEKDAYS, BUTCHER_REACH_DAYS, noteId, type ShoppingTrip } from "./trips";
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
 * How long something bought on an errand is fine until its meal: its shelf life, or for the
 * butcher the days a visit reaches. The household buys there for those days on purpose and
 * keeps the meat cold, as the butcher's days are worked out (`butcherDay`). Null: it keeps.
 */
function keepsFor(line: ShoppingLine, target: ShoppingTrip, index: CatalogIndex): number | null {
  if (target.place === "butcher") return BUTCHER_REACH_DAYS;
  return line.ingredientId
    ? (index.ingredientById.get(line.ingredientId)?.shelfLifeDays ?? null)
    : null;
}

/**
 * What stands in the way of buying one line on `target`. `later`: a line bought shortly
 * before its meal is only asked whether that errand comes too late; "skip" asks nothing.
 */
function lineProblems(
  line: ShoppingLine,
  target: ShoppingTrip,
  index: CatalogIndex,
  later: "too-late" | "skip",
): DayProblem[] {
  const uses = line.contributions.flatMap((part) => useOf(part) ?? []);
  if (uses.length === 0 || (line.trip === "later" && later === "skip")) return [];
  const first = uses.reduce((a, b) => (b.lastErrand < a.lastErrand ? b : a));
  if (target.date > first.lastErrand) {
    return [{ kind: "too-late", label: line.label, neededOn: first.date, lunch: first.lunch }];
  }
  if (line.trip === "later") return [];
  const last = uses.reduce((a, b) => (b.date > a.date ? b : a)).date;
  const keeps = keepsFor(line, target, index);
  if (keeps !== null && daysBetween(target.date, last) > keeps) {
    return [{ kind: "does-not-keep", label: line.label, neededOn: last, shelfLifeDays: keeps }];
  }
  return [];
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
  return lines.flatMap((line) => lineProblems(line, target, index, "skip"));
}

/**
 * What stands in the way of buying one line on another note. As for a whole errand, and a
 * line bought shortly before its meal may still not go to an errand after that meal.
 */
export function moveProblems(
  line: ShoppingLine,
  target: ShoppingTrip,
  today: IsoDate,
  index: CatalogIndex,
): DayProblem[] {
  if (target.date < today) return [{ kind: "past" }];
  return lineProblems(line, target, index, "too-late");
}

/**
 * The other notes one line can be bought on instead: those of food errands where it is in
 * time and keeps. The drugstore's note is written by hand and takes no food.
 */
export function moveTargets(
  line: ShoppingLine,
  here: ShoppingTrip,
  notes: readonly ShoppingTrip[],
  today: IsoDate,
  index: CatalogIndex,
): ShoppingTrip[] {
  if (here.place === "drugstore") return [];
  return notes.filter(
    (trip) =>
      noteId(trip) !== noteId(here) &&
      trip.place !== "drugstore" &&
      moveProblems(line, trip, today, index).length === 0,
  );
}
