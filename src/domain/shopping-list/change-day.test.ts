import { describe, expect, it } from "vitest";
import type { PlanSlot } from "../plan";
import type { Recipe } from "../recipe";
import { buildShoppingList } from "./build";
import { dayProblems, moveProblems, moveTargets } from "./change-day";
import { line, testIndex } from "./test-catalog";
import { DEFAULT_SHOPPING_DAYS, tripsBetween, type ShoppingTrip } from "./trips";

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
  meal: "dinner",
  kind: "recipes",
  items: [{ recipeId: "essen", servings: 4 }],
});
const trips = tripsBetween(DEFAULT_SHOPPING_DAYS, "2026-10-01", "2026-10-25");
const notes = buildShoppingList({
  index: testIndex,
  recipes: [recipe],
  slots: [slot(MONDAY), slot(WEDNESDAY)],
  trips,
  // A household that buys its meat at the supermarket, so that something perishable is on
  // the note whose day is changed.
  onDemand: [],
  manualEntries: [{ id: "x", text: "Geschenkpapier", shoppingDate: MONDAY, place: "supermarket" }],
});
const monday = notes.filter(
  (entry) => entry.shoppingDate === MONDAY && entry.place === "supermarket",
);
const shop = (date: string): ShoppingTrip => ({ date, place: "supermarket" });
const check = (target: string) => dayProblems(monday, shop(target), TODAY, testIndex);

describe("dayProblems", () => {
  it("counts an extra for a day like a meal on it", () => {
    const cake: Recipe = { ...recipe, id: "kuchen", ingredients: [line("sahne", 200, "ml")] };
    const lines = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [],
      extras: [{ recipeId: "kuchen", servings: 4, note: null, date: TUESDAY }],
      trips,
      onDemand: [],
    });
    expect(dayProblems(lines, shop(WEDNESDAY), TODAY, testIndex)).toEqual([
      { kind: "too-late", label: "Sahne", neededOn: TUESDAY, lunch: false },
    ]);
    // Without a day it belongs to no meal and goes with any errand.
    const undated = buildShoppingList({
      index: testIndex,
      recipes: [cake],
      slots: [],
      extras: [{ recipeId: "kuchen", servings: 4, note: null }],
      trips,
      onDemand: [],
    });
    expect(dayProblems(undated, shop(WEDNESDAY), TODAY, testIndex)).toEqual([]);
  });

  it("finds nothing wrong with a day everything is bought in time and keeps from", () => {
    // Monday's note holds cream and steaks for Monday and Wednesday, and carrots for Wednesday.
    expect(monday.map((entry) => entry.key).sort()).toEqual([
      "karotten@main",
      "manual:x",
      "sahne@main",
      "steak@main",
    ]);
    expect(check(MONDAY)).toEqual([]);
  });

  it("says what is needed before a later day", () => {
    expect(check(TUESDAY)).toEqual(
      expect.arrayContaining([
        { kind: "too-late", label: "Sahne", neededOn: MONDAY, lunch: false },
        { kind: "too-late", label: "Rindersteaks", neededOn: MONDAY, lunch: false },
      ]),
    );
    expect(check(TUESDAY)).toHaveLength(2);
  });

  it("says what would not keep from an earlier day", () => {
    expect(check(SUNDAY)).toEqual([
      { kind: "does-not-keep", label: "Rindersteaks", neededOn: WEDNESDAY, shelfLifeDays: 2 },
    ]);
    expect(check(SATURDAY)).toHaveLength(1);
  });

  it("does not look further at a day that is over", () => {
    expect(dayProblems(monday, shop("2026-10-07"), TODAY, testIndex)).toEqual([{ kind: "past" }]);
  });

  it("lets what belongs to no meal be bought on any day", () => {
    const paper = monday.filter((entry) => entry.key === "manual:x");
    expect(dayProblems(paper, shop("2026-10-20"), TODAY, testIndex)).toEqual([]);
  });

  it("is not held up by what is bought shortly before its meal anyway", () => {
    const later = monday.map((entry) => ({ ...entry, trip: "later" as const }));
    expect(dayProblems(later, shop(TUESDAY), TODAY, testIndex)).toEqual([]);
  });
});

describe("the butcher's note", () => {
  const THURSDAY = "2026-10-15";
  // Steaks keep two days; the butcher on Monday buys them for Thursday all the same.
  const steaks = buildShoppingList({
    index: testIndex,
    recipes: [{ ...recipe, ingredients: [line("steak", 4, "Stück")] }],
    slots: [slot(THURSDAY)],
    trips,
    butcherDays: [1, 5, 6],
  });
  const butcher = (date: string): ShoppingTrip => ({ date, place: "butcher" });

  it("buys for the days a visit reaches, whatever the meat's shelf life", () => {
    expect(steaks.map((entry) => `${entry.shoppingDate}.${entry.place}`)).toEqual([
      `${MONDAY}.butcher`,
    ]);
    expect(dayProblems(steaks, butcher(TUESDAY), TODAY, testIndex)).toEqual([]);
    expect(dayProblems(steaks, butcher(MONDAY), TODAY, testIndex)).toEqual([]);
  });

  it("does not reach further than a visit does", () => {
    expect(dayProblems(steaks, butcher(SUNDAY), TODAY, testIndex)).toEqual([
      { kind: "does-not-keep", label: "Rindersteaks", neededOn: THURSDAY, shelfLifeDays: 3 },
    ]);
  });

  it("asks the shelf life again where the meat would come from the supermarket", () => {
    expect(moveProblems(steaks[0], shop(MONDAY), TODAY, testIndex)).toEqual([
      { kind: "does-not-keep", label: "Rindersteaks", neededOn: THURSDAY, shelfLifeDays: 2 },
    ]);
  });
});

describe("a lunch on a working day", () => {
  const lunch = buildShoppingList({
    index: testIndex,
    recipes: [{ ...recipe, ingredients: [line("sahne", 200, "ml")] }],
    slots: [{ ...slot(WEDNESDAY), meal: "lunch" }],
    trips,
    onDemand: [],
  });

  it("is too late for an errand on its own day: the household shops in the afternoon", () => {
    expect(dayProblems(lunch, shop(WEDNESDAY), TODAY, testIndex)).toEqual([
      { kind: "too-late", label: "Sahne", neededOn: WEDNESDAY, lunch: true },
    ]);
    expect(dayProblems(lunch, shop(TUESDAY), TODAY, testIndex)).toEqual([]);
  });

  it("is in time on a Saturday, when the household shops in the morning", () => {
    const saturday = lunch.map((entry) => ({
      ...entry,
      contributions: entry.contributions.map((part) => ({
        ...part,
        source: { ...part.source, date: "2026-10-17" } as typeof part.source,
      })),
    }));
    expect(dayProblems(saturday, shop("2026-10-17"), TODAY, testIndex)).toEqual([]);
  });
});

describe("moveProblems", () => {
  const cream = monday.find((entry) => entry.key === "sahne@main")!;
  const later = { ...cream, trip: "later" as const };

  it("asks of one line what a whole errand is asked", () => {
    expect(moveProblems(cream, shop(TUESDAY), TODAY, testIndex)).toEqual([
      { kind: "too-late", label: "Sahne", neededOn: MONDAY, lunch: false },
    ]);
    expect(moveProblems(cream, shop("2026-10-07"), TODAY, testIndex)).toEqual([{ kind: "past" }]);
  });

  it("does not put what is bought shortly before its meal on an errand after the meal", () => {
    expect(moveProblems(later, shop(TUESDAY), TODAY, testIndex)).toEqual([
      { kind: "too-late", label: "Sahne", neededOn: MONDAY, lunch: false },
    ]);
    // Bought shortly before anyway: how long it keeps is no question.
    expect(moveProblems(later, shop("2026-10-09"), TODAY, testIndex)).toEqual([]);
  });
});

describe("moveTargets", () => {
  const cream = monday.find((entry) => entry.key === "sahne@main")!;
  const notes: ShoppingTrip[] = [
    { date: SATURDAY, place: "market" },
    { date: SUNDAY, place: "bakery" },
    shop(MONDAY),
    { date: MONDAY, place: "drugstore" },
    shop("2026-10-16"),
  ];

  it("offers the other food notes where a line is in time and keeps", () => {
    expect(moveTargets(cream, shop(MONDAY), notes, TODAY, testIndex)).toEqual([
      { date: SATURDAY, place: "market" },
      { date: SUNDAY, place: "bakery" },
    ]);
  });

  it("offers nothing on the drugstore's note", () => {
    expect(
      moveTargets(cream, { date: MONDAY, place: "drugstore" }, notes, TODAY, testIndex),
    ).toEqual([]);
  });
});
