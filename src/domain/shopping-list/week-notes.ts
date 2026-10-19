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

/** The notes lines are on, each once. */
export function notesOf(lines: readonly ShoppingLine[]): ShoppingTrip[] {
  const notes = new Map<string, ShoppingTrip>();
  for (const line of lines) {
    const trip = { date: line.shoppingDate, place: line.place };
    notes.set(noteId(trip), trip);
  }
  return [...notes.values()];
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

/** How long after its last tick an errand counts as finished just now: its stamp lands. */
export const JUST_FINISHED_MS = 2 * 60 * 1000;

/**
 * True when an errand was finished moments ago, by the time of its last tick: its stamp is
 * pressed on as the notes are shown, once, not on every later visit. A tick from the future
 * (another device's clock) counts as now; an errand ticked off before ticks had times
 * (`at` 0) never.
 */
export function justFinished(at: number, now: number): boolean {
  return at > 0 && now - at < JUST_FINISHED_MS;
}

/**
 * Whether an errand is done: nothing on its note is open any more. Every line is bought, in
 * full or in part, or removed; what was moved to another note is not on this one. The
 * decision made last says who finished it and when. What was planned after that moment
 * cannot have been bought on it and leaves it done (`ErrandRules.doneAt`): a meal planned
 * on a shopping day after the shopping. Null while anything else is open, and for a note
 * with nothing to buy. A line opened again opens the errand again: nothing is stored.
 */
export function completion(
  toBuy: readonly ViewLine[],
  tickOf: (lineKey: string) => LineTick | undefined,
  /**
   * The decisions that closed a line without buying it: removed ("nicht kaufen"). They
   * count like a tick, and the last of them may be what finished the errand.
   */
  notBought: readonly LineTick[] = [],
): LineTick | null {
  const ticks = [
    ...toBuy.flatMap((view) => (view.checked ? (tickOf(view.line.key) ?? []) : [])),
    ...notBought,
  ];
  const last = ticks.reduce<LineTick | null>(
    (latest, tick) => (latest === null || tick.at > latest.at ? tick : latest),
    null,
  );
  const open = toBuy.filter((view) => !view.checked);
  const decided = toBuy.length - open.length + notBought.length;
  if (decided === 0) return null;
  if (last === null) return open.length === 0 ? { at: 0, by: null } : null;
  const plannedAfter = open.every((view) =>
    view.line.contributions.every((part) => part.plannedAt != null && part.plannedAt > last.at),
  );
  return plannedAfter ? last : null;
}
