import { describe, expect, it } from "vitest";
import {
  assignTrip,
  DEFAULT_SHOPPING_DAYS,
  nextTrip,
  noteId,
  onDemandDay,
  readDaysForm,
  readNoteId,
  readShoppingDays,
  singleTrip,
  tripsBetween,
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

  it("leaves out days once stored for the butcher and the bakery: they have none", () => {
    expect(
      readShoppingDays([
        { weekday: 1, places: ["supermarket"] },
        { weekday: 3, places: ["bakery"] },
        { weekday: 6, places: ["butcher", "market"] },
      ]),
    ).toEqual([
      { weekday: 1, places: ["supermarket"] },
      { weekday: 6, places: ["market"] },
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
    const ticked = { supermarket: ["1", "5"], market: ["3", "6"] };
    expect(readDaysForm((place) => ticked[place])).toEqual([
      { weekday: 1, places: ["supermarket"] },
      { weekday: 3, places: ["market"] },
      { weekday: 5, places: ["supermarket"] },
      { weekday: 6, places: ["market"] },
    ]);
  });

  it("refuses a household that never goes to the supermarket", () => {
    const ticked = { supermarket: [], market: ["6"] };
    expect(readDaysForm((place) => ticked[place])).toBeNull();
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
