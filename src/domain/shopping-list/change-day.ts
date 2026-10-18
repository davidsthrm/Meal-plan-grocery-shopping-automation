import type { CatalogIndex } from "../catalog";
import { daysBetween, type IsoDate } from "../dates";
import { daysOf, type ShoppingLine } from "./types";

/**
 * Doing an errand on another day: whether that works for everything on its note, and if
 * not, why not. The household decides when it shops; the app says what would go wrong.
 */

export type DayProblem =
  /** The day is over. */
  | { kind: "past" }
  /** Something is needed before that day. */
  | { kind: "too-late"; label: string; neededOn: IsoDate }
  /** Something would not keep from that day until it is needed. */
  | { kind: "does-not-keep"; label: string; neededOn: IsoDate; shelfLifeDays: number };

/**
 * What stands in the way of buying the lines of a note on `target` instead. Nothing does
 * when the answer is empty. A line that is bought shortly before its meal anyway is no
 * obstacle, and neither is one that belongs to no meal.
 */
export function dayProblems(
  lines: readonly ShoppingLine[],
  target: IsoDate,
  today: IsoDate,
  index: CatalogIndex,
): DayProblem[] {
  if (target < today) return [{ kind: "past" }];
  const problems: DayProblem[] = [];
  for (const line of lines) {
    const days = daysOf(line.contributions);
    if (line.trip === "later" || days.length === 0) continue;
    const first = days[0];
    const last = days[days.length - 1];
    if (target > first) {
      problems.push({ kind: "too-late", label: line.label, neededOn: first });
      continue;
    }
    const keeps = line.ingredientId
      ? (index.ingredientById.get(line.ingredientId)?.shelfLifeDays ?? null)
      : null;
    if (keeps !== null && daysBetween(target, last) > keeps) {
      problems.push({
        kind: "does-not-keep",
        label: line.label,
        neededOn: last,
        shelfLifeDays: keeps,
      });
    }
  }
  return problems;
}
