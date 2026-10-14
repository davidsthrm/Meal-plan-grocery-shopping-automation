import { describe, expect, it } from "vitest";
import type { PlanSlot } from "./plan";
import { currentWeeks, plannedAt, type WeekOnPlan } from "./planned";

describe("currentWeeks", () => {
  it("is the running week from Monday to Friday", () => {
    expect(currentWeeks("2026-10-12")).toEqual(["2026-10-12"]);
    expect(currentWeeks("2026-10-16")).toEqual(["2026-10-12"]);
  });

  it("takes in the coming week from Saturday on, when the planner shows it", () => {
    expect(currentWeeks("2026-10-17")).toEqual(["2026-10-12", "2026-10-19"]);
    expect(currentWeeks("2026-10-18")).toEqual(["2026-10-12", "2026-10-19"]);
  });
});

describe("plannedAt", () => {
  const slots: PlanSlot[] = [
    {
      id: "a",
      date: "2026-10-14",
      meal: "dinner",
      kind: "recipes",
      items: [{ recipeId: "lasagne", servings: 4 }],
    },
    {
      id: "b",
      date: "2026-10-14",
      meal: "lunch",
      kind: "recipes",
      items: [
        { recipeId: "linsen", servings: 4 },
        { recipeId: "lasagne", servings: 4 },
      ],
    },
    { id: "c", date: "2026-10-13", meal: "lunch", kind: "free_text", label: "lasagne" },
  ];
  const week: WeekOnPlan = {
    weekStart: "2026-10-12",
    slots,
    extras: [{ recipeId: "kuchen", servings: 1, note: null }],
  };

  it("names the first meal a recipe is on, also as a side", () => {
    expect(plannedAt("lasagne", [week])).toEqual({
      week: "2026-10-12",
      date: "2026-10-14",
      meal: "lunch",
    });
  });

  it("knows a recipe the week needs outside its meals, without a day", () => {
    expect(plannedAt("kuchen", [week])).toEqual({ week: "2026-10-12", date: null, meal: null });
  });

  it("is null for a recipe on no plan, and a meal's text does not count", () => {
    expect(plannedAt("steak", [week])).toBeNull();
    expect(plannedAt("steak", [])).toBeNull();
  });

  it("looks at the earlier week first", () => {
    const next: WeekOnPlan = {
      weekStart: "2026-10-19",
      slots: [{ ...slots[0], id: "d", date: "2026-10-19" }],
      extras: [],
    };
    expect(plannedAt("lasagne", [next, week])?.date).toBe("2026-10-14");
    expect(plannedAt("lasagne", [next])?.date).toBe("2026-10-19");
  });
});
