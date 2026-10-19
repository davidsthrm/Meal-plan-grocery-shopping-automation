import { describe, expect, it } from "vitest";
import {
  hasWeekBefore,
  weekShown,
  addDays,
  dayAndMonth,
  daysBetween,
  isIsoDate,
  isoWeek,
  mondayOf,
  monthAndYear,
  monthOfWeek,
  planningWeek,
  weekDates,
  weekRange,
  weekdayLong,
  weekdayShort,
} from "./dates";

describe("dates", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-10-12", "2026-10-18")).toBe(6);
    expect(daysBetween("2026-10-12", "2026-10-12")).toBe(0);
    expect(daysBetween("2026-10-18", "2026-10-12")).toBe(-6);
  });

  it("is not thrown off by the end of daylight saving time", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("names the weekday as the plan does", () => {
    expect(weekdayShort("2026-10-12")).toBe("Mo");
    expect(weekdayShort("2026-10-18")).toBe("So");
  });

  it("finds the Monday of any day's week", () => {
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-15")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  it("lists the seven days of a week", () => {
    expect(weekDates("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("opens the planner on the running week, and from Saturday on the coming one", () => {
    expect(planningWeek("2026-10-12")).toBe("2026-10-12");
    expect(planningWeek("2026-10-16")).toBe("2026-10-12");
    expect(planningWeek("2026-10-17")).toBe("2026-10-19");
    expect(planningWeek("2026-10-18")).toBe("2026-10-19");
  });

  it("writes days and weeks the German way", () => {
    expect(weekdayLong("2026-10-13")).toBe("Dienstag");
    expect(dayAndMonth("2026-10-03")).toBe("3. Oktober");
    expect(weekRange("2026-10-12")).toBe("12.–18. Oktober");
    expect(weekRange("2026-09-28")).toBe("28. September – 4. Oktober");
    expect(weekRange("2026-12-28")).toBe("28. Dezember – 3. Januar");
  });

  it("numbers the weeks as the calendar on the wall does", () => {
    expect(isoWeek("2026-10-12")).toBe(42);
    expect(isoWeek("2026-10-18")).toBe(42);
    // The first days of January can belong to the last week of the year before.
    expect(isoWeek("2027-01-03")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(isoWeek("2025-12-29")).toBe(1);
  });

  it("counts a week for the month most of its days are in", () => {
    expect(monthOfWeek("2026-09-28")).toBe("2026-10");
    expect(monthOfWeek("2026-10-26")).toBe("2026-10");
    expect(monthAndYear("2026-10")).toBe("Oktober 2026");
  });

  it("tells a real date from anything else", () => {
    expect(isIsoDate("2026-10-12")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("12.10.2026")).toBe(false);
    expect(isIsoDate("2026-10-12T00:00")).toBe(false);
  });

  it("rejects anything that is not an ISO date", () => {
    expect(() => daysBetween("12.10.2026", "2026-10-18")).toThrow(/not an ISO date/);
  });
});

describe("the weeks a household can look at", () => {
  const first = "2026-10-19";

  it("shows the week asked for, by any of its days, or the opening week", () => {
    expect(weekShown("2026-11-04", "2026-10-26", first)).toBe("2026-11-02");
    expect(weekShown(undefined, "2026-10-26", first)).toBe("2026-10-26");
    expect(weekShown("kein Datum", "2026-10-26", first)).toBe("2026-10-26");
  });

  it("goes back no further than the week the household started with", () => {
    expect(weekShown("2026-10-12", "2026-10-26", first)).toBe(first);
    expect(weekShown("2026-10-21", "2026-10-26", first)).toBe(first);
    expect(hasWeekBefore("2026-10-26", first)).toBe(true);
    expect(hasWeekBefore(first, first)).toBe(false);
  });

  it("has no limit for a household without a first week", () => {
    expect(weekShown("2025-01-08", "2026-10-26", null)).toBe("2025-01-06");
    expect(hasWeekBefore("2025-01-06", null)).toBe(true);
  });
});
