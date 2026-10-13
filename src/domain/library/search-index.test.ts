import { describe, expect, it } from "vitest";
import { NO_FILTER } from "./filter";
import { ingredientHitsIn, ingredientKeys, searchIndex, type SearchIndex } from "./search-index";
import { summary } from "./testing";

const index: SearchIndex = {
  recipes: [
    summary("eintopf", { title: "Linseneintopf" }),
    summary("salat", { title: "Bunter Salat", category: "salat", tags: ["sommer"] }),
    summary("kuchen", { title: "Rüblikuchen", category: "kuchen", isFavorite: true }),
  ],
  categories: [
    { key: "salat", name: "Salat" },
    { key: "kuchen", name: "Kuchen & Gebäck" },
  ],
  tags: [{ ref: "sommer", name: "Sommer" }],
  ingredients: [
    ingredientKeys(["Karotten", "Möhren", "Karotte"]),
    ingredientKeys(["Linsen"]),
    ingredientKeys(["Gurken", "Gurke"]),
  ],
  uses: [[0, 1], [0, 2], [0]],
  loose: ["", "kapuzinerkresse", ""],
};
const ids = (text: string, patch = {}) =>
  searchIndex(index, { ...NO_FILTER, ...patch, text }).matches.map((recipe) => recipe.id);

describe("the search index", () => {
  it("finds recipes by an ingredient, under any of its names", () => {
    expect(ids("linsen")).toEqual(["eintopf"]);
    expect(ids("möhren").sort()).toEqual(["eintopf", "kuchen", "salat"]);
    expect(ids("Gurke")).toEqual(["salat"]);
  });

  it("finds a recipe by a printed line the catalog does not know", () => {
    expect(ids("kresse")).toEqual(["salat"]);
  });

  it("forgives a typing mistake in an ingredient", () => {
    expect([...ingredientHitsIn(index, "karoten").get("karoten")!].sort()).toEqual([
      "eintopf",
      "kuchen",
      "salat",
    ]);
  });

  it("does not take two letters for an ingredient", () => {
    expect(ingredientHitsIn(index, "gu").size).toBe(0);
    // The title still answers from the first letter on: a word that starts with it first.
    expect(ids("r")).toEqual(["kuchen", "salat"]);
    expect(ids("bu")).toEqual(["salat"]);
  });

  it("keeps to the rest of the filter and knows the names of tags and categories", () => {
    expect(ids("möhren", { favorites: true })).toEqual(["kuchen"]);
    expect(ids("sommer")).toEqual(["salat"]);
    expect(ids("gebäck")).toEqual(["kuchen"]);
  });
});
