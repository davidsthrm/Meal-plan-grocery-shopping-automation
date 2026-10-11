import { describe, expect, it } from "vitest";
import { parseFreeEntry } from "./free-entry";
import { testIndex } from "./test-catalog";

describe("parseFreeEntry", () => {
  it("matches a plain ingredient name", () => {
    expect(parseFreeEntry("Butter", testIndex)).toMatchObject({
      ingredient: { id: "butter" },
      label: "Butter",
      amount: null,
      note: null,
    });
  });

  it("keeps what follows the ingredient as a note", () => {
    expect(parseFreeEntry("Milch WS 1.29", testIndex)).toMatchObject({
      ingredient: { id: "milch" },
      amount: null,
      note: "WS 1.29",
    });
  });

  it("reads a leading count, weight or pack multiplier", () => {
    expect(parseFreeEntry("12 Tomaten", testIndex)).toMatchObject({
      ingredient: { id: "tomaten" },
      amount: { quantity: 12, unit: "Stück" },
    });
    expect(parseFreeEntry("600 g Leberkäse", testIndex)).toMatchObject({
      ingredient: { id: "leberkaese" },
      amount: { quantity: 600, unit: "g" },
    });
    expect(parseFreeEntry("600g Leberkäse", testIndex).amount).toEqual({
      quantity: 600,
      unit: "g",
    });
    expect(parseFreeEntry("2x Garnelen", testIndex)).toMatchObject({
      ingredient: { id: "garnelen" },
      amount: { quantity: 2, unit: "Packung" },
    });
    expect(parseFreeEntry("1,5 l Milch", testIndex).amount).toEqual({ quantity: 1.5, unit: "l" });
  });

  it("understands abbreviations and synonyms", () => {
    expect(parseFreeEntry("kl. Tomaten", testIndex)).toMatchObject({
      ingredient: { id: "kleine-tomaten" },
      label: "kleine Tomaten",
      note: null,
    });
    expect(parseFreeEntry("Sahne frisch", testIndex).ingredient?.id).toBe("sahne");
  });

  it("prefers the longest name that matches", () => {
    // "kleine Tomaten" is its own product, not "Tomaten" with a note.
    expect(parseFreeEntry("kleine Tomaten bio", testIndex)).toMatchObject({
      ingredient: { id: "kleine-tomaten" },
      note: "bio",
    });
  });

  it("keeps unknown text exactly as typed", () => {
    expect(parseFreeEntry("  2 Dosen   Katzenfutter ", testIndex)).toEqual({
      ingredient: null,
      label: "2 Dosen Katzenfutter",
      amount: null,
      note: null,
    });
    expect(parseFreeEntry("Geschenkpapier", testIndex).label).toBe("Geschenkpapier");
  });

  it("does not mistake a lone number for a quantity", () => {
    expect(parseFreeEntry("7", testIndex)).toEqual({
      ingredient: null,
      label: "7",
      amount: null,
      note: null,
    });
  });
});
