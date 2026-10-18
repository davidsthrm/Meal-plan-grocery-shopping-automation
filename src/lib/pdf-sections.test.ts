import { describe, expect, it } from "vitest";
import type { Shop } from "@/domain/catalog";
import { buildShoppingList } from "@/domain/shopping-list/build";
import { presentByAisle } from "@/domain/shopping-list/present";
import { line, testIndex } from "@/domain/shopping-list/test-catalog";
import { singleTrip, type ShoppingTrip } from "@/domain/shopping-list/trips";
import type { LineState } from "@/domain/shopping-list/types";
import { pdfSections, type PdfSection } from "./pdf-sections";

const shop = (id: string, rank: number): Shop => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  shortLabel: id,
  sortOrder: 0,
  aisleSortOverrides: {},
  kind: "supermarket",
  supermarketRank: rank,
});

const ALDI = shop("aldi", 1);
const REWE = shop("rewe", 2);
const MONDAY: ShoppingTrip = { date: "2026-10-12", place: "supermarket" };

const lines = buildShoppingList({
  index: testIndex,
  trips: singleTrip("2026-10-12"),
  onDemand: [],
  recipes: [
    {
      id: "r",
      title: "Eintopf",
      kind: "cookbook",
      servings: { min: 4, max: 4, unit: null },
      ingredients: [line("karotten", 2, "Stück"), line("sahne", 200, "ml")],
    },
  ],
  slots: [
    {
      id: "s",
      date: "2026-10-13",
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "r", servings: 4 }],
    },
  ],
  manualEntries: [{ id: "m1", text: "Milch" }],
});

const sections = (states: Record<string, LineState>) =>
  pdfSections(
    [{ trip: MONDAY, view: presentByAisle(lines, states, testIndex) }],
    [ALDI, REWE],
    () => null,
  );

/** A section in one line: a note's title, "# Shop", or "Heading: line, line". */
const outline = (part: PdfSection) =>
  "title" in part
    ? part.title
    : "shop" in part
      ? `# ${part.shop}`
      : `${part.heading}: ${part.lines.join(", ")}`;

describe("pdfSections", () => {
  it("names a supermarket once, above its kinds of grocery", () => {
    const pdf = sections({ "sahne@main": { shopId: "rewe" } });
    expect(pdf.map(outline)).toEqual([
      "Aldi & Rewe: Montag, 12. Oktober",
      "# Aldi",
      "Obst & Gemüse: 2x Karotten",
      "Molkerei & Kühlregal: Milch",
      "# Rewe",
      "Molkerei & Kühlregal: 200 ml Sahne",
    ]);
  });

  it("has no supermarket headings when everything is bought at the main one", () => {
    expect(sections({}).some((part) => "shop" in part)).toBe(false);
  });

  it("leaves out what is ticked, and a supermarket with nothing left to buy", () => {
    const pdf = sections({ "sahne@main": { shopId: "rewe", checked: true } });
    expect(pdf.some((part) => "shop" in part && part.shop === "Rewe")).toBe(false);
    expect(pdf.flatMap((part) => ("lines" in part ? part.lines : []))).toEqual([
      "2x Karotten",
      "Milch",
    ]);
  });
});
