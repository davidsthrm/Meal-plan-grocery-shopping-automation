import { describe, expect, it } from "vitest";
import { moveMeal } from "./move-meal";
import type { PlanSlot } from "./plan";
import type { Recipe } from "./recipe";
import { buildShoppingList } from "./shopping-list/build";
import { line, testIndex } from "./shopping-list/test-catalog";
import { DEFAULT_SHOPPING_DAYS, tripsBetween } from "./shopping-list/trips";

// The week of 12 October 2026, Monday to Sunday.
const MON = "2026-10-12";
const TUE = "2026-10-13";
const WED = "2026-10-14";
const THU = "2026-10-15";

const soup: PlanSlot = {
  id: "suppe",
  date: MON,
  meal: "dinner",
  kind: "recipes",
  // Two more at the table, two portions for leftovers, and bread with it.
  items: [{ recipeId: "kuerbissuppe", servings: 6, plannedOn: "2026-10-10" }],
  extra: 2,
  foods: [{ label: "Dinkelbaguette", quantity: 1, ingredientId: null, shopId: "baecker" }],
};
const leftovers: PlanSlot = {
  id: "reste",
  date: TUE,
  meal: "lunch",
  kind: "leftovers",
  ofSlotId: "suppe",
};
const vesper: PlanSlot = {
  id: "vesper",
  date: WED,
  meal: "dinner",
  kind: "free_text",
  label: "Vesper",
  foods: [{ label: "Brot", quantity: null, ingredientId: "brot", shopId: "baecker" }],
};
const pasta: PlanSlot = {
  id: "nudeln",
  date: THU,
  meal: "lunch",
  kind: "recipes",
  items: [{ recipeId: "nudeln", servings: 4 }],
};
const week = [soup, leftovers, vesper, pasta];
const at = (slots: readonly PlanSlot[], id: string) => slots.find((slot) => slot.id === id);

describe("moveMeal", () => {
  it("leaves a meal where it is when its own place is picked", () => {
    expect(moveMeal(week, pasta, { date: THU, meal: "lunch" })).toEqual({ kind: "stay" });
  });

  it("moves a meal to a free place, with everything it holds", () => {
    const move = moveMeal(week, pasta, { date: WED, meal: "lunch" });
    expect(move.kind).toBe("move");
    if (move.kind !== "move") return;
    expect(at(move.slots, "nudeln")).toEqual({ ...pasta, date: WED, meal: "lunch" });
    expect(move.slots.filter((slot) => slot.date === THU)).toEqual([]);
  });

  it("swaps with a planned meal, each keeping its persons, extra portions and foods", () => {
    // Without its leftovers on Tuesday, which would then come before it.
    const swap = moveMeal([soup, pasta], soup, { date: THU, meal: "lunch" });
    expect(swap.kind).toBe("swap");
    if (swap.kind !== "swap") return;
    expect(swap.other).toBe(pasta);
    expect(at(swap.slots, "suppe")).toEqual({ ...soup, date: THU, meal: "lunch" });
    expect(at(swap.slots, "nudeln")).toEqual({ ...pasta, date: MON, meal: "dinner" });
  });

  it("moves a typed meal with its text and foods", () => {
    const move = moveMeal(week, vesper, { date: THU, meal: "dinner" });
    expect(move.kind).toBe("move");
    if (move.kind !== "move") return;
    expect(at(move.slots, "vesper")).toEqual({ ...vesper, date: THU, meal: "dinner" });
  });

  it("moves a meal and its leftovers keep it as theirs", () => {
    // Monday's dinner a meal earlier: its leftovers on Tuesday are still after it.
    const move = moveMeal(week, soup, { date: MON, meal: "lunch" });
    expect(move.kind).toBe("move");
    if (move.kind !== "move") return;
    expect(at(move.slots, "reste")).toEqual(leftovers);
    // The leftovers a day later are still after the soup.
    const later = moveMeal(week, leftovers, { date: WED, meal: "lunch" });
    expect(later.kind).toBe("move");
  });

  it("refuses leftovers before the meal they are cooked with, or at its place", () => {
    const refused = { kind: "refused", leftovers, source: soup };
    // The soup after its leftovers.
    expect(moveMeal(week, soup, { date: WED, meal: "lunch" })).toEqual(refused);
    // The leftovers before the soup.
    expect(moveMeal(week, leftovers, { date: MON, meal: "lunch" })).toEqual(refused);
    // The two swapped.
    expect(moveMeal(week, leftovers, { date: MON, meal: "dinner" })).toEqual(refused);
    // Another meal swapped with the soup, which then comes after its leftovers.
    expect(moveMeal(week, vesper, { date: MON, meal: "dinner" })).toEqual(refused);
  });

  it("lets leftovers of a meal in the week before go anywhere in this week", () => {
    const ofSunday: PlanSlot = { ...leftovers, ofSlotId: "sonntag-letzte-woche" };
    const move = moveMeal([ofSunday], ofSunday, { date: MON, meal: "lunch" });
    expect(move.kind).toBe("move");
  });

  it("leaves leftovers alone that are not linked to the meals that move", () => {
    // Leftovers stored before their meal, by whatever means: no reason to refuse a move of
    // two other meals.
    const early: PlanSlot = { ...leftovers, date: MON, meal: "lunch" };
    const move = moveMeal([soup, early, vesper, pasta], pasta, { date: WED, meal: "dinner" });
    expect(move.kind).toBe("swap");
  });
});

describe("a moved meal on the shopping notes", () => {
  const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-10-05", "2026-10-25");
  const recipes: Recipe[] = [
    {
      id: "nudeln",
      title: "Nudeln",
      kind: "cookbook",
      servings: { min: 4, max: 4, unit: null },
      ingredients: [line("joghurt", 500, "g")],
    },
  ];
  const notes = (slots: PlanSlot[]) =>
    buildShoppingList({ index: testIndex, recipes, slots, trips }).map((shown) => ({
      key: shown.key,
      on: `${shown.shoppingDate}.${shown.place}`,
    }));

  it("keeps its line, and so its tick, where the same errand buys for the new day", () => {
    const move = moveMeal([pasta], pasta, { date: WED, meal: "dinner" });
    if (move.kind !== "move") throw new Error("moved");
    expect(notes([pasta])).toEqual([{ key: "joghurt@main", on: `${MON}.supermarket` }]);
    expect(notes(move.slots)).toEqual(notes([pasta]));
  });

  it("is a new line on another errand's note where that one buys for the new day", () => {
    // Yoghurt for a Saturday does not keep from Monday: Friday buys it, and a tick on
    // Monday's note stays with Monday's note.
    const move = moveMeal([pasta], pasta, { date: "2026-10-17", meal: "dinner" });
    if (move.kind !== "move") throw new Error("moved");
    expect(notes(move.slots)).toEqual([{ key: "joghurt@main", on: "2026-10-16.supermarket" }]);
  });
});
