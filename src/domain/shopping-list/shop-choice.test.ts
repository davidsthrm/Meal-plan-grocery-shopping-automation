import { describe, expect, it } from "vitest";
import { placeSells, shopChoices, suggestShops } from "./shop-choice";
import { testIndex } from "./test-catalog";

// In the test catalog the butcher's own kind is "Fleisch & Wurst", fruit is the market's.
describe("placeSells", () => {
  it("keeps the bakery and the butcher to their own goods", () => {
    expect(placeSells("butcher", "fleisch", testIndex)).toBe(true);
    expect(placeSells("butcher", "obst", testIndex)).toBe(false);
    expect(placeSells("bakery", "obst", testIndex)).toBe(false);
    expect(placeSells("bakery", null, testIndex)).toBe(false);
  });

  it("lets the supermarket and the market sell anything", () => {
    expect(placeSells("supermarket", "obst", testIndex)).toBe(true);
    expect(placeSells("market", "molkerei", testIndex)).toBe(true);
  });
});

describe("suggestShops", () => {
  const choices = shopChoices(testIndex, []);
  const names = (list: { place: string }[]) => list.map((choice) => choice.place);

  it("offers no bakery and no butcher for a lemon, not even among all shops", () => {
    const { suggested, others } = suggestShops({ aisleGroupId: "obst" }, choices, [], testIndex);
    expect([...names(suggested), ...names(others)]).not.toContain("bakery");
    expect([...names(suggested), ...names(others)]).not.toContain("butcher");
    expect(names(suggested)).toContain("market");
  });

  it("still offers a bakery where the thing was bought before", () => {
    const bakery = choices.find((choice) => choice.place === "bakery")!;
    const { suggested } = suggestShops(
      { aisleGroupId: "obst" },
      choices,
      [{ choice: bakery.id, times: 1, lastAt: 0 }],
      testIndex,
    );
    expect(suggested[0]).toEqual(bakery);
  });
});
