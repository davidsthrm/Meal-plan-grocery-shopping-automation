import { PLACES, type Place } from "../catalog";
import { addDays, daysBetween, isoWeekday, mondayOf, type IsoDate } from "../dates";
import type { Trip } from "./types";

/**
 * When the household shops and where, and which of those errands buys what a meal needs.
 * The household goes to the supermarket and to the market on fixed weekdays. The butcher is
 * gone to when a meal needs meat, on the household's butcher days, which bundles the meat of
 * several meals into one visit. The bakery has no days: it is gone to for the meal that
 * needs something from there. Every need is put on the note of one errand: a place on a day.
 */

/** Where something is bought fresh instead of at the supermarket. */
export type FreshPlace = "market" | "butcher" | "bakery";

/** A weekday the household shops on, and where it goes that day. ISO weekday: 1 for Monday. */
export interface ShoppingDay {
  weekday: number;
  places: Place[];
}

/** One errand on the calendar: a place on a day. It has a note of its own. */
export interface ShoppingTrip {
  date: IsoDate;
  place: Place;
  /**
   * For an errand done on another day (`withMovedErrands`): its own day, from which it reaches
   * the meals it buys fresh for. The market moved from Saturday to Friday still buys Tuesday's
   * carrots; what keeps is counted from the day it happens.
   */
  reachFrom?: IsoDate;
}

/** Supermarket on Monday and Friday, market on Saturday. */
export const DEFAULT_SHOPPING_DAYS: readonly ShoppingDay[] = [
  { weekday: 1, places: ["supermarket"] },
  { weekday: 5, places: ["supermarket"] },
  { weekday: 6, places: ["market"] },
];

/** The places a household gives weekdays to, in the order their notes lie. */
export const DAY_PLACES = ["supermarket", "market"] as const;
export type DayPlace = (typeof DAY_PLACES)[number];

/**
 * The places with a row of weekdays in the settings. The butcher's days are no errands of
 * their own: they say when the household would rather go there (`butcherDay`), and its
 * note is there only when a meal needs meat.
 */
export const WEEKDAY_PLACES = [...DAY_PLACES, "butcher"] as const;
export type WeekdayPlace = (typeof WEEKDAY_PLACES)[number];

/**
 * The drugstore has one weekday, Saturday unless the household chose another. Its note is
 * there every week, empty until someone writes on it: the meal plan puts nothing on it.
 */
export const DEFAULT_DRUGSTORE_WEEKDAY = 6;

/** A weekday as it is stored for the drugstore, or null for anything that is none. */
export function readWeekday(value: unknown): number | null {
  const day = typeof value === "string" ? Number(value) : value;
  return typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7 ? day : null;
}

/** The shopping days with the drugstore's day among them. */
export function withDrugstore(days: readonly ShoppingDay[], weekday: number): ShoppingDay[] {
  const others = days.map((day): ShoppingDay => ({
    weekday: day.weekday,
    places: day.places.filter((place) => place !== "drugstore"),
  }));
  const that = others.find((day) => day.weekday === weekday);
  if (that) that.places.push("drugstore");
  else others.push({ weekday, places: ["drugstore"] });
  return others.filter((day) => day.places.length > 0).sort((a, b) => a.weekday - b.weekday);
}

/** The weekday the drugstore is gone to on, from shopping days that hold it. */
export function drugstoreWeekday(days: readonly ShoppingDay[]): number {
  return days.find((day) => day.places.includes("drugstore"))?.weekday ?? DEFAULT_DRUGSTORE_WEEKDAY;
}

/**
 * The places gone to only when the plan has a meal that needs something from there. The
 * bakery on the day of that meal; the butcher on the household's butcher days where one
 * reaches the meal (`butcherDay`), otherwise on the day of the meal too.
 */
export const ON_DEMAND_PLACES: readonly Place[] = ["butcher", "bakery"];

/**
 * How far a visit to the butcher reaches: its day and the three days after. Monday buys the
 * meat for Monday to Thursday, Saturday for the weekend and the start of the week. The
 * catalog's shelf life of fresh meat is not asked: the household buys from the butcher for
 * these days on purpose and keeps it cold or freezes it.
 */
export const BUTCHER_REACH_DAYS = 3;

/**
 * How far the market reaches: it buys for its day and the three days after, which from a
 * Saturday is the weekend and the start of the week.
 */
export const FRESH_REACH_DAYS = 3;

/**
 * Bread from the bakery keeps a few days. What keeps longer, or has no shelf life in the
 * catalog, is packed: toast, wraps, crispbread and rusks of "Brot & Backwaren" stay on the
 * supermarket's note when the bakery sells the rest of the kind.
 */
export const BAKERY_FRESH_DAYS = 5;

/**
 * Where something is bought fresh, given its kind's fresh place and its shelf life: packed
 * bread of a kind the bakery sells is bought at the supermarket (`BAKERY_FRESH_DAYS`).
 */
export function freshPlaceFor(
  fresh: FreshPlace | null,
  shelfLifeDays: number | null,
): FreshPlace | null {
  const packed = shelfLifeDays === null || shelfLifeDays > BAKERY_FRESH_DAYS;
  return fresh === "bakery" && packed ? null : fresh;
}

/**
 * The weekdays the household shops in the afternoon, after lunch: Monday to Friday. On a
 * Saturday it shops in the morning, so Saturday's errand still buys Saturday's lunch.
 */
export const AFTERNOON_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Whether a need is eaten before the errands of its own day. */
function beforeTheErrands(need: Need): boolean {
  return need.lunch === true && AFTERNOON_WEEKDAYS.includes(isoWeekday(need.date));
}

/** A note as an address and a key: "2026-10-12.supermarket". */
export function noteId(trip: ShoppingTrip): string {
  return `${trip.date}.${trip.place}`;
}

/** The note an id names, or null for anything else. */
export function readNoteId(id: string): ShoppingTrip | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.(supermarket|market|butcher|bakery|drugstore)$/.exec(id);
  return match ? { date: match[1], place: match[2] as Place } : null;
}

/**
 * The shopping days a household stored, or null for anything that is none: every day at
 * most once, known places, and at least one day at a supermarket, where everything else
 * is bought. The butcher's days are kept; days once stored for the bakery are left out.
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
    const stored = entry.places as unknown[];
    if (!stored.every((place) => [...DAY_PLACES, ...ON_DEMAND_PLACES].includes(place as Place))) {
      return null;
    }
    const places = WEEKDAY_PLACES.filter((place) => stored.includes(place));
    if (places.length > 0) days.push({ weekday, places });
  }
  if (!days.some((day) => day.places.includes("supermarket"))) return null;
  return days.sort((a, b) => a.weekday - b.weekday);
}

/**
 * The shopping days a form sends: for every place the weekdays ticked for it, as numbers.
 * Null when what was ticked is no set of shopping days, see `readShoppingDays`.
 */
export function readDaysForm(
  ticked: (place: WeekdayPlace) => readonly string[],
): ShoppingDay[] | null {
  const marks = WEEKDAY_PLACES.map((place) => [place, ticked(place)] as const);
  return readShoppingDays(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      places: marks.filter(([, days]) => days.includes(String(weekday))).map(([place]) => place),
    })),
  );
}

/**
 * The weekdays the household goes to the butcher on: the ones it ticked, or, while it has
 * ticked none, the days it goes to the supermarket or the market anyway.
 */
export function butcherWeekdays(days: readonly ShoppingDay[]): number[] {
  const chosen = days.filter((day) => day.places.includes("butcher"));
  const used =
    chosen.length > 0
      ? chosen
      : days.filter((day) =>
          day.places.some((place) => place === "supermarket" || place === "market"),
        );
  return used.map((day) => day.weekday);
}

/**
 * The butcher day that buys the meat for a meal: the last one on or before it, at most
 * `BUTCHER_REACH_DAYS` before, and not before the meal was planned. Null where none does.
 */
export function butcherDay(
  need: Pick<Need, "date" | "plannedOn">,
  weekdays: readonly number[],
  /** Not on the day of the meal itself: its errands come after it. */
  dayBefore = false,
): IsoDate | null {
  for (let back = dayBefore ? 1 : 0; back <= BUTCHER_REACH_DAYS; back += 1) {
    const day = addDays(need.date, -back);
    if (need.plannedOn && day < need.plannedOn) return null;
    if (weekdays.includes(isoWeekday(day))) return day;
  }
  return null;
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
    for (const place of [...DAY_PLACES, "drugstore"] as const) {
      if (day?.places.includes(place)) trips.push({ date, place });
    }
  }
  return trips;
}

/**
 * The errands as they happen: one done on another day ("An einem anderen Tag einkaufen")
 * stands on that day instead of its own, `movedTo` by the note of its own day, followed on
 * where that day's errand moved too. Moving only the lines of Monday's note to Tuesday left
 * the errand on Monday for everything else: milk for Sunday would not keep from Monday and
 * got an errand of its own on Friday (October 2026). Two errands that meet on one day are one.
 */
export function withMovedErrands(
  trips: readonly ShoppingTrip[],
  movedTo: ReadonlyMap<string, IsoDate>,
): ShoppingTrip[] {
  const moved = new Map<string, ShoppingTrip>();
  for (const trip of trips) {
    let date = trip.date;
    const passed = new Set<IsoDate>();
    for (let to = movedTo.get(noteId(trip)); to && !passed.has(to);) {
      passed.add(date);
      date = to;
      to = movedTo.get(noteId({ date, place: trip.place }));
    }
    const reachFrom = trip.reachFrom ?? trip.date;
    const errand = date === trip.date ? trip : { date, place: trip.place, reachFrom };
    // Two errands that meet on one day reach as far as the one that reaches further.
    const other = moved.get(noteId(errand));
    if (!other || (other.reachFrom ?? other.date) < (errand.reachFrom ?? errand.date)) {
      moved.set(noteId(errand), errand);
    }
  }
  return [...moved.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || PLACES.indexOf(a.place) - PLACES.indexOf(b.place),
  );
}

/** Something a meal needs, as far as it matters for when and where it is bought. */
export interface Need {
  /** The day it is cooked or eaten. */
  date: IsoDate;
  /** The day it was put on the plan. An errand before that cannot have bought it. */
  plannedOn?: IsoDate | null;
  /**
   * The moment it was put on the plan, in milliseconds: an errand that was done before it,
   * on that day too, has not bought it (`ErrandRules.doneAt`).
   */
  plannedAt?: number | null;
  /** Eaten at midday: an errand in the afternoon of that day comes too late for it. */
  lunch?: boolean;
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
 * The errand that buys a need: the first supermarket errand of the meal's week that is in
 * time and from which it keeps until the meal, so that the week has as few big errands as
 * it can (October 2026). Where none of the week does, the last shopping day before it.
 * Something fresh comes from the market when its day reaches the meal and it keeps until
 * then, also when a supermarket day lies in between. What would not keep from the shopping
 * day, and what was planned after it, is bought shortly before the meal and says so.
 *
 * What comes from the butcher, by its kind of grocery or because the butcher was named for
 * it, is bought on the household's last butcher day that reaches the meal (`butcherDay`):
 * with Monday a butcher day, the meat for Monday to Thursday is one visit on Monday. Where
 * no butcher day reaches it, and for the bakery, it is an errand on the day of its meal
 * (`onDemandDay`). A market named on purpose is gone to on its day when that reaches the
 * meal, and otherwise on the day of the meal.
 *
 * `trips` are in order. Null only when the household has no shopping day at all.
 *
 * A lunch on a working day is bought on an errand before that day where one is in time
 * (`AFTERNOON_WEEKDAYS`): the household shops in the afternoon, so Friday's errand comes
 * after Friday's lunch, and Monday buys for it. What would not keep that long is bought
 * shortly before, as from any errand. Only where no earlier errand was possible, because
 * the meal was planned after it or no butcher day reaches it, does the meal's own day stay.
 */
export function assignTrip(
  need: Need,
  trips: readonly ShoppingTrip[],
  rules: ErrandRules = {},
): Assignment | null {
  const known: Required<ErrandRules> = {
    onDemand: rules.onDemand ?? ON_DEMAND_PLACES,
    butcherDays: rules.butcherDays ?? [],
    doneAt: rules.doneAt ?? new Map(),
    firstErrandFrom: rules.firstErrandFrom ?? null,
  };
  if (beforeTheErrands(need)) {
    const earlier = trips.filter((trip) => trip.date < need.date);
    const bought = assignOn(need, earlier, known, true);
    if (bought) return bought;
  }
  return assignOn(need, trips, known, false);
}

/**
 * The week from which the first errand buys what keeps (`ErrandRules.firstErrandFrom`): the
 * week of 19 October 2026 was shopped by the rule before, its Monday is done, and what it
 * left for Friday is bought on Friday.
 */
export const FIRST_ERRAND_FROM: IsoDate = "2026-10-26";

/** How a household goes on the errands beyond its shopping days. */
export interface ErrandRules {
  /**
   * The places gone to for the meal that needs something from there. Without them: the
   * butcher and the bakery. Empty for a household that buys everything in one go.
   */
  onDemand?: readonly Place[];
  /** The weekdays the butcher is gone to on (`butcherWeekdays`). Without any: for each meal. */
  butcherDays?: readonly number[];
  /**
   * The errands that are done, by note (`noteId`), with the moment of their last tick in
   * milliseconds. What was planned after that is not bought on them.
   */
  doneAt?: ReadonlyMap<string, number>;
  /**
   * The first week whose first errand to the supermarket buys what keeps for the whole week
   * (`FIRST_ERRAND_FROM`). The weeks before it were shopped on the last errand before each
   * meal, and stay so: their errands are done. Null or left out: every week.
   */
  firstErrandFrom?: IsoDate | null;
}

/**
 * `assignTrip` among the given errands. `strict` answers null instead of falling back to the
 * day of the meal or to an errand that was over before the meal was planned.
 */
function assignOn(
  need: Need,
  trips: readonly ShoppingTrip[],
  { onDemand, butcherDays, doneAt, firstErrandFrom }: Required<ErrandRules>,
  strict: boolean,
): Assignment | null {
  const keeps = (trip: ShoppingTrip) =>
    need.shelfLifeDays === null || daysBetween(trip.date, need.date) <= need.shelfLifeDays;
  const before = (place: Place) =>
    trips.filter((trip) => trip.place === place && trip.date <= need.date);
  // Done before the need was planned: that errand did not buy it.
  const doneBefore = (trip: ShoppingTrip) => {
    const done = doneAt.get(noteId(trip));
    return done !== undefined && need.plannedAt != null && need.plannedAt > done;
  };
  const inTime = (candidates: ShoppingTrip[]) =>
    candidates.filter(
      (trip) => (!need.plannedOn || trip.date >= need.plannedOn) && !doneBefore(trip),
    );

  const named = need.at && need.at !== "supermarket" ? need.at : null;
  const elsewhere = named ?? freshPlaceFor(need.fresh, need.shelfLifeDays);
  if (elsewhere && onDemand.includes(elsewhere)) {
    const day = elsewhere === "butcher" ? butcherDay(need, butcherDays, strict) : null;
    const bundled = day && !doneBefore({ date: day, place: "butcher" }) ? day : null;
    if (strict && !bundled) return null;
    return { date: bundled ?? onDemandDay(need), place: elsewhere, trip: "main" };
  }
  if (elsewhere) {
    const errand = last(
      inTime(before(elsewhere)).filter(
        (trip) =>
          daysBetween(trip.reachFrom ?? trip.date, need.date) <= FRESH_REACH_DAYS && keeps(trip),
      ),
    );
    if (errand) return { date: errand.date, place: errand.place, trip: "main" };
  }
  if (named) return strict ? null : { date: need.date, place: named, trip: "main" };
  const shops = inTime(before("supermarket"));
  // The week's first errand to the supermarket buys whatever keeps until its meal, so that a
  // later one is needed only for what would not: Monday buys the leeks and the fish stock for
  // Friday's dinner, and Friday only the salad.
  const week = mondayOf(need.date);
  const bundled = firstErrandFrom === null || week >= firstErrandFrom;
  const big = bundled ? shops.find((trip) => trip.date >= week && keeps(trip)) : undefined;
  if (big) return { date: big.date, place: big.place, trip: "main" };
  const shop = last(shops);
  if (shop) return { date: shop.date, place: shop.place, trip: keeps(shop) ? "main" : "later" };
  if (strict) return null;
  // Planned after the last shopping day before the meal: it has to be fetched in between.
  const missed =
    last(before("supermarket")) ?? trips.find((trip) => trip.place === "supermarket") ?? trips[0];
  return missed ? { date: missed.date, place: missed.place, trip: "later" } : null;
}

/**
 * The day the bakery, or the butcher without a butcher day in reach, is gone to for a meal:
 * the day of the meal. Shops are closed on a Sunday, so that is bought on the Saturday,
 * unless the meal was planned later.
 */
export function onDemandDay(need: Pick<Need, "date" | "plannedOn">): IsoDate {
  if (isoWeekday(need.date) !== 7) return need.date;
  const saturday = addDays(need.date, -1);
  return need.plannedOn && need.plannedOn > saturday ? need.date : saturday;
}
