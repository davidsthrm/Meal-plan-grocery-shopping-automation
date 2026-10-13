import { addDays, daysBetween, isoWeekday, type IsoDate } from "../dates";
import type { Trip } from "./types";

/**
 * When the household shops, and which of those days buys what a meal needs. The household
 * goes to the supermarket on fixed weekdays and to the market and the butcher on another.
 * Every need is put on the list of one such day, so that each day has a list of its own.
 */

/**
 * "all" is a supermarket, where everything can be bought. "market" is the market and the
 * butcher: only what is sold fresh there.
 */
export type ShoppingKind = "all" | "market";

/** A weekday the household shops on. ISO weekday: 1 for Monday. */
export interface ShoppingDay {
  weekday: number;
  kind: ShoppingKind;
}

/** One shopping day on the calendar. */
export interface ShoppingTrip {
  date: IsoDate;
  kind: ShoppingKind;
}

/** Supermarket on Monday and Friday, market and butcher on Saturday. */
export const DEFAULT_SHOPPING_DAYS: readonly ShoppingDay[] = [
  { weekday: 1, kind: "all" },
  { weekday: 5, kind: "all" },
  { weekday: 6, kind: "market" },
];

/**
 * How far a market day reaches: it buys for itself and the three days after, which from a
 * Saturday is the weekend and the start of the week.
 */
export const MARKET_REACH_DAYS = 3;

/** A household that shops on one day only, as the handwritten list did. */
export function singleTrip(date: IsoDate): ShoppingTrip[] {
  return [{ date, kind: "all" }];
}

/** The shopping days between two dates, both included, in order. */
export function tripsBetween(
  days: readonly ShoppingDay[],
  from: IsoDate,
  to: IsoDate,
): ShoppingTrip[] {
  const trips: ShoppingTrip[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const onDay = days.filter((day) => day.weekday === isoWeekday(date));
    // A day with both is a day everything can be bought on.
    if (onDay.length > 0) {
      trips.push({ date, kind: onDay.some((day) => day.kind === "all") ? "all" : "market" });
    }
  }
  return trips;
}

/** Something a meal needs, as far as it matters for when it is bought. */
export interface Need {
  /** The day it is cooked or eaten. */
  date: IsoDate;
  /** The day it was put on the plan. A shopping day before that cannot have bought it. */
  plannedOn?: IsoDate | null;
  /** Sold fresh at the market or the butcher. */
  market: boolean;
  /** Days it stays good after buying. Null means it keeps. */
  shelfLifeDays: number | null;
}

export interface Assignment {
  /** The shopping day whose list it is on. */
  date: IsoDate;
  /** "main": bought on that day. "later": bought shortly before it is needed. */
  trip: Trip;
}

const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

/**
 * The shopping day that buys a need: the last one before it is needed. Something fresh
 * comes from the market when a market day reaches the meal and it keeps until then, also
 * when a supermarket day lies in between. What would not keep from the shopping day, and
 * what was planned after it, is bought shortly before the meal and listed as such.
 *
 * `trips` are in order. Null only when there is no shopping day at all.
 */
export function assignTrip(need: Need, trips: readonly ShoppingTrip[]): Assignment | null {
  const sells = (trip: ShoppingTrip) => trip.kind === "all" || need.market;
  const keeps = (trip: ShoppingTrip) =>
    need.shelfLifeDays === null || daysBetween(trip.date, need.date) <= need.shelfLifeDays;
  const before = trips.filter((trip) => trip.date <= need.date && sells(trip));
  const inTime = before.filter((trip) => !need.plannedOn || trip.date >= need.plannedOn);

  if (need.market) {
    const market = last(
      inTime.filter(
        (trip) =>
          trip.kind === "market" &&
          daysBetween(trip.date, need.date) <= MARKET_REACH_DAYS &&
          keeps(trip),
      ),
    );
    if (market) return { date: market.date, trip: "main" };
  }
  const shop = last(inTime);
  if (shop) return { date: shop.date, trip: keeps(shop) ? "main" : "later" };
  // Planned after the last shopping day before the meal: it has to be fetched in between.
  const missed = last(before) ?? trips.find(sells) ?? trips[0];
  return missed ? { date: missed.date, trip: "later" } : null;
}

/**
 * The next shopping day from `today` on that sells something: the day a thing that ran out
 * at home is bought. Something not sold at the market waits for the supermarket.
 */
export function nextTrip(
  days: readonly ShoppingDay[],
  today: IsoDate,
  market: boolean,
): ShoppingTrip | null {
  const coming = tripsBetween(days, today, addDays(today, 13));
  return coming.find((trip) => trip.kind === "all" || market) ?? coming[0] ?? null;
}
