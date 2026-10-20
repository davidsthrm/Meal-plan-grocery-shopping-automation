import { describe, expect, it } from "vitest";
import { asSide, foodText, readFood, SIDE_FOODS } from "./vesper";

describe("readFood", () => {
  it("reads a number in front as how many", () => {
    expect(readFood("2 Baguettes")).toEqual({ label: "Baguettes", quantity: 2 });
    expect(readFood("8x Brötchen")).toEqual({ label: "Brötchen", quantity: 8 });
    expect(readFood("  1   Dinkelbaguette ")).toEqual({ label: "Dinkelbaguette", quantity: 1 });
  });

  it("keeps a name without a number as a name", () => {
    expect(readFood("Obatzter")).toEqual({ label: "Obatzter", quantity: null });
    expect(readFood("7-Korn-Brot")).toEqual({ label: "7-Korn-Brot", quantity: null });
    expect(readFood("0 Brot")).toEqual({ label: "0 Brot", quantity: null });
  });
});

describe("foodText", () => {
  it("says how many where that is known", () => {
    expect(foodText({ label: "Dinkelbaguette", quantity: 1 })).toBe("1 Dinkelbaguette");
    expect(foodText({ label: "Brot" })).toBe("Brot");
  });

  it("offers one baguette with a tap, and rolls without a number", () => {
    expect(SIDE_FOODS.find((food) => food.label === "Dinkelbaguette")?.quantity).toBe(1);
    expect(SIDE_FOODS.find((food) => food.label === "Brötchen")?.quantity).toBeUndefined();
  });
});

describe("asSide", () => {
  it("counts a side that is one of something as one, also without a stored number", () => {
    expect(asSide({ label: "Dinkelbaguette", quantity: null })).toEqual({
      label: "Dinkelbaguette",
      quantity: 1,
    });
    expect(asSide({ label: "dinkelbaguette", quantity: null }).quantity).toBe(1);
    // A number someone gave stays, and rolls or anything typed have none.
    expect(asSide({ label: "Baguette", quantity: 2 }).quantity).toBe(2);
    expect(asSide({ label: "Brötchen", quantity: null }).quantity).toBeNull();
    expect(asSide({ label: "Obatzter", quantity: null }).quantity).toBeNull();
  });
});
