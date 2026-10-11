import { describe, expect, it } from "vitest";
import type { Ingredient } from "../catalog";
import { purchaseFor, roundUpTo } from "./rounding";

const base: Ingredient = {
  id: "x",
  name: "X",
  synonyms: [],
  aisleGroupId: "a",
  preferredShopId: "s",
  preferredBrand: null,
  defaultUnit: "g",
  buyingMode: "none",
  packSize: null,
  roundingStep: null,
  gramsPer: {},
  isPantryStaple: false,
  shelfLifeDays: null,
};

describe("roundUpTo", () => {
  it("rounds up to the next multiple", () => {
    expect(roundUpTo(1.2, 1)).toBe(2);
    expect(roundUpTo(12, 10)).toBe(20);
    expect(roundUpTo(20, 10)).toBe(20);
    expect(roundUpTo(430, 50)).toBe(450);
  });

  it("does not round up because of floating point noise", () => {
    expect(roundUpTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundUpTo(3 * 1.1, 1.1)).toBe(3.3);
  });
});

describe("purchaseFor", () => {
  it("shows nothing for ingredients that need no quantity", () => {
    expect(purchaseFor({ ...base, buyingMode: "none" }, 300)).toBeNull();
  });

  it("rounds counts up to whole pieces", () => {
    const carrots: Ingredient = { ...base, defaultUnit: "Stück", buyingMode: "count" };
    expect(purchaseFor(carrots, 2)).toEqual({ quantity: 2, unit: "Stück" });
    expect(purchaseFor(carrots, 2.5)).toEqual({ quantity: 3, unit: "Stück" });
  });

  it("rounds eggs up to full boxes of ten", () => {
    const eggs: Ingredient = {
      ...base,
      defaultUnit: "Stück",
      buyingMode: "count",
      roundingStep: 10,
    };
    expect(purchaseFor(eggs, 13)).toEqual({ quantity: 20, unit: "Stück" });
  });

  it("rounds weights up to the ingredient's step", () => {
    const meat: Ingredient = { ...base, buyingMode: "weight", roundingStep: 50 };
    expect(purchaseFor(meat, 600)).toEqual({ quantity: 600, unit: "g" });
    expect(purchaseFor(meat, 610)).toEqual({ quantity: 650, unit: "g" });
  });

  it("shows a pack multiplier only for more than one pack", () => {
    const cream: Ingredient = { ...base, defaultUnit: "ml", buyingMode: "pack", packSize: 200 };
    expect(purchaseFor(cream, 150)).toBeNull();
    expect(purchaseFor(cream, 200)).toBeNull();
    expect(purchaseFor(cream, 250)).toEqual({ quantity: 2, unit: "Packung" });
  });

  it("rejects a pack ingredient without a pack size", () => {
    expect(() => purchaseFor({ ...base, buyingMode: "pack" }, 100)).toThrow(/no pack size/);
  });
});
