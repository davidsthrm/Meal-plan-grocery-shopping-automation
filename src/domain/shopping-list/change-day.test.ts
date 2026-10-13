import { describe, expect, it } from "vitest";
import type { PlanSlot } from "../plan";
import type { Recipe } from "../recipe";
import { buildShoppingList } from "./build";
import { dayProblems } from "./change-day";
import { line, testIndex } from "./test-catalog";
import { DEFAULT_SHOPPING_DAYS, tripsBetween } from "./trips";

const TODAY = "2026-10-08";
const SATURDAY = "2026-10-10";
const SUNDAY = "2026-10-11";
const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const WEDNESDAY = "2026-10-14";

const recipe: Recipe = {
  id: "essen",
  title: "Essen",
  kind: "cookbook",
  servings: { min: 4, max: 4, unit: null },
  // Carrots keep, steaks keep two days, cream comes in packs.
  ingredients: [line("karotten", 2, "Stück"), line("steak", 4, "Stück"), line("sahne", 200, "ml")],
};
const slot = (date: string): PlanSlot => ({
  id: date,
  date,
  meal: "lunch",
  kind: "recipes",
  items: [{ recipeId: "essen", servings: 4 }],
});
const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-10-01", "2026-10-25");
const notes = buildShoppingList({
  index: testIndex,
  recipes: [recipe],
  slots: [slot(MONDAY), slot(WEDNESDAY)],
  trips,
  manualEntries: [{ id: "x", text: "Geschenkpapier", shoppingDate: MONDAY, place: "supermarket" }],
});
const monday = notes.filter(
  (entry) => entry.shoppingDate === MONDAY && entry.place === "supermarket",
);
const check = (target: string) => dayProblems(monday, target, TODAY, testIndex);

describe("dayProblems", () => {
  it("finds nothing wrong with a day everything is bought in time and keeps from", () => {
    // Monday's note holds cream for Monday and Wednesday, and carrots and steaks for Wednesday.
    expect(monday.map((entry) => entry.key).sort()).toEqual([
      "karotten@main",
      "manual:x",
      "sahne@main",
      "steak@main",
    ]);
    expect(check(MONDAY)).toEqual([]);
  });

  it("says what is needed before a later day", () => {
    expect(check(TUESDAY)).toEqual([{ kind: "too-late", label: "Sahne", neededOn: MONDAY }]);
  });

  it("says what would not keep from an earlier day", () => {
    expect(check(SUNDAY)).toEqual([
      { kind: "does-not-keep", label: "Rindersteaks", neededOn: WEDNESDAY, shelfLifeDays: 2 },
    ]);
    expect(check(SATURDAY)).toHaveLength(1);
  });

  it("does not look further at a day that is over", () => {
    expect(dayProblems(monday, "2026-10-07", TODAY, testIndex)).toEqual([{ kind: "past" }]);
  });

  it("lets what belongs to no meal be bought on any day", () => {
    const paper = monday.filter((entry) => entry.key === "manual:x");
    expect(dayProblems(paper, "2026-10-20", TODAY, testIndex)).toEqual([]);
  });

  it("is not held up by what is bought shortly before its meal anyway", () => {
    const later = monday.map((entry) => ({ ...entry, trip: "later" as const }));
    expect(dayProblems(later, TUESDAY, TODAY, testIndex)).toEqual([]);
  });
});
