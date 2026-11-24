import { addDays, type IsoDate } from "@/domain/dates";
import { noteId, type ShoppingTrip } from "@/domain/shopping-list/trips";

/**
 * The pages a device keeps for the shop, where there may be no connection: the shopping
 * notes of the week, each note of it, the next errand when it lies in the week after, and,
 * while the page shows the week ahead from Saturday on, the running week's notes from today
 * on. The service worker keeps them (`public/sw.js`).
 */

/** The address of the notes of a week, or of one of them. Links in the app use the same. */
export function notesAddress(week: IsoDate, note?: ShoppingTrip): string {
  return note ? `/einkauf?w=${week}&zettel=${noteId(note)}` : `/einkauf?w=${week}`;
}

/** Whether the week still has an errand from today on. Otherwise the next one is later. */
export function hasErrandFrom(trips: readonly ShoppingTrip[], today: IsoDate): boolean {
  return trips.some((trip) => trip.date >= today);
}

export function pagesForTheShop(
  week: IsoDate,
  trips: readonly ShoppingTrip[],
  today: IsoDate,
  /** The errands of the week after, where this one has none left. */
  nextTrips: readonly ShoppingTrip[] = [],
  /** The errands of the week before, the running one, where the page shows the week ahead. */
  runningTrips: readonly ShoppingTrip[] = [],
): string[] {
  const next = nextTrips
    .filter((trip) => trip.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextWeek = addDays(week, 7);
  const running = addDays(week, -7);
  const left = runningTrips.filter((trip) => trip.date >= today);
  return [
    // The section in the navigation leads here, without a week.
    "/einkauf",
    notesAddress(week),
    ...trips.map((trip) => notesAddress(week, trip)),
    ...(next ? [notesAddress(nextWeek), notesAddress(nextWeek, next)] : []),
    ...(left.length > 0
      ? [notesAddress(running), ...left.map((trip) => notesAddress(running, trip))]
      : []),
  ];
}
