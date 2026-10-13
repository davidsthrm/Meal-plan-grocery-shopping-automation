import { describe, expect, it } from "vitest";
import { readRestock, restockTrip } from "./restock";
import { testIndex } from "./test-catalog";
import { DEFAULT_SHOPPING_DAYS } from "./trips";

const TUESDAY = "2026-10-13";
const FRIDAY = "2026-10-16";
const SATURDAY = "2026-10-17";
const NEXT_MONDAY = "2026-10-19";

const day = (text: string, today: string) =>
  restockTrip(text, testIndex, DEFAULT_SHOPPING_DAYS, today)?.date;

describe("readRestock", () => {
  it("tidies what was written", () => {
    expect(readRestock("  Spülmittel   Tabs ")).toBe("Spülmittel Tabs");
    expect(readRestock("   ")).toBe("");
    expect(readRestock("x".repeat(200))).toHaveLength(120);
  });
});

describe("restockTrip", () => {
  it("puts an entry on the next shopping day", () => {
    expect(day("Milch", TUESDAY)).toBe(FRIDAY);
    expect(day("Milch", FRIDAY)).toBe(FRIDAY);
  });

  it("lets what the market does not sell wait for the supermarket", () => {
    expect(day("Milch WS 1.29", SATURDAY)).toBe(NEXT_MONDAY);
    expect(day("Spülmittel", SATURDAY)).toBe(NEXT_MONDAY);
  });

  it("buys what is fresh at the market when that is the next shopping day", () => {
    expect(day("Karotten", SATURDAY)).toBe(SATURDAY);
    expect(day("2 Möhren", SATURDAY)).toBe(SATURDAY);
    expect(day("Karotten", TUESDAY)).toBe(FRIDAY);
  });

  it("has no day for a household that never shops", () => {
    expect(restockTrip("Milch", testIndex, [], TUESDAY)).toBeNull();
  });
});
