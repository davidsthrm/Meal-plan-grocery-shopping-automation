import { describe, expect, it } from "vitest";
import { summary } from "../library/testing";
import type { PlanSlot } from "../plan";
import { DEFAULT_TARGETS, isFull, mealGroup, missing, weekBalance, withMeal } from "./balance";

const recipes = [
  summary("lasagne"),
  summary("curry", { proteinType: "vegan" }),
  summary("lachs", { proteinType: "fish" }),
  summary("huhn", { proteinType: "poultry" }),
  summary("steak", { proteinType: "red_meat" }),
  summary("salat", { category: "beilage" }),
  summary("kuchen", { category: "kuchen" }),
  summary("brot", { proteinType: null }),
];
const recipeOf = (id: string) => recipes.find((recipe) => recipe.id === id);
const pick = (...ids: string[]) => ids.map((id) => recipeOf(id)!);

let day = 12;
const cooked = (...ids: string[]): PlanSlot => ({
  id: `slot-${day}`,
  date: `2026-10-${day++}`,
  meal: "lunch",
  kind: "recipes",
  items: ids.map((recipeId) => ({ recipeId, servings: 4 })),
});
const counts = (slots: PlanSlot[]) =>
  Object.fromEntries(weekBalance(slots, recipeOf).map((line) => [line.group, line.count]));

describe("mealGroup", () => {
  it("counts a meal by its meat, fish or lack of both", () => {
    expect(mealGroup(pick("lasagne"))).toBe("vegetarian");
    expect(mealGroup(pick("curry"))).toBe("vegetarian");
    expect(mealGroup(pick("lachs"))).toBe("fish");
    expect(mealGroup(pick("steak", "salat"))).toBe("red_meat");
    expect(mealGroup(pick("lasagne", "huhn"))).toBe("poultry");
  });

  it("does not count a cake or a side dish as a meal", () => {
    expect(mealGroup(pick("kuchen"))).toBeNull();
    expect(mealGroup(pick("salat"))).toBeNull();
    expect(mealGroup(pick("brot"))).toBeNull();
  });
});

describe("weekBalance", () => {
  it("counts the cooked meals of the week per group", () => {
    const slots: PlanSlot[] = [
      cooked("lasagne"),
      cooked("curry"),
      cooked("steak", "salat"),
      cooked("lachs"),
      cooked("kuchen"),
      { id: "v", date: "2026-10-12", meal: "dinner", kind: "free_text", label: "Vesper" },
      { id: "r", date: "2026-10-13", meal: "dinner", kind: "leftovers", ofSlotId: null },
    ];
    expect(counts(slots)).toEqual({ vegetarian: 2, fish: 1, poultry: 0, red_meat: 1 });
  });

  it("carries what the household aims for", () => {
    const [vegetarian, fish, poultry, redMeat] = weekBalance([], recipeOf);
    expect(vegetarian).toEqual({ group: "vegetarian", count: 0, min: 3, max: null });
    expect(missing(vegetarian)).toBe(3);
    expect(missing(fish)).toBe(1);
    expect(missing(poultry)).toBe(0);
    expect(isFull(redMeat)).toBe(false);
  });

  it("knows when a group is reached or used up", () => {
    const targets = { ...DEFAULT_TARGETS, red_meat: { min: null, max: 1 } };
    const balance = weekBalance([cooked("steak"), cooked("lachs")], recipeOf, targets);
    const line = (group: string) => balance.find((entry) => entry.group === group)!;
    expect(isFull(line("red_meat"))).toBe(true);
    expect(missing(line("fish"))).toBe(0);
    expect(isFull(line("fish"))).toBe(false);
  });

  it("adds a meal without changing what it was given", () => {
    const before = weekBalance([], recipeOf);
    const after = withMeal(before, "fish");
    expect(after.find((line) => line.group === "fish")?.count).toBe(1);
    expect(before.find((line) => line.group === "fish")?.count).toBe(0);
    expect(withMeal(before, null)).toEqual(before);
  });
});
