import { PLACES } from "../catalog";
import { addDays, weekDates, type IsoDate } from "../dates";
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

/**
 * The notes of a week in the order they lie on the page: what is still to do first, from
 * today on in order of day and place, then an errand whose day is over and that still has
 * something open; the errands that are done at the foot (`done`). A note whose day is over
 * and that has nothing on it is left out: Monday's empty dm note says nothing on a Tuesday.
 */
export function arrangeNotes<T extends { trip: ShoppingTrip; completed: object | null }>(
  notes: readonly T[],
  today: IsoDate,
  isEmpty: (note: T) => boolean,
): { toDo: T[]; done: T[] } {
  const shown = notes.filter((note) => note.trip.date >= today || !isEmpty(note));
  const toDo = shown.filter((note) => note.completed === null);
  return {
    toDo: [
      ...toDo.filter((note) => note.trip.date >= today),
      ...toDo.filter((note) => note.trip.date < today),
    ],
    done: shown.filter((note) => note.completed !== null),
  };
}

/**
 * The days of a week a note can be opened on by hand ("Neuer Zettel"): from today on. A week
 * gone by has none.
 */
export function daysToOpen(weekStart: IsoDate, today: IsoDate): IsoDate[] {
  return weekDates(weekStart).filter((day) => day >= today);
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
 * Whether an errand is done: nothing on its note is open any more, and something on it was
 * bought. Every line is bought, in full or in part, or removed; what was moved to another
 * note is not on this one. The last purchase says who finished it and when. A line removed
 * is a decision about the plan, not a moment someone shopped: taken as the errand's moment,
 * two lines removed while the week was planned made Monday's errand done (October 2026).
 * What was planned after that moment cannot have been bought on it and leaves it done
 * (`ErrandRules.doneAt`): a meal planned on a shopping day after the shopping. Null while
 * anything else is open and while nothing is bought. A line opened again opens the errand
 * again: nothing is stored.
 */
export function completion(
  toBuy: readonly ViewLine[],
  tickOf: (lineKey: string) => LineTick | undefined,
): LineTick | null {
  const bought = toBuy.filter((view) => view.checked);
  if (bought.length === 0) return null;
  const last = bought.reduce<LineTick | null>((latest, view) => {
    const tick = tickOf(view.line.key);
    return tick && (latest === null || tick.at > latest.at) ? tick : latest;
  }, null);
  const open = toBuy.filter((view) => !view.checked);
  if (last === null) return open.length === 0 ? { at: 0, by: null } : null;
  const plannedAfter = open.every((view) =>
    view.line.contributions.every((part) => part.plannedAt != null && part.plannedAt > last.at),
  );
  return plannedAfter ? last : null;
}
