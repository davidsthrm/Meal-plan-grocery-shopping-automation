import { describe, expect, it } from "vitest";
import { baseUnitOf, convert, dimensionOf, isUnit, parseUnit, tidy } from "./units";

describe("convert", () => {
  it("converts within mass and within volume", () => {
    expect(convert(1.5, "kg", "g")).toBe(1500);
    expect(convert(250, "g", "kg")).toBe(0.25);
    expect(convert(0.75, "l", "ml")).toBe(750);
    expect(convert(3, "EL", "ml")).toBe(45);
    expect(convert(2, "TL", "ml")).toBe(10);
    expect(convert(1, "EL", "TL")).toBe(3);
  });

  it("returns the quantity unchanged for the same unit", () => {
    expect(convert(2, "Bund", "Bund")).toBe(2);
  });

  it("does not convert between mass and volume without a density", () => {
    expect(convert(100, "ml", "g")).toBeNull();
    expect(convert(100, "g", "ml")).toBeNull();
  });

  it("converts between mass and volume with a density", () => {
    expect(convert(200, "ml", "g", { ml: 1.03 })).toBeCloseTo(206);
    expect(convert(2, "EL", "g", { ml: 0.9 })).toBeCloseTo(27);
    expect(convert(90, "g", "EL", { ml: 0.9 })).toBeCloseTo(6.667, 3);
  });

  it("converts counted units only through the ingredient's grams per unit", () => {
    expect(convert(2, "Stück", "g")).toBeNull();
    expect(convert(2, "Stück", "g", { Stück: 100 })).toBe(200);
    expect(convert(300, "g", "Stück", { Stück: 100 })).toBe(3);
    expect(convert(1, "Knolle", "Zehe", { Knolle: 50, Zehe: 5 })).toBe(10);
  });

  it("does not convert between two different counted units without data for both", () => {
    expect(convert(1, "Bund", "Stück", { Stück: 15 })).toBeNull();
    expect(convert(1, "Dose", "Glas")).toBeNull();
  });
});

describe("dimensions", () => {
  it("groups units into mass, volume and one dimension per counted unit", () => {
    expect(dimensionOf("kg")).toBe("mass");
    expect(dimensionOf("EL")).toBe("volume");
    expect(dimensionOf("Bund")).toBe("Bund");
    expect(baseUnitOf("mass")).toBe("g");
    expect(baseUnitOf("volume")).toBe("ml");
    expect(baseUnitOf("Dose")).toBe("Dose");
  });
});

describe("parseUnit", () => {
  it("reads units as people write them", () => {
    expect(parseUnit("El")).toBe("EL");
    expect(parseUnit("TL")).toBe("TL");
    expect(parseUnit("Dosen")).toBe("Dose");
    expect(parseUnit("Pck.")).toBe("Packung");
    expect(parseUnit("x")).toBe("Packung");
    expect(parseUnit("Gläser")).toBe("Glas");
    expect(parseUnit("kg")).toBe("kg");
    // A stalk is a Stängel, however the cookbook prints it.
    for (const stalk of ["Stiel", "Stiele", "Stielen", "Stängel", "Stengeln"]) {
      expect(parseUnit(stalk)).toBe("Stängel");
    }
  });

  it("returns null for words that are not units", () => {
    expect(parseUnit("Tomaten")).toBeNull();
    expect(parseUnit("")).toBeNull();
  });
});

describe("helpers", () => {
  it("recognises allowed units", () => {
    expect(isUnit("Stängel")).toBe(true);
    expect(isUnit("cup")).toBe(false);
  });

  it("removes floating point noise", () => {
    expect(tidy(0.1 + 0.2)).toBe(0.3);
  });
});
