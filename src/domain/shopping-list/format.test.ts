import { describe, expect, it } from "vitest";
import { formatAmount, formatLine, formatNumber, formatPurchase } from "./format";

describe("formatNumber", () => {
  it("uses a decimal comma and at most two decimals", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(1.5)).toBe("1,5");
    expect(formatNumber(0.333333)).toBe("0,33");
  });
});

describe("formatAmount", () => {
  it("writes the unit out and pluralises counted units", () => {
    expect(formatAmount({ quantity: 150, unit: "ml" })).toBe("150 ml");
    expect(formatAmount({ quantity: 2, unit: "Stück" })).toBe("2 Stück");
    expect(formatAmount({ quantity: 1, unit: "Dose" })).toBe("1 Dose");
    expect(formatAmount({ quantity: 2, unit: "Dose" })).toBe("2 Dosen");
    expect(formatAmount({ quantity: 3, unit: "EL" })).toBe("3 EL");
  });

  it("switches to kg and l from 1000 up", () => {
    expect(formatAmount({ quantity: 1250, unit: "ml" })).toBe("1,25 l");
    expect(formatAmount({ quantity: 2000, unit: "g" })).toBe("2 kg");
    expect(formatAmount({ quantity: 999, unit: "g" })).toBe("999 g");
  });
});

describe("formatPurchase", () => {
  it("writes pieces as a bare number and packs as a multiplier", () => {
    expect(formatPurchase({ quantity: 12, unit: "Stück" })).toBe("12");
    expect(formatPurchase({ quantity: 2, unit: "Packung" })).toBe("2x");
    expect(formatPurchase({ quantity: 600, unit: "g" })).toBe("600 g");
    expect(formatPurchase({ quantity: 1, unit: "Bund" })).toBe("1 Bund");
  });
});

describe("formatLine", () => {
  it("reads like the handwritten list", () => {
    expect(formatLine("Karotten", { quantity: 2, unit: "Stück" }, null)).toBe("2 Karotten");
    expect(formatLine("Leberkäse", { quantity: 600, unit: "g" }, null)).toBe("600 g Leberkäse");
    expect(formatLine("Garnelen", { quantity: 2, unit: "Packung" }, null)).toBe("2x Garnelen");
    expect(formatLine("Milch", null, "WS 1.29")).toBe("Milch WS 1.29");
    expect(formatLine("Feldsalat", null, null)).toBe("Feldsalat");
  });
});
