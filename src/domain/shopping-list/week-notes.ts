import { PLACES } from "../catalog";
import { addDays, type IsoDate } from "../dates";
import type { PlanExtra } from "../plan";
import type { ViewLine } from "./present";
import { noteId, type ShoppingTrip } from "./trips";
import { daysOf, type ShoppingLine } from "./types";

/**
 * The shopping notes of one week, as far as that is a rule and not a read from the database:
 * which extras count, which notes the week shows, and when an errand is done.
 */

/**
 * The extras the notes of a week buy for. The weeks around it buy their extras for a day
 * like their meals, so those count where an errand of this week buys for their day. One
 * without a day is bought on its own week's first supermarket day, which only that week's
 * notes show.
 */
export function extrasToBuy(extras: {
  before: readonly PlanExtra[];
  week: readonly PlanExtra[];
  after: readonly PlanExtra[];
}): PlanExtra[] {
  const dated = (list: readonly PlanExtra[]) => list.filter((extra) => extra.date);
  return [...dated(extras.before), ...extras.week, ...dated(extras.after)];
}

/**
 * The notes a week shows, in order of day and place: the household's errands in the week,
 * every other day of the week something is bought on (the bakery for a cold supper, a note
 * moved to another day), and an errand before the week that buys for it (Saturday's market
 * for Monday).
 */
export function notesOfWeek(
  lines: readonly ShoppingLine[],
  trips: readonly ShoppingTrip[],
  weekStart: IsoDate,
): ShoppingTrip[] {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: IsoDate) => date >= weekStart && date <= weekEnd;
  const shown = new Map<string, ShoppingTrip>();
  for (const trip of trips) if (inWeek(trip.date)) shown.set(noteId(trip), trip);
  for (const line of lines) {
    const trip = { date: line.shoppingDate, place: line.place };
    const buysForWeek = trip.date < weekStart && daysOf(line.contributions).some(inWeek);
    if (inWeek(trip.date) || buysForWeek) shown.set(noteId(trip), trip);
  }
  return [...shown.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || PLACES.indexOf(a.place) - PLACES.indexOf(b.place),
  );
}

/** A tick on a line: when it was made and by whom. */
export interface LineTick {
  /** When, in milliseconds. */
  at: number;
  /** The user who made it, where that is known. */
  by: string | null;
}

/**
 * Whether an errand is done: everything on its note is ticked. Then the tick made last says
 * who finished it. Null while something is open, and for a note with nothing to buy.
 */
export function completion(
  toBuy: readonly ViewLine[],
  tickOf: (lineKey: string) => LineTick | undefined,
): LineTick | null {
  if (toBuy.length === 0 || toBuy.some((view) => !view.checked)) return null;
  const ticks = toBuy.flatMap((view) => tickOf(view.line.key) ?? []);
  const last = ticks.reduce<LineTick | null>(
    (latest, tick) => (latest === null || tick.at > latest.at ? tick : latest),
    null,
  );
  return last ?? { at: 0, by: null };
}
