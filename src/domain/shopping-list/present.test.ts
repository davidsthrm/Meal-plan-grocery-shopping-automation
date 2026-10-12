import { describe, expect, it } from "vitest";
import { buildShoppingList } from "./build";
import { presentList, resolveLine } from "./present";
import { line, testIndex } from "./test-catalog";
import type { LineState } from "./types";

const lines = buildShoppingList({
  index: testIndex,
  shoppingDate: "2026-10-12",
  recipes: [
    {
      id: "r",
      title: "Sonntagsessen",
      kind: "cookbook",
      servings: { min: 4, max: 4, unit: null },
      ingredients: [
        line("karotten", 2, "Stück"),
        line("ingwer", 1, "Stück"),
        line("salz", null, null),
        line("sahne", 150, "ml"),
        line("steak", 4, "Stück"),
      ],
    },
  ],
  slots: [
    {
      id: "s",
      date: "2026-10-18",
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "r", servings: 4 }],
    },
  ],
  manualEntries: [
    { id: "m1", text: "Milch WS 1.29" },
    { id: "m2", text: "Brot" },
    { id: "m3", text: "600 g Leberkäse" },
    { id: "m4", text: "20 Eier" },
  ],
});

function texts(states: Record<string, LineState> = {}) {
  const view = presentList(lines, states, testIndex);
  return {
    shops: view.shops.map((s) => [
      s.shop.shortLabel,
      s.groups.map((g) => g.lines.map((l) => l.text)),
    ]),
    later: view.later.map((l) => l.text),
    atHome: view.atHome.map((l) => l.text),
  };
}

describe("presentList", () => {
  it("groups by shop, then aisle, and leaves out what is at home", () => {
    expect(texts()).toEqual({
      shops: [
        ["Aldi", [["Ingwer", "2 Karotten"], ["Sahne"]]],
        // Dairy, then the meat counter, then the bakery: this shop's own order.
        ["EC", [["20 Eier", "Milch WS 1.29"], ["600 g Leberkäse"], ["Brot"]]],
      ],
      later: ["4 Rindersteaks"],
      atHome: ["Salz"],
    });
  });

  it("applies what the household changed", () => {
    const result = texts({
      "salz@main": { atHome: false },
      "ingwer@main": { atHome: true },
      "sahne@main": { shopId: "ec", note: "die gute" },
      "milch@main": { note: null },
    });
    expect(result.shops).toEqual([
      ["Aldi", [["2 Karotten"], ["Salz"]]],
      ["EC", [["20 Eier", "Milch", "Sahne die gute"], ["600 g Leberkäse"], ["Brot"]]],
    ]);
    expect(result.atHome).toEqual(["Ingwer"]);
  });

  it("keeps check-offs on the line without hiding it", () => {
    const view = presentList(lines, { "brot@main": { checked: true } }, testIndex);
    const bread = view.shops[1].groups
      .flatMap((g) => g.lines)
      .find((l) => l.line.key === "brot@main")!;
    expect(bread.checked).toBe(true);
  });
});

describe("resolveLine", () => {
  it("falls back to the defaults without stored changes", () => {
    const salt = lines.find((l) => l.key === "salz@main")!;
    expect(resolveLine(salt)).toMatchObject({
      atHome: true,
      checked: false,
      shopId: "aldi",
      note: null,
    });
  });
});
