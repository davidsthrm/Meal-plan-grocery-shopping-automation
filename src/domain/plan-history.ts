import { monthOfWeek, weekDates, type IsoDate } from "./dates";
import type { Meal, PlanSlot } from "./plan";

/**
 * The weeks the household has planned, to look back on and to jump between: grouped by
 * month, the newest first.
 */

export interface PlannedWeek {
  weekStart: IsoDate;
  slots: PlanSlot[];
}

export interface MonthOfWeeks {
  /** "2026-10" */
  month: string;
  weeks: PlannedWeek[];
}

/** Weeks by the month most of their days are in, newest month and newest week first. */
export function weeksByMonth(weeks: readonly PlannedWeek[]): MonthOfWeeks[] {
  const months = new Map<string, PlannedWeek[]>();
  for (const week of [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart))) {
    const month = monthOfWeek(week.weekStart);
    months.set(month, [...(months.get(month) ?? []), week]);
  }
  return [...months].map(([month, entries]) => ({ month, weeks: entries }));
}

/**
 * The weeks to list: every week with a plan, and the week being planned even while it is
 * empty, so there is always a way back to it.
 */
export function withCurrentWeek(weeks: readonly PlannedWeek[], current: IsoDate): PlannedWeek[] {
  const planned = weeks.filter((week) => week.slots.length > 0 || week.weekStart === current);
  return planned.some((week) => week.weekStart === current)
    ? planned
    : [...planned, { weekStart: current, slots: [] }];
}

/** A week as rows of days: what was planned for lunch and for dinner on each. */
export function daysOfWeek(
  week: PlannedWeek,
): { date: IsoDate; meals: Partial<Record<Meal, PlanSlot>> }[] {
  return weekDates(week.weekStart).map((date) => ({
    date,
    meals: Object.fromEntries(
      week.slots.filter((slot) => slot.date === date).map((slot) => [slot.meal, slot]),
    ),
  }));
}
