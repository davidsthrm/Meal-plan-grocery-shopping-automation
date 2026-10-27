import { describe, expect, it } from "vitest";
import { formatAmount, formatLine, formatNumber, formatPurchase, labelFor } from "./format";

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
  it("writes pieces and packs as a multiplier, everything else with its unit", () => {
    expect(formatPurchase({ quantity: 12, unit: "Stück" })).toBe("12x");
    expect(formatPurchase({ quantity: 200, unit: "ml" })).toBe("200 ml");
    expect(formatPurchase({ quantity: 2, unit: "Packung" })).toBe("2x");
    expect(formatPurchase({ quantity: 600, unit: "g" })).toBe("600 g");
    expect(formatPurchase({ quantity: 1, unit: "Bund" })).toBe("1 Bund");
  });
});

describe("formatLine", () => {
  it("puts the amount in front of the name and the note behind it", () => {
    expect(formatLine("Karotten", { quantity: 2, unit: "Stück" }, null)).toBe("2x Karotten");
    expect(formatLine("Schalotte", { quantity: 1, unit: "Stück" }, null)).toBe("1x Schalotte");
    expect(formatLine("Crème fraîche", { quantity: 200, unit: "g" }, null)).toBe(
      "200 g Crème fraîche",
    );
    expect(formatLine("Leberkäse", { quantity: 600, unit: "g" }, null)).toBe("600 g Leberkäse");
    expect(formatLine("Garnelen", { quantity: 2, unit: "Packung" }, null)).toBe("2x Garnelen");
    expect(formatLine("Milch", null, "WS 1.29")).toBe("Milch WS 1.29");
    expect(formatLine("Feldsalat", null, null)).toBe("Feldsalat");
  });

  it("writes a tin as so many tins, and a name that says its unit without it", () => {
    expect(formatPurchase({ quantity: 2, unit: "Dose" })).toBe("2x Dose");
    expect(formatLine("Mais (Dose)", { quantity: 1, unit: "Dose" }, null)).toBe("1x Dose Mais");
    expect(formatLine("Kichererbsen", { quantity: 2, unit: "Dose" }, null)).toBe(
      "2x Dose Kichererbsen",
    );
    // Bought by weight, the name keeps what it says.
    expect(formatLine("Mais (Dose)", { quantity: 140, unit: "g" }, null)).toBe("140 g Mais (Dose)");
    expect(formatLine("Spinat (TK)", { quantity: 600, unit: "g" }, null)).toBe("600 g Spinat (TK)");
  });
});

describe("labelFor", () => {
  const forms = { one: "Schalotte", many: "Schalotten" };

  it("takes the singular for one piece only", () => {
    expect(labelFor(forms, "Schalotten", { quantity: 1, unit: "Stück" })).toBe("Schalotte");
    expect(labelFor(forms, "Schalotte", { quantity: 2, unit: "Stück" })).toBe("Schalotten");
    expect(labelFor(forms, "Schalotte", { quantity: 1, unit: "Packung" })).toBe("Schalotten");
    expect(labelFor(forms, "Schalotte", null)).toBe("Schalotten");
  });

  it("keeps the label of a line the catalog does not know", () => {
    expect(labelFor(null, "Geschenkpapier", { quantity: 1, unit: "Stück" })).toBe("Geschenkpapier");
  });
});
