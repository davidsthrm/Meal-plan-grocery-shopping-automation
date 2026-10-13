import type { Place } from "../catalog";
import { addDays, daysBetween, isoWeekday, type IsoDate } from "../dates";
import type { Trip } from "./types";

/**
 * When the household shops and where, and which of those errands buys what a meal needs.
 * The household goes to the supermarket on fixed weekdays and to the market and the butcher
 * on another. Every need is put on the note of one errand: a place on a day.
 */

/** Where something is bought fresh instead of at the supermarket. */
export type FreshPlace = "market" | "butcher";

/** A weekday the household shops on, and where it goes that day. ISO weekday: 1 for Monday. */
export interface ShoppingDay {
  weekday: number;
  places: Place[];
}

/** One errand on the calendar: a place on a day. It has a note of its own. */
export interface ShoppingTrip {
  date: IsoDate;
  place: Place;
}

/** Supermarket on Monday and Friday, market and butcher on Saturday. */
export const DEFAULT_SHOPPING_DAYS: readonly ShoppingDay[] = [
  { weekday: 1, places: ["supermarket"] },
  { weekday: 5, places: ["supermarket"] },
  { weekday: 6, places: ["market", "butcher"] },
];

/**
 * The places a household can give days to, in the order their notes lie. None of them needs
 * one but the supermarket: a butcher or a bakery without a day is gone to when a meal asks
 * for something from there.
 */
export const DAY_PLACES = ["supermarket", "market", "butcher", "bakery"] as const;
export type DayPlace = (typeof DAY_PLACES)[number];

/**
 * How far the market, the butcher and the bakery reach: they buy for their day and the
 * three days after, which from a Saturday is the weekend and the start of the week.
 */
export const FRESH_REACH_DAYS = 3;

/** A note as an address and a key: "2026-10-12.supermarket". */
export function noteId(trip: ShoppingTrip): string {
  return `${trip.date}.${trip.place}`;
}

/** The note an id names, or null for anything else. */
export function readNoteId(id: string): ShoppingTrip | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(supermarket|market|butcher|bakery)$/.exec(id);
  return match ? { date: match[1], place: match[2] as Place } : null;
}

/**
 * The shopping days a household stored, or null for anything that is none: every day at
 * most once, known places, and at least one day at a supermarket, where everything else
 * is bought.
 */
export function readShoppingDays(value: unknown): ShoppingDay[] | null {
  if (!Array.isArray(value)) return null;
  const days: ShoppingDay[] = [];
  for (const entry of value as { weekday?: unknown; places?: unknown }[]) {
    const weekday = entry?.weekday;
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return null;
    }
    if (!Array.isArray(entry.places) || days.some((day) => day.weekday === weekday)) return null;
    const places = DAY_PLACES.filter((place) => (entry.places as unknown[]).includes(place));
    if (places.length !== entry.places.length) return null;
    if (places.length > 0) days.push({ weekday, places });
  }
  if (!days.some((day) => day.places.includes("supermarket"))) return null;
  return days.sort((a, b) => a.weekday - b.weekday);
}

/**
 * The shopping days a form sends: for every place the weekdays ticked for it, as numbers.
 * Null when what was ticked is no set of shopping days, see `readShoppingDays`.
 */
export function readDaysForm(ticked: (place: DayPlace) => readonly string[]): ShoppingDay[] | null {
  const marks = DAY_PLACES.map((place) => [place, ticked(place)] as const);
  return readShoppingDays(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      places: marks.filter(([, days]) => days.includes(String(weekday))).map(([place]) => place),
    })),
  );
}

/** A household that shops on one day only, as the handwritten list did. */
export function singleTrip(date: IsoDate): ShoppingTrip[] {
  return [{ date, place: "supermarket" }];
}

/** The errands between two dates, both included, in order of the day. */
export function tripsBetween(
  days: readonly ShoppingDay[],
  from: IsoDate,
  to: IsoDate,
): ShoppingTrip[] {
  const trips: ShoppingTrip[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = days.find((entry) => entry.weekday === isoWeekday(date));
    for (const place of DAY_PLACES) {
      if (day?.places.includes(place)) trips.push({ date, place });
    }
  }
  return trips;
}

/** Something a meal needs, as far as it matters for when and where it is bought. */
export interface Need {
  /** The day it is cooked or eaten. */
  date: IsoDate;
  /** The day it was put on the plan. An errand before that cannot have bought it. */
  plannedOn?: IsoDate | null;
  /** Where its kind of grocery is bought fresh. Null: at the supermarket. */
  fresh: FreshPlace | null;
  /** A place named on purpose for this need: the bread of a cold supper from the bakery. */
  at?: Place | null;
  /** Days it stays good after buying. Null means it keeps. */
  shelfLifeDays: number | null;
}

export interface Assignment extends ShoppingTrip {
  /**
   * "main": bought on that errand for the days after it. "later": bought shortly before it
   * is needed, and listed with that day.
   */
  trip: Trip;
}

const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

/**
 * The errand that buys a need: the supermarket's last shopping day before it is needed.
 * Something fresh comes from the market or the butcher when their day reaches the meal and
 * it keeps until then, also when a supermarket day lies in between. What would not keep
 * from the shopping day, and what was planned after it, is bought shortly before the meal
 * and says so.
 *
 * A shop named on purpose is gone to in any case: on its day when that reaches the meal, and
 * otherwise on the day of the meal itself, which then has an errand of its own. Bread and
 * cold cuts for a supper on Monday are a note for the bakery and one for the butcher on
 * Monday, next to the supermarket's.
 *
 * `trips` are in order. Null only when the household has no shopping day at all.
 */
export function assignTrip(need: Need, trips: readonly ShoppingTrip[]): Assignment | null {
  const keeps = (trip: ShoppingTrip) =>
    need.shelfLifeDays === null || daysBetween(trip.date, need.date) <= need.shelfLifeDays;
  const before = (place: Place) =>
    trips.filter((trip) => trip.place === place && trip.date <= need.date);
  const inTime = (candidates: ShoppingTrip[]) =>
    candidates.filter((trip) => !need.plannedOn || trip.date >= need.plannedOn);

  const named = need.at && need.at !== "supermarket" ? need.at : null;
  const elsewhere = named ?? need.fresh;
  if (elsewhere) {
    const errand = last(
      inTime(before(elsewhere)).filter(
        (trip) => daysBetween(trip.date, need.date) <= FRESH_REACH_DAYS && keeps(trip),
      ),
    );
    if (errand) return { ...errand, trip: "main" };
  }
  if (named) return { date: need.date, place: named, trip: "main" };
  const shop = last(inTime(before("supermarket")));
  if (shop) return { ...shop, trip: keeps(shop) ? "main" : "later" };
  // Planned after the last shopping day before the meal: it has to be fetched in between.
  const missed =
    last(before("supermarket")) ?? trips.find((trip) => trip.place === "supermarket") ?? trips[0];
  return missed ? { ...missed, trip: "later" } : null;
}

/**
 * The next errand from `today` on that sells something: where a thing that ran out at home
 * is bought. Something fresh is bought at its place when that comes before the supermarket.
 */
export function nextTrip(
  days: readonly ShoppingDay[],
  today: IsoDate,
  fresh: FreshPlace | null,
): ShoppingTrip | null {
  const coming = tripsBetween(days, today, addDays(today, 13));
  return (
    coming.find((trip) => trip.place === "supermarket" || trip.place === fresh) ?? coming[0] ?? null
  );
}
