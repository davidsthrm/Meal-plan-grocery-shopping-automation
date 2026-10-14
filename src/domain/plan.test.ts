import { describe, expect, it } from "vitest";
import {
  byDayAndMeal,
  copyOfWeek,
  mealsOf,
  namedMeal,
  nextOpenMeal,
  slotKey,
  type PlanSlot,
  type SlotFood,
} from "./plan";

const bread: SlotFood = { label: "Brot", ingredientId: "brot", shopId: "baecker" };

const lastWeek: PlanSlot[] = [
  {
    id: "a",
    date: "2026-10-05",
    meal: "lunch",
    kind: "recipes",
    items: [
      { recipeId: "lasagne", servings: 4 },
      { recipeId: "salat", servings: 4 },
    ],
  },
  {
    id: "b",
    date: "2026-10-05",
    meal: "dinner",
    kind: "free_text",
    label: "Vesper",
    foods: [bread],
  },
  { id: "c", date: "2026-10-06", meal: "lunch", kind: "leftovers", ofSlotId: "a" },
  { id: "d", date: "2026-10-07", meal: "lunch", kind: "away", label: "bei Oma" },
  { id: "e", date: "2026-10-11", meal: "dinner", kind: "skipped" },
];

describe("copyOfWeek", () => {
  it("moves every meal by the given days and keeps what it was", () => {
    expect(copyOfWeek(lastWeek, 7, new Set())).toEqual([
      {
        date: "2026-10-12",
        meal: "lunch",
        content: {
          kind: "recipes",
          items: [
            { recipeId: "lasagne", servings: 4 },
            { recipeId: "salat", servings: 4 },
          ],
        },
      },
      {
        date: "2026-10-12",
        meal: "dinner",
        content: { kind: "free_text", label: "Vesper", foods: [bread] },
      },
      { date: "2026-10-13", meal: "lunch", content: { kind: "leftovers" } },
      { date: "2026-10-14", meal: "lunch", content: { kind: "away", label: "bei Oma" } },
      { date: "2026-10-18", meal: "dinner", content: { kind: "skipped" } },
    ]);
  });

  it("leaves alone what the new week has planned already", () => {
    const taken = new Set([slotKey("2026-10-12", "lunch"), slotKey("2026-10-14", "lunch")]);
    expect(copyOfWeek(lastWeek, 7, taken).map((slot) => slotKey(slot.date, slot.meal))).toEqual([
      "2026-10-12:dinner",
      "2026-10-13:lunch",
      "2026-10-18:dinner",
    ]);
  });
});

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
