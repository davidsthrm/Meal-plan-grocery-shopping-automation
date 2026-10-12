import { describe, expect, it } from "vitest";
import {
  filterParams,
  filterRecipes,
  isNoFilter,
  matchesFilter,
  NO_FILTER,
  readFilter,
} from "./filter";
import { summary } from "./testing";

const lasagne = summary("lasagne", { title: "Gemüse-Lasagne", prepMinutes: 60 });
const salmon = summary("lachs", {
  title: "Lachs mit Currysahne",
  proteinType: "fish",
  prepMinutes: 20,
  isFavorite: true,
});
const stew = summary("eintopf", {
  title: "Linsen-Eintopf",
  category: "suppe-eintopf",
  proteinType: "vegan",
  prepMinutes: null,
  sourceBook: "Freude am Kochen",
});
const steak = summary("steak", { title: "Pfeffersteak", proteinType: "red_meat", prepMinutes: 25 });
const all = [lasagne, salmon, stew, steak];
const titles = (filter: Partial<typeof NO_FILTER>, hits?: Set<string>) =>
  filterRecipes(all, { ...NO_FILTER, ...filter }, hits).map((recipe) => recipe.id);

describe("filterRecipes", () => {
  it("lists everything without a filter, favourites first and then by title", () => {
    expect(titles({})).toEqual(["lachs", "lasagne", "eintopf", "steak"]);
  });

  it("finds words of the title in any order, whatever the spelling", () => {
    expect(titles({ text: "lasagne gemuse" })).toEqual(["lasagne"]);
    expect(titles({ text: "gemuese" })).toEqual(["lasagne"]);
    expect(titles({ text: "LINSEN" })).toEqual(["eintopf"]);
    expect(titles({ text: "gibt es nicht" })).toEqual([]);
  });

  it("also finds recipes that contain the searched ingredient", () => {
    // "Sahne" is in no title but one, and the database says the lasagne has cream in it.
    expect(titles({ text: "sahne" }, new Set(["lasagne"]))).toEqual(["lachs", "lasagne"]);
  });

  it("narrows by category, cookbook and favourites", () => {
    expect(titles({ category: "suppe-eintopf" })).toEqual(["eintopf"]);
    expect(titles({ book: "Freude am Kochen" })).toEqual(["eintopf"]);
    expect(titles({ favorites: true })).toEqual(["lachs"]);
  });

  it("counts vegan dishes as vegetarian, but not the other way round", () => {
    expect(titles({ diet: "vegetarisch" })).toEqual(["lasagne", "eintopf"]);
    expect(titles({ diet: "vegan" })).toEqual(["eintopf"]);
    expect(titles({ diet: "fisch" })).toEqual(["lachs"]);
    expect(titles({ diet: "fleisch" })).toEqual(["steak"]);
  });

  it("does not call a recipe quick when its time is unknown", () => {
    expect(titles({ maxMinutes: 20 })).toEqual(["lachs"]);
    expect(titles({ maxMinutes: 30 })).toEqual(["lachs", "steak"]);
  });

  it("combines everything that is set", () => {
    expect(titles({ diet: "vegetarisch", book: "Speed Cooking", text: "lasagne" })).toEqual([
      "lasagne",
    ]);
    expect(matchesFilter(salmon, { ...NO_FILTER, favorites: true, diet: "fleisch" })).toBe(false);
  });
});

describe("the filter in the address", () => {
  it("survives being written and read", () => {
    const filter = {
      text: "Lachs",
      category: "hauptgericht",
      diet: "fisch" as const,
      maxMinutes: 30,
      book: "Speed Cooking",
      favorites: true,
    };
    expect(filterParams(filter)).toEqual({
      q: "Lachs",
      kategorie: "hauptgericht",
      kost: "fisch",
      zeit: "30",
      buch: "Speed Cooking",
      favoriten: "1",
    });
    expect(readFilter(filterParams(filter))).toEqual(filter);
  });

  it("leaves out what is not set", () => {
    expect(filterParams(NO_FILTER)).toEqual({});
    expect(isNoFilter(readFilter({}))).toBe(true);
    expect(isNoFilter(readFilter({ q: "  " }))).toBe(true);
    expect(isNoFilter(readFilter({ zeit: "20" }))).toBe(false);
  });

  it("ignores values it does not know", () => {
    expect(readFilter({ kost: "paleo", zeit: "7", favoriten: "ja", q: ["a", "b"] })).toEqual({
      ...NO_FILTER,
      text: "a",
    });
  });
});
