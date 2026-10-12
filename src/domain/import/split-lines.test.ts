import { describe, expect, it } from "vitest";
import { seedCatalog } from "../../../supabase/seed/catalog";
import fixtures from "../../../tests/fixtures/sample-week/recipes.json";
import { createCatalogIndex } from "../catalog";
import { splitJoinedName } from "./map-ingredient";
import type { ExpectedRecipe } from "./score";
import { splitJoinedLines } from "./split-lines";
import { flawless } from "./testing";

const index = createCatalogIndex(seedCatalog);
const names = (name: string) => splitJoinedName(index, name)?.map((i) => i.name) ?? null;

describe("splitJoinedName", () => {
  it("tells apart ingredients that were written as one", () => {
    expect(names("Salz und Pfeffer")).toEqual(["Salz", "Pfeffer"]);
    expect(names("Salz & Pfeffer")).toEqual(["Salz", "Pfeffer"]);
    expect(names("Pfeffer, Salz")).toEqual(["Pfeffer", "Salz"]);
    expect(names("Salz, Pfeffer und Zucker")).toEqual(["Salz", "Pfeffer", "Zucker"]);
  });

  it("leaves a name alone that is one thing", () => {
    expect(names("Salz")).toBeNull();
    expect(names("Meersalz")).toBeNull();
    // A part the catalog does not know: this is an ingredient with a remark.
    expect(names("Zwiebeln, fein gewürfelt")).toBeNull();
    expect(names("Salz und Topinambur")).toBeNull();
    expect(names("Salz, Meersalz")).toBeNull();
  });
});

describe("splitJoinedLines", () => {
  const reading = flawless(
    (fixtures.recipes as ExpectedRecipe[]).find((r) => r.id === "IMG_5682")!,
  );
  const seasoning = {
    ...reading.ingredients[0],
    raw: "Salz und Pfeffer",
    name: "Salz und Pfeffer",
    quantity: null,
    quantityMax: null,
    unit: null,
  };

  it("makes one line per ingredient, each with the printed text of the joined line", () => {
    const recipe = { ...reading, ingredients: [reading.ingredients[0], seasoning] };
    const split = splitJoinedLines(recipe, index);
    expect(split.ingredients.map((line) => [line.name, line.raw])).toEqual([
      [reading.ingredients[0].name, reading.ingredients[0].raw],
      ["Salz", "Salz und Pfeffer"],
      ["Pfeffer", "Salz und Pfeffer"],
    ]);
  });

  it("does not share out an amount", () => {
    const recipe = {
      ...reading,
      ingredients: [{ ...seasoning, raw: "1 TL Salz und Pfeffer", quantity: 1, unit: "TL" }],
    };
    expect(splitJoinedLines(recipe, index)).toBe(recipe);
  });

  it("keeps lines that point at another line pointing at the same one", () => {
    const butter = { ...reading.ingredients[1], alternativeTo: null };
    const margarine = { ...reading.ingredients[2], alternativeTo: 1 };
    const split = splitJoinedLines(
      { ...reading, ingredients: [seasoning, butter, margarine] },
      index,
    );
    expect(split.ingredients.map((line) => line.alternativeTo)).toEqual([null, null, null, 2]);
    expect(split.ingredients[2].name).toBe(butter.name);
  });

  it("returns the reading itself when there is nothing to split", () => {
    expect(splitJoinedLines(reading, index)).toBe(reading);
  });
});
