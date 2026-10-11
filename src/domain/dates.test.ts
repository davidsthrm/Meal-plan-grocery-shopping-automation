import { describe, expect, it } from "vitest";
import { addDays, daysBetween, weekdayShort } from "./dates";

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

  it("rejects anything that is not an ISO date", () => {
    expect(() => daysBetween("12.10.2026", "2026-10-18")).toThrow(/not an ISO date/);
  });
});
