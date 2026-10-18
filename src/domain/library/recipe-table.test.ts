import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  lacks,
  pageOf,
  readTableView,
  shownTags,
  sortedBy,
  sortRows,
  tableParams,
  type TableRow,
} from "./recipe-table";
import { summary } from "./testing";

const row = (id: string, patch = {}, lastCooked: string | null = null): TableRow => ({
  recipe: summary(id, patch),
  lastCooked,
});
const titles = (rows: TableRow[]) => rows.map((r) => r.recipe.title);
const context = { categories: ["hauptgericht", "suppe-eintopf", "kuchen"] };

describe("readTableView and tableParams", () => {
  it("reads what it understands and leaves out the default", () => {
    const view = readTableView({
      sortierung: "gekocht",
      richtung: "ab",
      seite: "3",
      ohne: "aufwand",
    });
    expect(view).toEqual({ sort: "gekocht", descending: true, page: 3, lacks: "aufwand" });
    expect(tableParams(view)).toEqual({
      sortierung: "gekocht",
      richtung: "ab",
      seite: "3",
      ohne: "aufwand",
    });
    expect(readTableView({ sortierung: "drop table", seite: "-1", ohne: "x" })).toEqual(
      DEFAULT_VIEW,
    );
    expect(tableParams(DEFAULT_VIEW)).toEqual({});
  });
});

describe("sortedBy", () => {
  it("sorts by a column, and the other way round on the second tap", () => {
    const byBook = sortedBy({ ...DEFAULT_VIEW, page: 4 }, "buch");
    expect(byBook).toMatchObject({ sort: "buch", descending: false, page: 1 });
    expect(sortedBy(byBook, "buch").descending).toBe(true);
    // By title is what the table shows without a choice.
    expect(sortedBy(DEFAULT_VIEW, "titel").descending).toBe(true);
  });
});

describe("sortRows", () => {
  const rows = [
    row(
      "Linsensuppe",
      { category: "suppe-eintopf", sourceBook: "B", sourcePage: 12 },
      "2026-10-01",
    ),
    row("Apfelkuchen", { category: "kuchen", sourceBook: "A", sourcePage: 100 }),
    row("Zucchini-Pasta", { category: null, sourceBook: null }, "2026-09-01"),
    row("Bohnen", { category: "hauptgericht", sourceBook: "A", sourcePage: 9 }, "2026-10-10"),
  ];

  it("keeps the order it was given without a column", () => {
    expect(titles(sortRows(rows, DEFAULT_VIEW, context))).toEqual(titles(rows));
  });

  it("sorts a book by its pages as numbers", () => {
    expect(titles(sortRows(rows, { sort: "buch", descending: false }, context))).toEqual([
      "Bohnen",
      "Apfelkuchen",
      "Linsensuppe",
      "Zucchini-Pasta",
    ]);
  });

  it("puts a recipe without a value last, whichever way round", () => {
    expect(titles(sortRows(rows, { sort: "kategorie", descending: false }, context))).toEqual([
      "Bohnen",
      "Linsensuppe",
      "Apfelkuchen",
      "Zucchini-Pasta",
    ]);
    expect(titles(sortRows(rows, { sort: "gekocht", descending: true }, context))).toEqual([
      "Bohnen",
      "Linsensuppe",
      "Zucchini-Pasta",
      "Apfelkuchen",
    ]);
  });

  it("sorts by effort, then by the printed time", () => {
    const efforts = [
      row("Lang", { tags: ["aufwendig"], prepMinutes: null }),
      row("Mittel", { tags: [], prepMinutes: 50 }),
      row("Fix", { tags: ["schnell"], prepMinutes: 25 }),
      row("Fixer", { tags: ["schnell"], prepMinutes: 10 }),
      row("Unbekannt", { tags: [], prepMinutes: null }),
    ];
    expect(titles(sortRows(efforts, { sort: "aufwand", descending: false }, context))).toEqual([
      "Fixer",
      "Fix",
      "Mittel",
      "Lang",
      "Unbekannt",
    ]);
  });
});

describe("lacks", () => {
  it("finds recipes without a category, an effort or other tags", () => {
    expect(lacks(summary("a", { category: null }), "kategorie")).toBe(true);
    expect(lacks(summary("a", { tags: [], prepMinutes: null }), "aufwand")).toBe(true);
    expect(lacks(summary("a", { tags: [], prepMinutes: 20 }), "aufwand")).toBe(false);
    expect(lacks(summary("a", { tags: ["schnell"] }), "stichworte")).toBe(true);
    expect(lacks(summary("a", { tags: ["schnell", "pasta"] }), "stichworte")).toBe(false);
  });
});

describe("pageOf", () => {
  it("shows one page, and the last one when more were asked for than there are", () => {
    const numbers = Array.from({ length: 120 }, (_, i) => i);
    expect(pageOf(numbers, 2)).toMatchObject({ page: 2, pages: 3, total: 120 });
    expect(pageOf(numbers, 2).rows[0]).toBe(50);
    expect(pageOf(numbers, 9).page).toBe(3);
    expect(pageOf(numbers, 9).rows).toHaveLength(20);
    expect(pageOf([], 1)).toEqual({ rows: [], page: 1, pages: 1, total: 0 });
  });
});

describe("shownTags", () => {
  it("lists a recipe's tags by group, without its effort", () => {
    const tags = [
      { ref: "schnell", group: "Aufwand" },
      { ref: "omas", group: "Eigene" },
      { ref: "pasta", group: "Gericht" },
      { ref: "herbst", group: "Saison" },
    ];
    expect(shownTags({ tags: ["omas", "schnell", "pasta"] }, tags).map((t) => t.ref)).toEqual([
      "pasta",
      "omas",
    ]);
  });
});
