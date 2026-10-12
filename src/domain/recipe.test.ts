import { describe, expect, it } from "vitest";
import { plannedServings, scaleFactor, shoppingAmount } from "./recipe";
import { line } from "./shopping-list/test-catalog";

describe("scaleFactor", () => {
  it("scales by servings over base servings", () => {
    expect(scaleFactor({ min: 2, max: 2, unit: null }, 4)).toBe(2);
    expect(scaleFactor({ min: 4, max: 4, unit: null }, 2)).toBe(0.5);
    expect(scaleFactor({ min: 4, max: 4, unit: null }, 4)).toBe(1);
  });

  it("cooks as written when the servings fall inside the printed range", () => {
    expect(scaleFactor({ min: 4, max: 6, unit: null }, 4)).toBe(1);
    expect(scaleFactor({ min: 4, max: 6, unit: null }, 5)).toBe(1);
    expect(scaleFactor({ min: 4, max: 6, unit: null }, 6)).toBe(1);
  });

  it("scales from the nearer end outside the range", () => {
    expect(scaleFactor({ min: 4, max: 6, unit: null }, 2)).toBe(0.5);
    expect(scaleFactor({ min: 4, max: 6, unit: null }, 9)).toBe(1.5);
  });

  it("rejects servings that are not positive", () => {
    expect(() => scaleFactor({ min: 4, max: 4, unit: null }, 0)).toThrow(/positive/);
  });
});

describe("plannedServings", () => {
  it("plans a recipe for persons for the household", () => {
    expect(plannedServings({ min: 2, max: 2, unit: null }, 4)).toBe(4);
    expect(plannedServings({ min: 4, max: 6, unit: null }, 4)).toBe(4);
  });

  it("plans a recipe that counts what it makes as written", () => {
    const cake = { min: 1, max: 1, unit: "Springform (Ø 26 cm)" };
    expect(plannedServings(cake, 4)).toBe(1);
    expect(scaleFactor(cake, plannedServings(cake, 4))).toBe(1);
    const waffles = { min: 6, max: 8, unit: "Waffeln" };
    expect(scaleFactor(waffles, plannedServings(waffles, 4))).toBe(1);
  });

  it("still scales such a recipe when someone asks for more", () => {
    expect(scaleFactor({ min: 1, max: 1, unit: "Blech" }, 2)).toBe(2);
    expect(scaleFactor({ min: 12, max: 12, unit: "Muffins" }, 6)).toBe(0.5);
  });
});

describe("shoppingAmount", () => {
  it("returns null for a line without a quantity", () => {
    expect(shoppingAmount(line("salz", null, null), "g", {})).toBeNull();
  });

  it("uses the upper bound of a range", () => {
    const springOnions = line("x", 2, "Stück", { quantityMax: 3 });
    expect(shoppingAmount(springOnions, "Stück", {})).toEqual({ quantity: 3, unit: "Stück" });
  });

  it("uses the second measure when only that one converts and its scope is known", () => {
    const steaks = line("x", 4, "Stück", {
      secondary: { quantity: 150, unit: "g", scope: "perPiece" },
    });
    expect(shoppingAmount(steaks, "g", {})).toEqual({ quantity: 600, unit: "g" });
    const bags = line("x", 2, "Beutel", {
      secondary: { quantity: 125, unit: "g", scope: "total" },
    });
    expect(shoppingAmount(bags, "g", {})).toEqual({ quantity: 125, unit: "g" });
  });

  it("never uses a second measure whose scope is not stated", () => {
    const potatoes = line("x", 2, "Stück", {
      secondary: { quantity: 200, unit: "g", scope: null },
    });
    expect(shoppingAmount(potatoes, "g", {})).toEqual({ quantity: 2, unit: "Stück" });
  });

  it("prefers the main measure when it converts", () => {
    const steaks = line("x", 4, "Stück", {
      secondary: { quantity: 150, unit: "g", scope: "perPiece" },
    });
    expect(shoppingAmount(steaks, "Stück", {})).toEqual({ quantity: 4, unit: "Stück" });
  });
});
