import { describe, expect, it } from "vitest";
import {
  byDayAndMeal,
  cookedServings,
  mealsOf,
  namedMeal,
  nextOpenMeal,
  openMealsAfter,
  slotKey,
} from "./plan";

describe("namedMeal", () => {
  it("knows a meal nobody is home for, however it is typed", () => {
    expect(namedMeal("keiner daheim")).toEqual({ label: "Keiner daheim", kind: "skipped" });
    expect(namedMeal("Oma Heidrun ")?.kind).toBe("away");
  });

  it("takes any other text for a meal of its own", () => {
    expect(namedMeal("Pizza bestellen")).toBeUndefined();
    expect(namedMeal("Fällt aus")).toBeUndefined();
  });
});

describe("the meals of a day", () => {
  it("adds coffee and cake on Sundays, between lunch and dinner", () => {
    expect(mealsOf("2026-10-17")).toEqual(["lunch", "dinner"]);
    expect(mealsOf("2026-10-18")).toEqual(["lunch", "coffee", "dinner"]);
  });

  it("sorts meals by day and time of day", () => {
    const meals = [
      { date: "2026-10-18", meal: "dinner" as const },
      { date: "2026-10-18", meal: "coffee" as const },
      { date: "2026-10-12", meal: "dinner" as const },
      { date: "2026-10-18", meal: "lunch" as const },
    ];
    expect(meals.sort(byDayAndMeal).map((slot) => `${slot.date.slice(8)} ${slot.meal}`)).toEqual([
      "12 dinner",
      "18 lunch",
      "18 coffee",
      "18 dinner",
    ]);
  });
});

describe("nextOpenMeal", () => {
  const SUNDAY = "2026-10-18";
  const taken = new Set([slotKey("2026-10-12", "dinner"), slotKey("2026-10-13", "lunch")]);

  it("goes from lunch to dinner, and from dinner to the next day's lunch", () => {
    expect(nextOpenMeal({ date: "2026-10-14", meal: "lunch" }, new Set(), SUNDAY)).toEqual({
      date: "2026-10-14",
      meal: "dinner",
    });
    expect(nextOpenMeal({ date: "2026-10-14", meal: "dinner" }, new Set(), SUNDAY)).toEqual({
      date: "2026-10-15",
      meal: "lunch",
    });
  });

  it("passes over what is planned already", () => {
    expect(nextOpenMeal({ date: "2026-10-12", meal: "lunch" }, taken, SUNDAY)).toEqual({
      date: "2026-10-13",
      meal: "dinner",
    });
  });

  it("leaves out coffee on Sunday, and goes on from it to dinner", () => {
    expect(nextOpenMeal({ date: SUNDAY, meal: "lunch" }, new Set(), "2026-10-25")).toEqual({
      date: SUNDAY,
      meal: "dinner",
    });
    expect(nextOpenMeal({ date: SUNDAY, meal: "coffee" }, new Set(), SUNDAY)).toEqual({
      date: SUNDAY,
      meal: "dinner",
    });
  });

  it("goes on into the next week, and finds nothing when all is planned until the last day", () => {
    expect(nextOpenMeal({ date: SUNDAY, meal: "dinner" }, new Set(), "2026-10-25")).toEqual({
      date: "2026-10-19",
      meal: "lunch",
    });
    expect(nextOpenMeal({ date: SUNDAY, meal: "dinner" }, new Set(), SUNDAY)).toBeNull();
  });
});

describe("openMealsAfter", () => {
  it("lists the open meals of the next days in order, where leftovers can go", () => {
    const taken = new Set([slotKey("2026-10-13", "lunch")]);
    expect(openMealsAfter({ date: "2026-10-12", meal: "dinner" }, taken, "2026-10-14")).toEqual([
      { date: "2026-10-13", meal: "dinner" },
      { date: "2026-10-14", meal: "lunch" },
      { date: "2026-10-14", meal: "dinner" },
    ]);
  });

  it("is empty when everything until the last day is planned", () => {
    const taken = new Set([slotKey("2026-10-12", "dinner")]);
    expect(openMealsAfter({ date: "2026-10-12", meal: "lunch" }, taken, "2026-10-12")).toEqual([]);
  });
});

describe("cookedServings", () => {
  it("adds the extra portions to what is cooked for persons", () => {
    expect(cookedServings(4, 2, true)).toBe(6);
    expect(cookedServings(4, undefined, true)).toBe(4);
  });

  it("leaves a recipe that makes something else as it is: one cake tin stays one", () => {
    expect(cookedServings(1, 2, false)).toBe(1);
  });
});
