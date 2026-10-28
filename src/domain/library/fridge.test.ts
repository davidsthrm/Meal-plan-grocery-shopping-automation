import { describe, expect, it } from "vitest";
import { findFoods, foodCounts, fridgeMatches } from "./fridge";

// 0 Zucchini, 1 Feta, 2 Tomaten, 3 Eier, 4 Lachs, 5 Spinat
const NAMES = ["Zucchini", "Feta", "Tomaten", "Eier", "Lachs", "Spinat"];
const recipes = [
  { id: "pasta", uses: [0, 1, 2] },
  { id: "shakshuka", uses: [2, 3, 1] },
  { id: "lachs", uses: [4, 5] },
  { id: "ofengemuese", uses: [0, 1] },
];

describe("fridgeMatches", () => {
  it("puts the recipes using most of what is there first, then those lacking least", () => {
    const matches = fridgeMatches(recipes, new Set([0, 1]));
    expect(matches.map((m) => [m.recipe.id, m.have, m.missing])).toEqual([
      ["ofengemuese", [0, 1], []],
      ["pasta", [0, 1], [2]],
      ["shakshuka", [1], [2, 3]],
    ]);
  });

  it("finds nothing while nothing is tapped", () => {
    expect(fridgeMatches(recipes, new Set())).toEqual([]);
  });
});

describe("foodCounts", () => {
  it("counts each recipe once per food", () => {
    expect(foodCounts([...recipes, { id: "x", uses: [1, 1] }], NAMES.length)).toEqual([
      2, 4, 2, 1, 1, 1,
    ]);
  });
});

describe("findFoods", () => {
  it("finds foods by part of their name, those it starts with and used most first", () => {
    const counts = [2, 3, 2, 1, 1, 1];
    expect(findFoods(NAMES, counts, "s").map((food) => NAMES[food])).toEqual(["Spinat", "Lachs"]);
    expect(findFoods(NAMES, counts, "  ").length).toBe(0);
    expect(findFoods(["Möhren"], [1], "mohr")).toEqual([0]);
  });
});
