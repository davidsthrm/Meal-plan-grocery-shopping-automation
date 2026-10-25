import { describe, expect, it } from "vitest";
import type { Ingredient, Place, Shop } from "../catalog";
import type { IsoDate } from "../dates";
import { periodOf } from "./period";
import {
  ingredientOfKey,
  isBoughtLine,
  shoppingStats,
  type LineRecord,
  type ShoppingStatsInput,
  type TypedRecord,
} from "./shopping";

function ingredient(id: string, name: string, aisleGroupId = "obst"): Ingredient {
  return {
    id,
    name,
    synonyms: [],
    aisleGroupId,
    preferredShopId: "aldi",
    preferredBrand: null,
    defaultUnit: "g",
    buyingMode: "count",
    packSize: null,
    roundingStep: null,
    gramsPer: {},
    isPantryStaple: false,
    shelfLifeDays: null,
  };
}

const ingredients = [
  ingredient("milch", "Milch", "milch"),
  ingredient("eier", "Eier", "milch"),
  ingredient("tk", "TK-Beeren", "tiefkuehl"),
];
const aldi: Shop = {
  id: "aldi",
  name: "Aldi",
  shortLabel: "A",
  sortOrder: 1,
  aisleSortOverrides: {},
  supermarketRank: 2,
  aisleGroupIds: ["tiefkuehl"],
};
const edeka: Shop = { ...aldi, id: "edeka", name: "EDEKA", supermarketRank: 1, aisleGroupIds: [] };

const note = (id: string, date: IsoDate, place: Place) => ({ id, date, place });

function line(noteId: string, key: string, patch: Partial<LineRecord> = {}): LineRecord {
  return {
    noteId,
    key,
    status: "bought",
    checkedAt: Date.parse(`2026-10-19T17:00:00Z`),
    checkedBy: "lena",
    decidedBy: "lena",
    substituted: false,
    shopId: null,
    movedTo: false,
    plannedName: null,
    ...patch,
  };
}

function typed(id: string, noteId: string, text: string, patch: Partial<TypedRecord> = {}) {
  return {
    id,
    noteId,
    text,
    ingredientId: null,
    shopId: null,
    aisleGroupId: null,
    forWhom: null,
    carried: false,
    ...patch,
  };
}

function input(patch: Partial<ShoppingStatsInput>): ShoppingStatsInput {
  return {
    period: periodOf("month", "2026-10-14"),
    today: "2026-10-25",
    firstWeek: null,
    notes: [],
    lines: [],
    typed: [],
    index: {
      ingredientById: new Map(ingredients.map((entry) => [entry.id, entry])),
      shopById: new Map([aldi, edeka].map((shop) => [shop.id, shop])),
    },
    supermarkets: [edeka, aldi],
    members: new Map([
      ["lena", "Lena"],
      ["david", "David"],
    ]),
    ...patch,
  };
}

describe("line keys", () => {
  it("name the ingredient of a planned line, and none of a typed one", () => {
    expect(ingredientOfKey("milch@main")).toBe("milch");
    expect(ingredientOfKey("ingwer@main#Stück")).toBe("ingwer");
    expect(ingredientOfKey("brot@main@baecker")).toBe("brot");
    expect(ingredientOfKey("manual:123")).toBeNull();
    expect(ingredientOfKey("unmapped:seele")).toBeNull();
  });

  it("count a line as bought when it was bought in full or in part, or ticked before statuses", () => {
    expect(isBoughtLine({ status: "partially_bought", checkedAt: 1 })).toBe(true);
    expect(isBoughtLine({ status: null, checkedAt: 1 })).toBe(true);
    expect(isBoughtLine({ status: "removed", checkedAt: null })).toBe(false);
    expect(isBoughtLine({ status: null, checkedAt: null })).toBe(false);
  });
});

describe("shopping statistics", () => {
  const notes = [
    note("mo", "2026-10-19", "supermarket"),
    note("sa", "2026-10-24", "market"),
    note("fr", "2026-10-23", "supermarket"),
    note("leer", "2026-10-21", "bakery"), // nothing bought: no errand
    note("spaet", "2026-10-30", "supermarket"), // after today
  ];

  it("counts an errand for every note with something bought, and who finished it", () => {
    const stats = shoppingStats(
      input({
        notes,
        lines: [
          line("mo", "milch@main"),
          line("mo", "tk@main", {
            checkedBy: "david",
            checkedAt: Date.parse("2026-10-19T18:00:00Z"),
          }),
          line("fr", "milch@main"),
          line("sa", "eier@main"),
          line("leer", "milch@main", { status: "removed", checkedAt: null }),
          line("spaet", "milch@main"),
        ],
      }),
    );
    expect(stats.errands.map((errand) => [errand.noteId, errand.bought, errand.by])).toEqual([
      ["mo", 2, "david"],
      ["fr", 1, "lena"],
      ["sa", 1, "lena"],
    ]);
    expect(stats.bought).toBe(4);
    expect(stats.places).toEqual([
      { place: "supermarket", errands: 2, bought: 3 },
      { place: "market", errands: 1, bought: 1 },
    ]);
    expect(stats.who.enough && stats.who.value).toEqual([
      { name: "Lena", errands: 2, ticks: 3 },
      { name: "David", errands: 1, ticks: 1 },
    ]);
    // Five weeks in October, four of them begun.
    expect(stats.perWeek).toBe(3 / 4);
    expect(stats.weekdays.enough && stats.weekdays.value).toEqual([1, 0, 0, 0, 1, 1, 0]);
  });

  it("lays the errands out as a calendar of the period", () => {
    const stats = shoppingStats(
      input({ notes, lines: [line("mo", "milch@main"), line("sa", "eier@main")] }),
    );
    expect(stats.days).toHaveLength(35);
    expect(stats.days.find((day) => day.date === "2026-10-19")?.places).toEqual(["supermarket"]);
    expect(stats.days.find((day) => day.date === "2026-10-24")?.places).toEqual(["market"]);
  });

  it("ranks what was bought on more than one errand", () => {
    const one = shoppingStats(input({ notes, lines: [line("mo", "milch@main")] }));
    expect(one.top).toEqual({ enough: false, have: 1, need: 2 });
    const stats = shoppingStats(
      input({
        notes,
        lines: [
          line("mo", "milch@main"),
          line("fr", "milch@later"),
          line("mo", "eier@main"),
          line("fr", "manual:e1"),
        ],
        typed: [typed("e1", "fr", "Eier Bio", { ingredientId: "eier" })],
      }),
    );
    expect(stats.top.enough && stats.top.value).toEqual([
      { key: "eier", label: "Eier", count: 2, last: { date: "2026-10-23", place: "supermarket" } },
      {
        key: "milch",
        label: "Milch",
        count: 2,
        last: { date: "2026-10-23", place: "supermarket" },
      },
    ]);
  });

  it("puts each supermarket line at the supermarket it was bought at", () => {
    const stats = shoppingStats(
      input({
        notes,
        lines: [
          line("mo", "milch@main"), // the main one
          line("mo", "tk@main"), // frozen food is bought at Aldi
          line("fr", "eier@main", { shopId: "aldi" }), // chosen for this week
        ],
      }),
    );
    expect(
      stats.supermarkets.enough &&
        stats.supermarkets.value.map((row) => [row.shop.name, row.bought]),
    ).toEqual([
      ["Aldi", 2],
      ["EDEKA", 1],
    ]);
    expect(shoppingStats(input({ supermarkets: [] })).supermarkets.enough).toBe(false);
  });

  it("counts what was not bought as planned", () => {
    const stats = shoppingStats(
      input({
        notes,
        lines: [
          line("mo", "milch@main", { status: "removed", checkedAt: null }),
          line("fr", "milch@main", { status: "removed", checkedAt: null }),
          line("fr", "eier@main", { status: "partially_bought" }),
          line("sa", "tk@main", { substituted: true }),
          line("sa", "eier@main", { status: "moved", checkedAt: null, movedTo: true }),
        ],
      }),
    );
    expect(stats.deviations.enough && stats.deviations.value).toMatchObject({
      decided: 4,
      removed: 2,
      partial: 1,
      substituted: 1,
      moved: 1,
    });
    expect(stats.deviations.enough && stats.deviations.value.mostRemoved[0]).toMatchObject({
      label: "Milch",
      count: 2,
    });
  });

  it("counts what was written by hand, apart from the drugstore, and for whom", () => {
    const stats = shoppingStats(
      input({
        notes: [...notes, note("dm", "2026-10-24", "drugstore")],
        typed: [
          typed("a", "mo", "Grüne Trauben"),
          typed("b", "fr", "grüne trauben"),
          typed("c", "fr", "Rest", { carried: true }),
          typed("d", "dm", "Duschgel", { forWhom: "Lena" }),
          typed("e", "dm", "Zahnpasta"),
        ],
      }),
    );
    expect(stats.typed.enough && stats.typed.value).toEqual({
      count: 2,
      top: [
        {
          key: "text:gruenetrauben",
          label: "Grüne Trauben",
          count: 2,
          last: { date: "2026-10-23", place: "supermarket" },
        },
      ],
    });
    expect(stats.drugstore.enough && stats.drugstore.value).toMatchObject({
      count: 2,
      forWhom: [{ name: "Lena", count: 1 }],
    });
  });

  it("says when there are too few errands to tell who shops", () => {
    const stats = shoppingStats(input({ notes, lines: [line("mo", "milch@main")] }));
    expect(stats.who).toEqual({ enough: false, have: 1, need: 2 });
    expect(stats.trend).toEqual({ enough: false, have: 1, need: 2 });
  });
});
