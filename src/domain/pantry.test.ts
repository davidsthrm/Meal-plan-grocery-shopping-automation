import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "./catalog";
import { pantryByAisle, searchCatalog } from "./pantry";
import { testCatalog } from "./shopping-list/test-catalog";

const index = createCatalogIndex({
  ...testCatalog,
  ingredients: testCatalog.ingredients.map((ingredient) =>
    ["salz", "butter", "milch"].includes(ingredient.id)
      ? { ...ingredient, isPantryStaple: true }
      : ingredient,
  ),
});

describe("pantryByAisle", () => {
  it("groups the staples by kind of grocery, in the order of the aisles, each by name", () => {
    expect(
      pantryByAisle(index).map((group) => [
        group.aisleGroup.name,
        group.items.map((item) => item.name),
      ]),
    ).toEqual([
      ["Gewürze, Öl & Essig", ["Salz"]],
      ["Molkerei & Kühlregal", ["Butter", "Milch"]],
    ]);
  });

  it("is empty without staples", () => {
    const none = createCatalogIndex({
      ...testCatalog,
      ingredients: testCatalog.ingredients.map((each) => ({ ...each, isPantryStaple: false })),
    });
    expect(pantryByAisle(none)).toEqual([]);
  });
});

describe("searchCatalog", () => {
  const names = (query: string) =>
    searchCatalog(testCatalog.ingredients, query).map((item) => item.name);

  it("finds a name that starts with the search before one that contains it", () => {
    expect(names("tomat")).toEqual(["Tomaten", "kleine Tomaten"]);
  });

  it("finds an ingredient by another of its names", () => {
    expect(names("möhren")).toEqual(["Karotten"]);
    expect(names("kirsch")).toEqual(["kleine Tomaten"]);
  });

  it("does not mind case, umlauts and spaces, and finds nothing for nothing", () => {
    expect(names("LEBERKAESE")).toEqual(["Leberkäse"]);
    expect(names("  ")).toEqual([]);
  });
});
