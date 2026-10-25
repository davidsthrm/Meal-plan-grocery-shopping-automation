import { describe, expect, it } from "vitest";
import {
  bucketsOf,
  daysCounted,
  hasPeriodAfter,
  hasPeriodBefore,
  periodOf,
  periodTitle,
  periodWeeksText,
  readPeriod,
  shiftPeriod,
  weeksCounted,
} from "./period";

describe("periods", () => {
  it("makes a month of the weeks most of whose days are in it", () => {
    // 1 October 2026 is a Thursday: the week of 28 September counts for October.
    const october = periodOf("month", "2026-10-14");
    expect(october.key).toBe("2026-10");
    expect(october.weeks).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(october.start).toBe("2026-09-28");
    expect(october.end).toBe("2026-11-01");
    // 1 November is a Sunday of a week that counts for October.
    expect(periodOf("month", "2026-11-01").key).toBe("2026-10");
  });

  it("makes a year of whole weeks", () => {
    const year = periodOf("year", "2026-10-25");
    expect(year.key).toBe("2026");
    // 1 January 2026 is a Thursday: its week starts on 29 December 2025.
    expect(year.start).toBe("2025-12-29");
    expect(year.weeks).toHaveLength(53);
    expect(year.end).toBe("2027-01-03");
  });

  it("reads the period from the address, and today's month from anything else", () => {
    expect(readPeriod("woche", "2026-10-21", "2026-10-25").key).toBe("2026-10-19");
    expect(readPeriod("jahr", "2025", "2026-10-25").key).toBe("2025");
    expect(readPeriod("monat", "2026-02", "2026-10-25").weeks[0]).toBe("2026-02-02");
    expect(readPeriod(undefined, undefined, "2026-10-25").key).toBe("2026-10");
    expect(readPeriod("monat", "2026-13", "2026-10-25").key).toBe("2026-10");
    expect(readPeriod("quartal", "x", "2026-10-25")).toMatchObject({
      kind: "month",
      key: "2026-10",
    });
  });

  it("goes back and forward", () => {
    const october = periodOf("month", "2026-10-14");
    expect(shiftPeriod(october, -1).key).toBe("2026-09");
    expect(shiftPeriod(october, 1).key).toBe("2026-11");
    expect(shiftPeriod(periodOf("week", "2026-10-21"), 1).key).toBe("2026-10-26");
    expect(shiftPeriod(periodOf("year", "2026-10-21"), -1).key).toBe("2025");
  });

  it("goes back no further than the first week, and not past today", () => {
    const october = periodOf("month", "2026-10-14");
    expect(hasPeriodBefore(october, "2026-10-19")).toBe(false);
    expect(hasPeriodBefore(october, null)).toBe(true);
    expect(hasPeriodBefore(periodOf("month", "2026-11-10"), "2026-10-19")).toBe(true);
    expect(hasPeriodAfter(october, "2026-10-25")).toBe(false);
    expect(hasPeriodAfter(periodOf("month", "2026-09-10"), "2026-10-25")).toBe(true);
  });

  it("counts the days and weeks that have been, from the first week on", () => {
    const october = periodOf("month", "2026-10-14");
    expect(daysCounted(october, "2026-10-25", "2026-10-19")).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
    });
    expect(daysCounted(periodOf("month", "2026-12-10"), "2026-10-25", null)).toBeNull();
    expect(weeksCounted(october, "2026-10-25", "2026-10-19")).toEqual(["2026-10-19"]);
  });

  it("names a period", () => {
    expect(periodTitle(periodOf("month", "2026-10-14"))).toBe("Oktober 2026");
    expect(periodTitle(periodOf("week", "2026-10-21"))).toBe("KW 43");
    expect(periodTitle(periodOf("year", "2026-10-21"))).toBe("2026");
    expect(periodWeeksText(periodOf("month", "2026-10-14"))).toBe("KW 40–44");
  });

  it("has a bar per week of a month, per month of a year, and eight weeks up to a week", () => {
    const month = bucketsOf(periodOf("month", "2026-10-14"), "2026-10-25", null);
    expect(month.map((bar) => bar.label)).toEqual(["KW 40", "KW 41", "KW 42", "KW 43"]);
    expect(month[0].opens).toEqual({ kind: "week", key: "2026-09-28" });

    const year = bucketsOf(periodOf("year", "2026-10-14"), "2026-10-25", "2026-08-03");
    expect(year.map((bar) => bar.label)).toEqual(["Aug", "Sep", "Okt"]);
    expect(year[2].opens).toEqual({ kind: "month", key: "2026-10" });

    const week = bucketsOf(periodOf("week", "2026-10-21"), "2026-10-25", null);
    expect(week).toHaveLength(8);
    expect(week.at(-1)?.key).toBe("2026-10-19");
    expect(week[0].key).toBe("2026-08-31");
  });
});
