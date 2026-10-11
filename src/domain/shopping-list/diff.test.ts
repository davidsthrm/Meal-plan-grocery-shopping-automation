import { describe, expect, it } from "vitest";
import type { PlanSlot } from "../plan";
import type { Recipe } from "../recipe";
import { buildShoppingList } from "./build";
import { diffLines, orphanedStateKeys } from "./diff";
import { line, testIndex } from "./test-catalog";

const recipes: Recipe[] = [
  {
    id: "eintopf",
    title: "Eintopf",
    kind: "cookbook",
    servings: { min: 4, max: 4 },
    ingredients: [line("karotten", 2, "Stück"), line("sahne", 150, "ml")],
  },
  {
    id: "salat",
    title: "Salat",
    kind: "quick_meal",
    servings: { min: 4, max: 4 },
    ingredients: [
      line("karotten", 3, "Stück"),
      line("tomaten", 4, "Stück"),
      line("sahne", 40, "ml"),
    ],
  },
];

function listFor(recipeIds: string[]) {
  const slots: PlanSlot[] = recipeIds.map((recipeId, i) => ({
    id: `slot-${i}`,
    date: "2026-10-12",
    meal: i === 0 ? "lunch" : "dinner",
    kind: "recipes",
    items: [{ recipeId, servings: 4 }],
  }));
  return buildShoppingList({ index: testIndex, recipes, slots, shoppingDate: "2026-10-12" });
}

describe("diffLines", () => {
  it("reports nothing when the plan did not change", () => {
    expect(diffLines(listFor(["eintopf"]), listFor(["eintopf"]))).toEqual([]);
  });

  it("reports added lines and changed quantities when a meal is added", () => {
    const changes = diffLines(listFor(["eintopf"]), listFor(["eintopf", "salat"]));
    expect(changes.map((c) => c.type)).toEqual(["changed", "added"]);
    expect(changes[0]).toMatchObject({
      before: { key: "karotten@main", purchase: { quantity: 2 } },
      after: { key: "karotten@main", purchase: { quantity: 5 } },
    });
    expect(changes[1]).toMatchObject({ line: { key: "tomaten@main" } });
  });

  it("does not report a change that leaves the shown quantity as it was", () => {
    // 150 ml and 190 ml of cream are both one pack.
    const changes = diffLines(listFor(["eintopf"]), listFor(["eintopf", "salat"]));
    expect(changes.some((c) => c.type === "changed" && c.after.key === "sahne@main")).toBe(false);
  });

  it("reports removed lines when a meal is swapped", () => {
    const changes = diffLines(listFor(["salat"]), listFor(["eintopf"]));
    expect(changes).toMatchObject([
      { type: "changed", after: { key: "karotten@main", purchase: { quantity: 2 } } },
      { type: "removed", line: { key: "tomaten@main" } },
    ]);
  });
});

describe("orphanedStateKeys", () => {
  it("finds stored changes whose line is gone", () => {
    const states = { "tomaten@main": { checked: true }, "karotten@main": { note: "Bio" } };
    expect(orphanedStateKeys(states, listFor(["eintopf"]))).toEqual(["tomaten@main"]);
  });
});
