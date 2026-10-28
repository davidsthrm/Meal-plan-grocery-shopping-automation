import { describe, expect, it } from "vitest";
import {
  weekPlanned,
  byDayAndMeal,
  cookedServings,
  mealsOf,
  namedMeal,
  nextOpenMeal,
  openMealsAfter,
  slotKey,
  weekStrip,
  type PlanSlot,
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

describe("weekStrip", () => {
  const WEEK = "2026-10-12";
  const slot = (date: string, meal: PlanSlot["meal"]): PlanSlot => ({
    id: `${date}.${meal}`,
    date,
    meal,
    kind: "free_text",
    label: "Vesper",
  });

  it("lists the seven days with lunch and dinner, planned or not", () => {
    const strip = weekStrip(WEEK, [slot("2026-10-13", "dinner")], null);
    expect(strip.map((day) => day.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(strip[1].meals.map((entry) => [entry.meal, entry.slot?.id ?? null])).toEqual([
      ["lunch", null],
      ["dinner", "2026-10-13.dinner"],
    ]);
  });

  it("marks the meal a recipe is chosen for", () => {
    const strip = weekStrip(WEEK, [], { date: "2026-10-14", meal: "lunch" });
    expect(strip.flatMap((day) => day.meals.filter((entry) => entry.current))).toHaveLength(1);
    expect(strip[2].meals[0]).toMatchObject({ meal: "lunch", current: true });
  });

  it("shows Sunday's coffee only when it is planned or being chosen for", () => {
    const sunday = (strip: ReturnType<typeof weekStrip>) => strip[6].meals.map((e) => e.meal);
    expect(sunday(weekStrip(WEEK, [], null))).toEqual(["lunch", "dinner"]);
    expect(sunday(weekStrip(WEEK, [slot("2026-10-18", "coffee")], null))).toEqual([
      "lunch",
      "coffee",
      "dinner",
    ]);
    expect(sunday(weekStrip(WEEK, [], { date: "2026-10-18", meal: "coffee" }))).toEqual([
      "lunch",
      "coffee",
      "dinner",
    ]);
  });
});

describe("weekPlanned", () => {
  const MONDAY = "2026-11-02";
  const all = Array.from({ length: 7 }, (_, day) => {
    const date = new Date(Date.UTC(2026, 10, 2 + day)).toISOString().slice(0, 10);
    return [
      { date, meal: "lunch" as const },
      { date, meal: "dinner" as const },
    ];
  }).flat();

  it("is planned once every lunch and dinner holds something, coffee or not", () => {
    expect(weekPlanned(all, MONDAY)).toBe(true);
    expect(weekPlanned([...all, { date: "2026-11-08", meal: "coffee" }], MONDAY)).toBe(true);
  });

  it("is not planned while one meal is open", () => {
    expect(weekPlanned(all.slice(1), MONDAY)).toBe(false);
    expect(weekPlanned([], MONDAY)).toBe(false);
    // A meal of another week does not count for this one.
    expect(weekPlanned([...all.slice(1), { date: "2026-11-09", meal: "lunch" }], MONDAY)).toBe(
      false,
    );
  });
});
