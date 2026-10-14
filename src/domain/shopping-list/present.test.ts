import { describe, expect, it } from "vitest";
import { buildShoppingList } from "./build";
import { presentByAisle, presentList, resolveLine } from "./present";
import { line, testIndex } from "./test-catalog";
import { singleTrip } from "./trips";
import type { LineState } from "./types";

const lines = buildShoppingList({
  index: testIndex,
  // One shopping day and one list for it: the meat is on it too.
  trips: singleTrip("2026-10-12"),
  onDemand: [],
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
        ["Aldi", [["1x Ingwer", "2x Karotten"], ["150 ml Sahne"]]],
        // Dairy, then the meat counter, then the bakery: this shop's own order.
        ["EC", [["20x Eier", "Milch WS 1.29"], ["600 g Leberkäse"], ["Brot"]]],
      ],
      later: ["4x Rindersteaks"],
      atHome: ["Salz"],
    });
  });

  it("applies what the household changed", () => {
    const result = texts({
      "salz@main": { atHome: false },
      "ingwer@main#Stück": { atHome: true },
      "sahne@main": { shopId: "ec", note: "die gute" },
      "milch@main": { note: null },
    });
    expect(result.shops).toEqual([
      ["Aldi", [["2x Karotten"], ["Salz"]]],
      ["EC", [["20x Eier", "Milch", "150 ml Sahne die gute"], ["600 g Leberkäse"], ["Brot"]]],
    ]);
    expect(result.atHome).toEqual(["1x Ingwer"]);
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

describe("presentByAisle", () => {
  const groups = (states: Record<string, LineState> = {}) => {
    const view = presentByAisle(lines, states, testIndex);
    return {
      groups: view.groups.map((g) => [g.aisleGroup.name, g.lines.map((l) => l.text)]),
      atHome: view.atHome.map((l) => l.text),
    };
  };

  it("groups by kind of grocery only, whichever shop a thing comes from", () => {
    expect(groups()).toEqual({
      groups: [
        ["Obst & Gemüse", ["1x Ingwer", "2x Karotten"]],
        ["Brot & Backwaren", ["Brot"]],
        // Cream from one shop and eggs and milk from the other stand together.
        ["Molkerei & Kühlregal", ["20x Eier", "Milch WS 1.29", "150 ml Sahne"]],
        // The steaks would not keep until Sunday. They stand with the rest of the meat, and
        // the line says for which day they are bought.
        ["Fleisch & Wurst", ["600 g Leberkäse", "4x Rindersteaks"]],
      ],
      atHome: ["Salz"],
    });
    const steaks = presentByAisle(lines, {}, testIndex)
      .groups.flatMap((group) => group.lines)
      .find((entry) => entry.line.key === "steak@later");
    expect(steaks?.line).toMatchObject({ trip: "later", neededBy: "2026-10-18" });
  });

  it("applies what the household changed, like the list by shop", () => {
    const view = groups({
      "salz@main": { atHome: false },
      "ingwer@main#Stück": { atHome: true },
    });
    expect(view.groups[0]).toEqual(["Obst & Gemüse", ["2x Karotten"]]);
    expect(view.groups.map((group) => group[0])).toContain("Gewürze, Öl & Essig");
    expect(view.atHome).toEqual(["1x Ingwer"]);
  });
});

describe("an amount written by hand", () => {
  const carrots = lines.find((l) => l.key === "karotten@main")!;

  it("stands in front of the name instead of the plan's", () => {
    const view = resolveLine(carrots, { amount: { quantity: 5, unit: "Stück" } });
    expect(view).toMatchObject({ text: "5x Karotten", edited: true });
    expect(view.purchase).toEqual({ quantity: 5, unit: "Stück" });
    // What the plan says is still there to compare.
    expect(view.line.purchase).toEqual({ quantity: 2, unit: "Stück" });
  });

  it("names one piece in the singular, and any other unit by the catalog's name", () => {
    expect(resolveLine(carrots, { amount: { quantity: 1, unit: "Stück" } }).text).toBe(
      "1x Karotte",
    );
    expect(resolveLine(carrots, { amount: { quantity: 1, unit: "Bund" } }).text).toBe(
      "1 Bund Karotten",
    );
  });

  it("gives a line without an amount one", () => {
    const bread = lines.find((l) => l.key === "brot@main")!;
    expect(bread.purchase).toBeNull();
    expect(resolveLine(bread, { amount: { quantity: 2, unit: "Stück" } }).text).toBe("2x Brot");
  });

  it("is the plan's amount again once it is taken back", () => {
    expect(resolveLine(carrots, { amount: null })).toMatchObject({
      text: "2x Karotten",
      edited: false,
    });
  });
});
