import { describe, expect, it } from "vitest";
import {
  assignTrip,
  DEFAULT_SHOPPING_DAYS,
  nextTrip,
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
  market: false,
  shelfLifeDays: null,
  ...patch,
});

describe("tripsBetween", () => {
  it("lists the shopping days of a span in order", () => {
    expect(tripsBetween(DEFAULT_SHOPPING_DAYS, SAT_BEFORE, SATURDAY)).toEqual([
      { date: SAT_BEFORE, kind: "market" },
      { date: MONDAY, kind: "all" },
      { date: FRIDAY, kind: "all" },
      { date: SATURDAY, kind: "market" },
    ]);
  });

  it("counts a day with supermarket and market as a day for everything", () => {
    const days = [
      { weekday: 6, kind: "market" as const },
      { weekday: 6, kind: "all" as const },
    ];
    expect(tripsBetween(days, SATURDAY, SATURDAY)).toEqual([{ date: SATURDAY, kind: "all" }]);
  });
});

describe("assignTrip", () => {
  it("buys at the supermarket on the last shopping day before the meal", () => {
    expect(assignTrip(need(MONDAY), trips)).toEqual({ date: MONDAY, trip: "main" });
    expect(assignTrip(need(THURSDAY), trips)).toEqual({ date: MONDAY, trip: "main" });
    expect(assignTrip(need(FRIDAY), trips)).toEqual({ date: FRIDAY, trip: "main" });
    expect(assignTrip(need(SUNDAY), trips)).toEqual({ date: FRIDAY, trip: "main" });
  });

  it("buys what is fresh at the market for the weekend and the start of the week", () => {
    const fresh = { market: true, shelfLifeDays: 5 };
    expect(assignTrip(need(SATURDAY, fresh), trips)).toEqual({ date: SATURDAY, trip: "main" });
    expect(assignTrip(need(SUNDAY, fresh), trips)).toEqual({ date: SATURDAY, trip: "main" });
    expect(assignTrip(need(MONDAY, fresh), trips)).toEqual({ date: SAT_BEFORE, trip: "main" });
    expect(assignTrip(need(TUESDAY, fresh), trips)).toEqual({ date: SAT_BEFORE, trip: "main" });
  });

  it("leaves the middle of the week to the supermarket", () => {
    const fresh = { market: true, shelfLifeDays: 5 };
    expect(assignTrip(need(WEDNESDAY, fresh), trips)).toEqual({ date: MONDAY, trip: "main" });
    expect(assignTrip(need(FRIDAY, fresh), trips)).toEqual({ date: FRIDAY, trip: "main" });
  });

  it("does not buy at the market what would not keep until the meal", () => {
    // Minced meat for Monday is not bought on Saturday.
    const mince = { market: true, shelfLifeDays: 1 };
    expect(assignTrip(need(MONDAY, mince), trips)).toEqual({ date: MONDAY, trip: "main" });
    expect(assignTrip(need(SUNDAY, mince), trips)).toEqual({ date: SATURDAY, trip: "main" });
  });

  it("lists what keeps from no shopping day as bought shortly before", () => {
    const fish = { market: true, shelfLifeDays: 1 };
    expect(assignTrip(need(THURSDAY, fish), trips)).toEqual({ date: MONDAY, trip: "later" });
    expect(assignTrip(need(SUNDAY, { shelfLifeDays: 1 }), trips)).toEqual({
      date: FRIDAY,
      trip: "later",
    });
  });

  it("does not put on a shopping day what was planned after it", () => {
    // The week is planned on Sunday: Saturday's market is over.
    const fresh = { market: true, shelfLifeDays: 5, plannedOn: "2026-10-11" };
    expect(assignTrip(need(MONDAY, fresh), trips)).toEqual({ date: MONDAY, trip: "main" });
    expect(assignTrip(need(TUESDAY, fresh), trips)).toEqual({ date: MONDAY, trip: "main" });
    // Planned on the morning of the market, it is still bought there.
    const early = { ...fresh, plannedOn: SAT_BEFORE };
    expect(assignTrip(need(MONDAY, early), trips)).toEqual({ date: SAT_BEFORE, trip: "main" });
  });

  it("lists a meal planned after its shopping day as bought in between", () => {
    const late = { plannedOn: WEDNESDAY };
    expect(assignTrip(need(THURSDAY, late), trips)).toEqual({ date: MONDAY, trip: "later" });
    expect(assignTrip(need(FRIDAY, late), trips)).toEqual({ date: FRIDAY, trip: "main" });
  });

  it("works as before for a household with one shopping day", () => {
    const monday = singleTrip(MONDAY);
    expect(assignTrip(need(SUNDAY), monday)).toEqual({ date: MONDAY, trip: "main" });
    expect(assignTrip(need(SUNDAY, { shelfLifeDays: 6 }), monday)).toEqual({
      date: MONDAY,
      trip: "main",
    });
    expect(assignTrip(need(SUNDAY, { shelfLifeDays: 5 }), monday)).toEqual({
      date: MONDAY,
      trip: "later",
    });
    expect(assignTrip(need(MONDAY, { shelfLifeDays: 0 }), monday)).toEqual({
      date: MONDAY,
      trip: "main",
    });
    expect(assignTrip(need(SUNDAY, { market: true }), monday)).toEqual({
      date: MONDAY,
      trip: "main",
    });
  });

  it("has no answer without a shopping day", () => {
    expect(assignTrip(need(MONDAY), [])).toBeNull();
  });
});

describe("nextTrip", () => {
  it("is today when today is a shopping day", () => {
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, MONDAY, false)).toEqual({ date: MONDAY, kind: "all" });
  });

  it("is the next supermarket day for what the market does not sell", () => {
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, TUESDAY, false)?.date).toBe(FRIDAY);
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, SATURDAY, false)?.date).toBe(NEXT_MONDAY);
  });

  it("is the market for what is sold fresh there", () => {
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, SATURDAY, true)?.date).toBe(SATURDAY);
    expect(nextTrip(DEFAULT_SHOPPING_DAYS, TUESDAY, true)?.date).toBe(FRIDAY);
  });
});
