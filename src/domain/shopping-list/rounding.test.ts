import { describe, expect, it } from "vitest";
import type { Ingredient } from "../catalog";
import { naturalStep, packsFor, purchaseFor, roundUpTo } from "./rounding";

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
  it("shows what is needed of an ingredient without a buying unit, rounded to read well", () => {
    expect(purchaseFor({ ...base, buyingMode: "none" }, 300)).toEqual({ quantity: 300, unit: "g" });
    expect(purchaseFor({ ...base, buyingMode: "none" }, 137.5)).toEqual({
      quantity: 140,
      unit: "g",
    });
    const shallots: Ingredient = { ...base, defaultUnit: "Stück", buyingMode: "none" };
    expect(purchaseFor(shallots, 0.5)).toEqual({ quantity: 1, unit: "Stück" });
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

  it("rounds spoons and pinches to whole ones, not like grams", () => {
    // 6 EL Limettensaft stood on the note as "10 EL" (November 2026).
    const lime: Ingredient = { ...base, defaultUnit: "EL", buyingMode: "none" };
    expect(purchaseFor(lime, 2)).toEqual({ quantity: 2, unit: "EL" });
    expect(purchaseFor(lime, 6)).toEqual({ quantity: 6, unit: "EL" });
    expect(purchaseFor({ ...lime, defaultUnit: "TL" }, 2.5)).toEqual({ quantity: 3, unit: "TL" });
    expect(purchaseFor({ ...lime, defaultUnit: "Prise" }, 0.5)).toEqual({
      quantity: 1,
      unit: "Prise",
    });
  });

  it("rounds litres and kilos as their millilitres and grams", () => {
    // 150 ml Haferdrink stood on the note as "5 l".
    const oatDrink: Ingredient = { ...base, defaultUnit: "l", buyingMode: "pack", packSize: 1 };
    expect(purchaseFor(oatDrink, 0.15)).toEqual({ quantity: 0.15, unit: "l" });
    expect(purchaseFor(oatDrink, 0.123)).toEqual({ quantity: 0.13, unit: "l" });
    expect(purchaseFor(oatDrink, 1.234)).toEqual({ quantity: 1.25, unit: "l" });
    const kilos: Ingredient = { ...base, defaultUnit: "kg", buyingMode: "none" };
    expect(purchaseFor(kilos, 0.1)).toEqual({ quantity: 0.1, unit: "kg" });
  });

  it("shows the amount of what comes in packs, not the packs", () => {
    const cream: Ingredient = { ...base, defaultUnit: "ml", buyingMode: "pack", packSize: 200 };
    expect(purchaseFor(cream, 150)).toEqual({ quantity: 150, unit: "ml" });
    expect(purchaseFor(cream, 250)).toEqual({ quantity: 250, unit: "ml" });
  });
});

describe("packsFor", () => {
  const cream: Ingredient = { ...base, defaultUnit: "ml", buyingMode: "pack", packSize: 200 };

  it("counts the packs an amount takes, at least one", () => {
    expect(packsFor(cream, 150)).toBe(1);
    expect(packsFor(cream, 200)).toBe(1);
    expect(packsFor(cream, 250)).toBe(2);
    expect(packsFor(cream, 0)).toBe(1);
  });

  it("is null for what is not bought in packs", () => {
    expect(packsFor({ ...base, buyingMode: "weight" }, 100)).toBeNull();
  });

  it("rejects a pack ingredient without a pack size", () => {
    expect(() => packsFor({ ...base, buyingMode: "pack" }, 100)).toThrow(/no pack size/);
  });
});

describe("naturalStep", () => {
  it("rounds little finely and much coarser, counted units to whole pieces", () => {
    expect(naturalStep(40, "g")).toBe(5);
    expect(naturalStep(437, "ml")).toBe(10);
    expect(naturalStep(1234, "ml")).toBe(50);
    expect(naturalStep(3, "Bund")).toBe(1);
  });

  it("steps grams and millilitres only, litres and kilos in them, any other unit whole", () => {
    expect(naturalStep(0.15, "l")).toBe(0.01);
    expect(naturalStep(0.08, "kg")).toBe(0.005);
    expect(naturalStep(2, "EL")).toBe(1);
    expect(naturalStep(2, "TL")).toBe(1);
    expect(naturalStep(2, "Handvoll")).toBe(1);
  });
});
