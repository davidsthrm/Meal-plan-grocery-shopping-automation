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
const titles = (filter: Partial<typeof NO_FILTER>) =>
  filterRecipes(all, { ...NO_FILTER, ...filter }).map((recipe) => recipe.id);

describe("filterRecipes", () => {
  it("lists everything without a filter, favourites first and then by title", () => {
    expect(titles({})).toEqual(["lachs", "lasagne", "eintopf", "steak"]);
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
    expect(titles({ diet: "vegetarisch", book: "Speed Cooking" })).toEqual(["lasagne"]);
    expect(matchesFilter(salmon, { ...NO_FILTER, favorites: true, diet: "fleisch" })).toBe(false);
  });
});

describe("tags in the filter", () => {
  it("keeps the recipes that have every tag asked for", () => {
    const quickPasta = summary("carbonara", { tags: ["schnell", "pasta", "italienisch"] });
    const slowPasta = summary("lasagne", { tags: ["aufwendig", "pasta"] });
    const both = { ...NO_FILTER, tags: ["schnell", "pasta"] };
    expect(matchesFilter(quickPasta, both)).toBe(true);
    expect(matchesFilter(slowPasta, both)).toBe(false);
    expect(matchesFilter(slowPasta, { ...NO_FILTER, tags: ["pasta"] })).toBe(true);
  });
});

describe("a magazine's editions", () => {
  it("narrows a magazine down to one edition, every edition without one", () => {
    const june = summary("Juni", { sourceBook: "Einfach Hausgemacht", sourceEdition: "06/2020" });
    const year = summary("Jahr", {
      sourceBook: "Einfach Hausgemacht",
      sourceEdition: "Jahresheft 2021",
    });
    const magazine = { ...NO_FILTER, book: "Einfach Hausgemacht" };
    expect([june, year].filter((r) => matchesFilter(r, magazine))).toHaveLength(2);
    expect(matchesFilter(june, { ...magazine, edition: "06/2020" })).toBe(true);
    expect(matchesFilter(year, { ...magazine, edition: "06/2020" })).toBe(false);
  });
});

describe("the filter in the address", () => {
  it("survives being written and read", () => {
    const filter = {
      text: "Lachs",
      category: "hauptgericht",
      diet: "fisch" as const,
      maxMinutes: 30,
      book: "Einfach Hausgemacht",
      edition: "06/2020",
      favorites: true,
      tags: ["schnell", "italienisch"],
      season: true,
      longAgo: true,
    };
    expect(filterParams(filter)).toEqual({
      q: "Lachs",
      kategorie: "hauptgericht",
      kost: "fisch",
      zeit: "30",
      buch: "Einfach Hausgemacht",
      ausgabe: "06/2020",
      favoriten: "1",
      tag: "schnell,italienisch",
      saison: "1",
      lange: "1",
    });
    expect(readFilter(filterParams(filter))).toEqual(filter);
  });

  it("reads an edition only within its book", () => {
    expect(readFilter({ ausgabe: "06/2020" }).edition).toBeNull();
    expect(readFilter({ buch: "Einfach Hausgemacht", ausgabe: "06/2020" }).edition).toBe("06/2020");
  });

  it("reads tags as a list, and nothing that could not be one", () => {
    expect(readFilter({ tag: "schnell, pasta,,schnell,<b>" }).tags).toEqual(["schnell", "pasta"]);
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

describe("the season and the plans", () => {
  const fits = { points: 3, fits: true, foods: ["Kürbis"] };
  it("finds what fits the season, where the page worked it out", () => {
    const filter = { ...NO_FILTER, season: true };
    expect(matchesFilter(summary("suppe", { season: fits }), filter)).toBe(true);
    expect(matchesFilter(summary("salat", { season: { ...fits, fits: false } }), filter)).toBe(
      false,
    );
    expect(matchesFilter(summary("unbekannt"), filter)).toBe(false);
  });

  it("finds what was cooked long ago", () => {
    const filter = { ...NO_FILTER, longAgo: true };
    expect(matchesFilter(summary("alt", { longAgo: true }), filter)).toBe(true);
    expect(matchesFilter(summary("neu", { longAgo: false }), filter)).toBe(false);
  });
});
