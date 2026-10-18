import { describe, expect, it } from "vitest";
import { DAILY_TABLES, LIBRARY_TABLES, quicker, refreshAt } from "./live-refresh";

const never = -Infinity;

describe("refreshAt", () => {
  it("reads the page half a second after a planned meal or a tick", () => {
    expect(refreshAt({ now: 1000, firstAt: 1000, pace: "daily", lastOwn: never })).toBe(1500);
  });

  it("waits out a burst of library changes for three seconds", () => {
    expect(refreshAt({ now: 1000, firstAt: 1000, pace: "library", lastOwn: never })).toBe(4000);
    // Another recipe of the same import a second later moves the read behind it.
    expect(refreshAt({ now: 2000, firstAt: 1000, pace: "library", lastOwn: never })).toBe(5000);
  });

  it("reads the page every ten seconds while an import goes on", () => {
    expect(refreshAt({ now: 9000, firstAt: 1000, pace: "library", lastOwn: never })).toBe(11_000);
    expect(refreshAt({ now: 10_900, firstAt: 1000, pace: "library", lastOwn: never })).toBe(11_000);
  });

  it("waits until this device's own taps have stopped for three seconds", () => {
    expect(refreshAt({ now: 1000, firstAt: 1000, pace: "daily", lastOwn: 800 })).toBe(3800);
  });
});

describe("quicker", () => {
  it("lets a change to the plan be read at its own pace, whatever else is waiting", () => {
    expect(quicker(null, "library")).toBe("library");
    expect(quicker("library", "daily")).toBe("daily");
    expect(quicker("daily", "library")).toBe("daily");
  });
});

describe("tables", () => {
  it("listens to each table at one pace only", () => {
    const daily: readonly string[] = DAILY_TABLES;
    expect(LIBRARY_TABLES.filter((table) => daily.includes(table))).toEqual([]);
  });
});
