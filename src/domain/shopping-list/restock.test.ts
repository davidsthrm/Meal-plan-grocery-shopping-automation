import { describe, expect, it } from "vitest";
import { freshPlaceOf, readRestock, restockTrip } from "./restock";
import { testIndex } from "./test-catalog";
import { DEFAULT_SHOPPING_DAYS, withDrugstore } from "./trips";

const TUESDAY = "2026-10-13";
const FRIDAY = "2026-10-16";
const SATURDAY = "2026-10-17";
const NEXT_MONDAY = "2026-10-19";

const errand = (text: string, today: string) =>
  restockTrip({ text, freshPlace: freshPlaceOf(text, testIndex) }, DEFAULT_SHOPPING_DAYS, today);

describe("readRestock", () => {
  it("tidies what was written", () => {
    expect(readRestock("  Spülmittel   Tabs ")).toBe("Spülmittel Tabs");
    expect(readRestock("   ")).toBe("");
    expect(readRestock("x".repeat(200))).toHaveLength(120);
  });
});

describe("freshPlaceOf", () => {
  it("knows from the catalog where something is bought fresh", () => {
    expect(freshPlaceOf("Karotten", testIndex)).toBe("market");
    expect(freshPlaceOf("2 Möhren", testIndex)).toBe("market");
    expect(freshPlaceOf("600 g Leberkäse", testIndex)).toBe("butcher");
    expect(freshPlaceOf("Milch WS 1.29", testIndex)).toBeNull();
    expect(freshPlaceOf("Spülmittel", testIndex)).toBeNull();
  });
});

describe("restockTrip", () => {
  it("puts an entry on the next shopping day", () => {
    expect(errand("Milch", TUESDAY)).toEqual({ date: FRIDAY, place: "supermarket" });
    expect(errand("Milch", FRIDAY)).toEqual({ date: FRIDAY, place: "supermarket" });
  });

  it("lets what the market does not sell wait for the supermarket", () => {
    expect(errand("Milch WS 1.29", SATURDAY)?.date).toBe(NEXT_MONDAY);
    expect(errand("Spülmittel", SATURDAY)?.date).toBe(NEXT_MONDAY);
  });

  it("buys what is fresh at its place when that is the next errand", () => {
    expect(errand("Karotten", SATURDAY)).toEqual({ date: SATURDAY, place: "market" });
    // The butcher has no day to wait for: meat that ran out is on the supermarket's note.
    expect(errand("Leberkäse", SATURDAY)).toEqual({ date: NEXT_MONDAY, place: "supermarket" });
    expect(errand("Karotten", TUESDAY)).toEqual({ date: FRIDAY, place: "supermarket" });
  });

  it("has no errand for a household that never shops", () => {
    expect(restockTrip({ text: "Milch", freshPlace: null }, [], TUESDAY)).toBeNull();
  });

  it("sends what the drugstore sells to its next note, also what the food catalog knows", () => {
    const days = withDrugstore(DEFAULT_SHOPPING_DAYS, 6);
    const at = (text: string, today: string) =>
      restockTrip({ text, freshPlace: freshPlaceOf(text, testIndex) }, days, today);
    expect(at("Zahnpasta", TUESDAY)).toEqual({ date: SATURDAY, place: "drugstore" });
    expect(at("2 Duschgel", SATURDAY)).toEqual({ date: SATURDAY, place: "drugstore" });
    expect(at("Spülmittel", TUESDAY)).toEqual({ date: SATURDAY, place: "drugstore" });
    // Food still goes where it did.
    expect(at("Milch", TUESDAY)).toEqual({ date: FRIDAY, place: "supermarket" });
    expect(at("Karotten", SATURDAY)).toEqual({ date: SATURDAY, place: "market" });
  });
});
