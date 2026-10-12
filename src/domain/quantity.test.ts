import { describe, expect, it } from "vitest";
import { parseQuantity, quantityText } from "./quantity";

describe("parseQuantity", () => {
  it("reads whole numbers and decimals with comma or point", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("0,5")).toBe(0.5);
    expect(parseQuantity("1.25")).toBe(1.25);
    expect(parseQuantity("  300 ")).toBe(300);
  });

  it("reads fractions the way recipes print them", () => {
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("3½")).toBe(3.5);
    expect(parseQuantity("1 ¼")).toBe(1.25);
  });

  it("tells an empty field from text that is not a quantity", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("   ")).toBeNull();
    expect(parseQuantity("etwas")).toBeUndefined();
    expect(parseQuantity("2-3")).toBeUndefined();
    expect(parseQuantity("1/0")).toBeUndefined();
  });
});

describe("quantityText", () => {
  it("writes a quantity for a form field", () => {
    expect(quantityText(null)).toBe("");
    expect(quantityText(0.5)).toBe("0,5");
    expect(quantityText(3)).toBe("3");
    expect(quantityText(1 / 3)).toBe("0,333");
  });
});
