import { describe, expect, it } from "vitest";
import type { PlanSlot } from "./plan";
import { daysOfWeek, weeksByMonth, withCurrentWeek } from "./plan-history";

const meal = (date: string, when: "lunch" | "dinner", recipeId: string): PlanSlot => ({
  id: `${date}-${when}`,
  date,
  meal: when,
  kind: "recipes",
  items: [{ recipeId, servings: 4 }],
});
const week = (weekStart: string, ...slots: PlanSlot[]) => ({ weekStart, slots });

describe("weeksByMonth", () => {
  it("groups weeks by month, the newest first", () => {
    const months = weeksByMonth([
      week("2026-09-21"),
      week("2026-10-12"),
      week("2026-10-05"),
      // Most of this week's days are in October.
      week("2026-09-28"),
    ]);
    expect(months.map((entry) => [entry.month, entry.weeks.map((w) => w.weekStart)])).toEqual([
      ["2026-10", ["2026-10-12", "2026-10-05", "2026-09-28"]],
      ["2026-09", ["2026-09-21"]],
    ]);
  });
});

describe("withCurrentWeek", () => {
  const planned = week("2026-10-05", meal("2026-10-06", "lunch", "lasagne"));

  it("lists the week being planned even while nothing is in it", () => {
    expect(withCurrentWeek([planned], "2026-10-12").map((w) => w.weekStart)).toEqual([
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(withCurrentWeek([planned], "2026-10-05")).toHaveLength(1);
  });

  it("leaves out other weeks that were opened and never planned", () => {
    expect(withCurrentWeek([planned, week("2026-09-28")], "2026-10-05")).toEqual([planned]);
  });
});

describe("daysOfWeek", () => {
  it("lays a week out as seven days with their meals", () => {
    const days = daysOfWeek(
      week(
        "2026-10-12",
        meal("2026-10-13", "dinner", "suppe"),
        meal("2026-10-13", "lunch", "lachs"),
      ),
    );
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-10-12", meals: {} });
    expect(Object.keys(days[1].meals).sort()).toEqual(["dinner", "lunch"]);
  });
});
