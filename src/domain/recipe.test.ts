import { describe, expect, it } from "vitest";
import { scaleFactor, shoppingAmount } from "./recipe";
import { line } from "./shopping-list/test-catalog";

describe("scaleFactor", () => {
  it("scales by servings over base servings", () => {
    expect(scaleFactor({ min: 2, max: 2 }, 4)).toBe(2);
    expect(scaleFactor({ min: 4, max: 4 }, 2)).toBe(0.5);
    expect(scaleFactor({ min: 4, max: 4 }, 4)).toBe(1);
  });

  it("cooks as written when the servings fall inside the printed range", () => {
    expect(scaleFactor({ min: 4, max: 6 }, 4)).toBe(1);
    expect(scaleFactor({ min: 4, max: 6 }, 5)).toBe(1);
    expect(scaleFactor({ min: 4, max: 6 }, 6)).toBe(1);
  });

  it("scales from the nearer end outside the range", () => {
    expect(scaleFactor({ min: 4, max: 6 }, 2)).toBe(0.5);
    expect(scaleFactor({ min: 4, max: 6 }, 9)).toBe(1.5);
  });

  it("rejects servings that are not positive", () => {
    expect(() => scaleFactor({ min: 4, max: 4 }, 0)).toThrow(/positive/);
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
