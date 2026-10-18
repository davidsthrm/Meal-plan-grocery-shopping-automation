import { describe, expect, it } from "vitest";
import {
  assignTrip,
  BUTCHER_REACH_DAYS,
  butcherDay,
  butcherWeekdays,
  DEFAULT_DRUGSTORE_WEEKDAY,
  DEFAULT_SHOPPING_DAYS,
  drugstoreWeekday,
  nextTrip,
  noteId,
  onDemandDay,
  readDaysForm,
  readNoteId,
  readShoppingDays,
  singleTrip,
  tripsBetween,
  readWeekday,
  withDrugstore,
  type Need,
} from "./trips";

// Saturday 10 October to Sunday 25 October 2026: the week of the 12th with what lies around it.
const SAT_BEFORE = "2026-10-10";
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const WEDNESDAY = "2026-10-14";
const THURSDAY = "2026-10-15";
const FRIDAY = "2026-10-16";
const SATURDAY = "2026-10-17";
const SUNDAY = "2026-10-18";
const NEXT_MONDAY = "2026-10-19";

const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-10-05", "2026-10-25");
const need = (date: string, patch: Partial<Need> = {}): Need => ({
  date,
  fresh: null,
  shelfLifeDays: null,
  ...patch,
});
const shop = (date: string, trip = "main") => ({ date, place: "supermarket", trip });
const market = (date: string) => ({ date, place: "market", trip: "main" });
const butcher = (date: string) => ({ date, place: "butcher", trip: "main" });

describe("tripsBetween", () => {
  it("lists the errands of a span in order, one per place and day", () => {
    expect(tripsBetween(DEFAULT_SHOPPING_DAYS, SAT_BEFORE, SATURDAY)).toEqual([
      { date: SAT_BEFORE, place: "market" },
      { date: MONDAY, place: "supermarket" },
      { date: FRIDAY, place: "supermarket" },
      { date: SATURDAY, place: "market" },
    ]);
  });
});

describe("readShoppingDays", () => {
  it("reads what a household stored", () => {
    expect(
      readShoppingDays([
        { weekday: 6, places: ["market"] },
        { weekday: 2, places: ["supermarket"] },
        { weekday: 4, places: [] },
      ]),
    ).toEqual([
      { weekday: 2, places: ["supermarket"] },
      { weekday: 6, places: ["market"] },
    ]);
  });

  it("keeps the butcher's days and leaves out days once stored for the bakery", () => {
    expect(
      readShoppingDays([
        { weekday: 1, places: ["supermarket"] },
        { weekday: 3, places: ["bakery"] },
        { weekday: 6, places: ["butcher", "market"] },
      ]),
    ).toEqual([
      { weekday: 1, places: ["supermarket"] },
      { weekday: 6, places: ["market", "butcher"] },
    ]);
  });

  it("refuses what is no set of shopping days", () => {
    expect(readShoppingDays(null)).toBeNull();
    expect(readShoppingDays([{ weekday: 8, places: ["supermarket"] }])).toBeNull();
    expect(readShoppingDays([{ weekday: 1, places: ["kiosk"] }])).toBeNull();
    expect(
      readShoppingDays([
        { weekday: 1, places: ["supermarket"] },
        { weekday: 1, places: ["market"] },
      ]),
    ).toBeNull();
  });

  it("needs a day at the supermarket, where everything else is bought", () => {
    expect(readShoppingDays([{ weekday: 6, places: ["market"] }])).toBeNull();
    expect(readShoppingDays([])).toBeNull();
  });
});

describe("readDaysForm", () => {
  it("reads the boxes ticked per place", () => {
    const ticked = { supermarket: ["1", "5"], market: ["3", "6"], butcher: [] };
    expect(readDaysForm((place) => ticked[place])).toEqual([
      { weekday: 1, places: ["supermarket"] },
      { weekday: 3, places: ["market"] },
      { weekday: 5, places: ["supermarket"] },
      { weekday: 6, places: ["market"] },
    ]);
  });

  it("reads the butcher's days with the others", () => {
    const ticked = { supermarket: ["1", "5"], market: ["6"], butcher: ["1", "6"] };
    expect(readDaysForm((place) => ticked[place])).toEqual([
      { weekday: 1, places: ["supermarket", "butcher"] },
      { weekday: 5, places: ["supermarket"] },
      { weekday: 6, places: ["market", "butcher"] },
    ]);
  });

  it("refuses a household that never goes to the supermarket", () => {
    const ticked = { supermarket: [], market: ["6"], butcher: ["6"] };
    expect(readDaysForm((place) => ticked[place])).toBeNull();
  });
});

describe("the butcher's days", () => {
  const meat = { fresh: "butcher" as const, shelfLifeDays: 2 };
  // Monday and Saturday, as a household that goes there on a Saturday morning.
  const MON_SAT = [1, 6];

  it("bundles the meat of Monday to Thursday into one visit on Monday", () => {
    for (const day of [MONDAY, TUESDAY, WEDNESDAY, THURSDAY]) {
      expect(assignTrip(need(day, meat), trips, undefined, MON_SAT)).toEqual(butcher(MONDAY));
    }
    // Further than the visit reaches: on the day of the meal, as without butcher days.
    expect(BUTCHER_REACH_DAYS).toBe(3);
    expect(assignTrip(need(FRIDAY, meat), trips, undefined, MON_SAT)).toEqual(butcher(FRIDAY));
  });

  it("buys on the Saturday morning for the weekend", () => {
    expect(assignTrip(need(SATURDAY, meat), trips, undefined, MON_SAT)).toEqual(butcher(SATURDAY));
    expect(assignTrip(need(SUNDAY, meat), trips, undefined, MON_SAT)).toEqual(butcher(SATURDAY));
    // The next Monday is a butcher day of its own.
    expect(assignTrip(need(NEXT_MONDAY, meat), trips, undefined, MON_SAT)).toEqual(
      butcher(NEXT_MONDAY),
    );
  });

  it("reaches into the next week from a Saturday alone", () => {
    const saturday = [6];
    expect(butcherDay({ date: NEXT_MONDAY }, saturday)).toBe(SATURDAY);
    expect(butcherDay({ date: "2026-10-20" }, saturday)).toBe(SATURDAY);
    expect(butcherDay({ date: "2026-10-21" }, saturday)).toBeNull();
  });

  it("does not buy on a visit what was planned after it", () => {
    // Thursday's meal was planned on Tuesday: Monday's visit is over.
    const late = { ...meat, plannedOn: TUESDAY };
    expect(assignTrip(need(THURSDAY, late), trips, undefined, MON_SAT)).toEqual(butcher(THURSDAY));
    // Planned on the Monday itself, it is still bought then.
    const early = { ...meat, plannedOn: MONDAY };
    expect(assignTrip(need(THURSDAY, early), trips, undefined, MON_SAT)).toEqual(butcher(MONDAY));
  });

  it("bundles cold cuts asked from the butcher like meat for cooking", () => {
    expect(assignTrip(need(WEDNESDAY, { at: "butcher" }), trips, undefined, MON_SAT)).toEqual(
      butcher(MONDAY),
    );
  });

  it("leaves the bakery on the day of the meal", () => {
    expect(assignTrip(need(WEDNESDAY, { at: "bakery" }), trips, undefined, MON_SAT)).toEqual({
      date: WEDNESDAY,
      place: "bakery",
      trip: "main",
    });
  });

  it("are the ticked ones, or the days of supermarket and market while none is ticked", () => {
    expect(butcherWeekdays(DEFAULT_SHOPPING_DAYS)).toEqual([1, 5, 6]);
    expect(
      butcherWeekdays([
        { weekday: 1, places: ["supermarket"] },
        { weekday: 5, places: ["supermarket"] },
        { weekday: 6, places: ["market", "butcher"] },
      ]),
    ).toEqual([6]);
    // The drugstore's day is no reason to go to the butcher.
    expect(butcherWeekdays(withDrugstore([{ weekday: 1, places: ["supermarket"] }], 3))).toEqual([
      1,
    ]);
  });
});

describe("noteId", () => {
  it("names a note in an address and reads it back", () => {
    expect(noteId({ date: MONDAY, place: "supermarket" })).toBe("2026-10-12.supermarket");
    expect(readNoteId("2026-10-17.butcher")).toEqual({ date: SATURDAY, place: "butcher" });
    expect(readNoteId("2026-10-17")).toBeNull();
    expect(readNoteId("2026-10-17.kiosk")).toBeNull();
  });
});

describe("assignTrip", () => {
  it("buys at the supermarket on the last shopping day before the meal", () => {
    expect(assignTrip(need(MONDAY), trips)).toEqual(shop(MONDAY));
    expect(assignTrip(need(THURSDAY), trips)).toEqual(shop(MONDAY));
    expect(assignTrip(need(FRIDAY), trips)).toEqual(shop(FRIDAY));
    expect(assignTrip(need(SUNDAY), trips)).toEqual(shop(FRIDAY));
  });

  it("buys a lunch on a working day on the errand before: the household shops after lunch", () => {
    const lunch = { lunch: true };
    expect(assignTrip(need(FRIDAY, lunch), trips)).toEqual(shop(MONDAY));
    expect(assignTrip(need(MONDAY, lunch), trips)).toEqual(shop("2026-10-09"));
    // The dinner of that day comes after the errand.
    expect(assignTrip(need(FRIDAY), trips)).toEqual(shop(FRIDAY));
    // Unchanged on a day without an errand.
    expect(assignTrip(need(THURSDAY, lunch), trips)).toEqual(shop(MONDAY));
  });

  it("buys Saturday's lunch on Saturday: the household shops in the morning then", () => {
    const fresh = { lunch: true, fresh: "market" as const, shelfLifeDays: 5 };
    expect(assignTrip(need(SATURDAY, fresh), trips)).toEqual(market(SATURDAY));
  });

  it("buys a lunch that would not keep from the errand before shortly before it", () => {
    const tomatoes = { lunch: true, shelfLifeDays: 2 };
    expect(assignTrip(need(FRIDAY, tomatoes), trips)).toEqual(shop(MONDAY, "later"));
  });

  it("keeps a lunch on its own day where no errand before it could buy it", () => {
    // Planned on Tuesday: Monday's errand was over.
    expect(assignTrip(need(FRIDAY, { lunch: true, plannedOn: TUESDAY }), trips)).toEqual(
      shop(FRIDAY),
    );
    // One shopping day only, as on the handwritten list.
    expect(assignTrip(need(MONDAY, { lunch: true }), singleTrip(MONDAY))).toEqual(shop(MONDAY));
  });

  it("buys the meat of a lunch on the butcher day before, where one reaches it", () => {
    const meat = { lunch: true, fresh: "butcher" as const, shelfLifeDays: 3 };
    const days = butcherWeekdays(DEFAULT_SHOPPING_DAYS);
    expect(assignTrip(need(MONDAY, meat), trips, undefined, days)).toEqual(butcher(SAT_BEFORE));
    // Monday is four days before Friday: too far for the butcher, so Friday it is.
    expect(assignTrip(need(FRIDAY, meat), trips, undefined, days)).toEqual(butcher(FRIDAY));
  });

  it("buys what is fresh at the market for the weekend and the start of the week", () => {
    const fresh = { fresh: "market" as const, shelfLifeDays: 5 };
    expect(assignTrip(need(SATURDAY, fresh), trips)).toEqual(market(SATURDAY));
    expect(assignTrip(need(SUNDAY, fresh), trips)).toEqual(market(SATURDAY));
    expect(assignTrip(need(MONDAY, fresh), trips)).toEqual(market(SAT_BEFORE));
    expect(assignTrip(need(TUESDAY, fresh), trips)).toEqual(market(SAT_BEFORE));
  });

  it("goes to the butcher for the meal that needs meat, on the day of that meal", () => {
    const meat = { fresh: "butcher" as const, shelfLifeDays: 3 };
    expect(assignTrip(need(WEDNESDAY, meat), trips)).toEqual(butcher(WEDNESDAY));
    expect(assignTrip(need(MONDAY, meat), trips)).toEqual(butcher(MONDAY));
    // Also on a day the household is at the supermarket anyway.
    expect(assignTrip(need(FRIDAY, meat), trips)).toEqual(butcher(FRIDAY));
  });

  it("goes to the bakery on the day of the meal for a kind of grocery the bakery sells", () => {
    const bread = { fresh: "bakery" as const, shelfLifeDays: 3 };
    expect(assignTrip(need(WEDNESDAY, bread), trips)).toEqual({
      date: WEDNESDAY,
      place: "bakery",
      trip: "main",
    });
    expect(assignTrip(need(SUNDAY, bread), trips)).toEqual({
      date: SATURDAY,
      place: "bakery",
      trip: "main",
    });
  });

  it("goes on the Saturday for a Sunday: the shops are closed then", () => {
    const meat = { fresh: "butcher" as const, shelfLifeDays: 3 };
    expect(assignTrip(need(SUNDAY, meat), trips)).toEqual(butcher(SATURDAY));
    expect(onDemandDay({ date: SUNDAY })).toBe(SATURDAY);
    // Planned on the Sunday itself, Saturday is over.
    expect(onDemandDay({ date: SUNDAY, plannedOn: SUNDAY })).toBe(SUNDAY);
    expect(onDemandDay({ date: SUNDAY, plannedOn: SATURDAY })).toBe(SATURDAY);
  });

  it("leaves the middle of the week to the supermarket", () => {
    const fresh = { fresh: "market" as const, shelfLifeDays: 5 };
    expect(assignTrip(need(WEDNESDAY, fresh), trips)).toEqual(shop(MONDAY));
    expect(assignTrip(need(FRIDAY, fresh), trips)).toEqual(shop(FRIDAY));
  });

  it("buys minced meat on the day it is cooked", () => {
    const mince = { fresh: "butcher" as const, shelfLifeDays: 1 };
    expect(assignTrip(need(MONDAY, mince), trips)).toEqual(butcher(MONDAY));
    expect(assignTrip(need(SUNDAY, mince), trips)).toEqual(butcher(SATURDAY));
  });

  it("marks what keeps from no shopping day as bought shortly before", () => {
    const fish = { fresh: "market" as const, shelfLifeDays: 1 };
    expect(assignTrip(need(THURSDAY, fish), trips)).toEqual(shop(MONDAY, "later"));
    expect(assignTrip(need(SUNDAY, { shelfLifeDays: 1 }), trips)).toEqual(shop(FRIDAY, "later"));
  });

  it("does not put on an errand what was planned after it", () => {
    // The week is planned on Sunday: Saturday's market is over.
    const fresh = { fresh: "market" as const, shelfLifeDays: 5, plannedOn: "2026-10-11" };
    expect(assignTrip(need(MONDAY, fresh), trips)).toEqual(shop(MONDAY));
    expect(assignTrip(need(TUESDAY, fresh), trips)).toEqual(shop(MONDAY));
    // Planned on the morning of the market, it is still bought there.
    const early = { ...fresh, plannedOn: SAT_BEFORE };
    expect(assignTrip(need(MONDAY, early), trips)).toEqual(market(SAT_BEFORE));
  });

  it("marks a meal planned after its shopping day as bought in between", () => {
    const late = { plannedOn: WEDNESDAY };
    expect(assignTrip(need(THURSDAY, late), trips)).toEqual(shop(MONDAY, "later"));
    expect(assignTrip(need(FRIDAY, late), trips)).toEqual(shop(FRIDAY));
  });

  it("goes to a shop named on purpose on the day of the meal", () => {
    // Bread and cold cuts for a supper on Thursday.
    expect(assignTrip(need(THURSDAY, { at: "bakery" }), trips)).toEqual({
      date: THURSDAY,
      place: "bakery",
      trip: "main",
    });
    expect(assignTrip(need(THURSDAY, { at: "butcher" }), trips)).toEqual(butcher(THURSDAY));
    expect(assignTrip(need(MONDAY, { at: "butcher" }), trips)).toEqual(butcher(MONDAY));
  });

  it("uses the market's day for a market named on purpose, when that reaches the meal", () => {
    expect(assignTrip(need(SUNDAY, { at: "market" }), trips)).toEqual(market(SATURDAY));
    expect(assignTrip(need(THURSDAY, { at: "market" }), trips)).toEqual(market(THURSDAY));
  });

  it("puts everything on the one list of a household that buys in one go", () => {
    const monday = singleTrip(MONDAY);
    const meat = { fresh: "butcher" as const, shelfLifeDays: 3 };
    expect(assignTrip(need(WEDNESDAY, meat), monday, [])).toEqual(shop(MONDAY));
  });

  it("works as before for a household with one shopping day", () => {
    const monday = singleTrip(MONDAY);
    expect(assignTrip(need(SUNDAY), monday)).toEqual(shop(MONDAY));
    expect(assignTrip(need(SUNDAY, { shelfLifeDays: 6 }), monday)).toEqual(shop(MONDAY));
    expect(assignTrip(need(SUNDAY, { shelfLifeDays: 5 }), monday)).toEqual(shop(MONDAY, "later"));
    expect(assignTrip(need(MONDAY, { shelfLifeDays: 0 }), monday)).toEqual(shop(MONDAY));
    expect(assignTrip(need(SUNDAY, { fresh: "market" }), monday)).toEqual(shop(MONDAY));
  });

  it("has no answer without a shopping day", () => {
    expect(assignTrip(need(MONDAY), [])).toBeNull();
  });
});

describe("nextTrip", () => {
  it("is today when today is a shopping day", () => {
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, MONDAY, null)).toEqual({
      date: MONDAY,
      place: "supermarket",
    });
  });

  it("is the next supermarket day for what is not sold fresh elsewhere", () => {
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, TUESDAY, null)?.date).toBe(FRIDAY);
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, SATURDAY, null)?.date).toBe(NEXT_MONDAY);
  });

  it("is the market for what is sold fresh there, and the supermarket for the rest", () => {
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, SATURDAY, "market")).toEqual({
      date: SATURDAY,
      place: "market",
    });
    // The butcher has no day to wait for.
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, SATURDAY, "butcher")).toEqual({
      date: NEXT_MONDAY,
      place: "supermarket",
    });
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, TUESDAY, "market")).toEqual({
      date: FRIDAY,
      place: "supermarket",
    });
  });
});

describe("the drugstore", () => {
  const days = withDrugstore(DEFAULT_SHOPPING_DAYS, DEFAULT_DRUGSTORE_WEEKDAY);
  const withDm = tripsBetween(days, "2026-10-05", "2026-10-25");

  it("has a note on its weekday every week, next to the other errands of that day", () => {
    expect(tripsBetween(days, FRIDAY, SATURDAY)).toEqual([
      { date: FRIDAY, place: "supermarket" },
      { date: SATURDAY, place: "market" },
      { date: SATURDAY, place: "drugstore" },
    ]);
    expect(drugstoreWeekday(days)).toBe(6);
    expect(drugstoreWeekday(withDrugstore(days, 3))).toBe(3);
    expect(withDrugstore(days, 3).filter((day) => day.places.includes("drugstore"))).toEqual([
      { weekday: 3, places: ["drugstore"] },
    ]);
  });

  it("is never where the meal plan buys anything", () => {
    for (const fresh of [null, "market", "butcher"] as const) {
      for (const date of [MONDAY, WEDNESDAY, SATURDAY, SUNDAY, NEXT_MONDAY]) {
        expect(assignTrip(need(date, { fresh }), withDm)?.place).not.toBe("drugstore");
      }
    }
    expect(nextTrip(days, SATURDAY, null)).toEqual({ date: NEXT_MONDAY, place: "supermarket" });
  });

  it("reads a weekday as stored or sent, and nothing else", () => {
    expect(readWeekday(6)).toBe(6);
    expect(readWeekday("2")).toBe(2);
    expect(readWeekday(0)).toBeNull();
    expect(readWeekday("8")).toBeNull();
    expect(readWeekday(null)).toBeNull();
    expect(readNoteId(`${SATURDAY}.drugstore`)).toEqual({ date: SATURDAY, place: "drugstore" });
  });
});
