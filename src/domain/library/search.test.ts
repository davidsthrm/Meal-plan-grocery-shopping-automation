import { describe, expect, it } from "vitest";
import { NO_FILTER } from "./filter";
import { distanceWithin, nearlyContains, searchRecipes, searchWords, tolerance } from "./search";
import { summary } from "./testing";

const recipes = [
  summary("lasagne", { title: "Gemüse-Lasagne" }),
  summary("lachs", { title: "Lachs mit Currysahne", proteinType: "fish", isFavorite: true }),
  summary("lachsnudeln", { title: "Nudeln mit Räucherlachs", proteinType: "fish" }),
  summary("pesto", { title: "Pestonudeln", kind: "quick_meal", sourceBook: null }),
  summary("eintopf", {
    title: "Linsen-Eintopf",
    category: "suppe-eintopf",
    proteinType: "vegan",
    sourceBook: "Freude am Kochen",
  }),
  summary("suppe", { title: "Kürbissuppe", category: "suppe-eintopf" }),
  summary("eis", { title: "Vanilleeis", category: "dessert" }),
  summary("reis", { title: "Gebratener Reis", proteinType: "poultry" }),
];
const categoryName = (key: string) =>
  ({ hauptgericht: "Hauptgericht", "suppe-eintopf": "Suppe & Eintopf", dessert: "Dessert" })[key];
const search = (text: string, patch = {}, hits?: Record<string, string[]>) => {
  const result = searchRecipes(
    recipes,
    { ...NO_FILTER, ...patch, text },
    {
      categoryName,
      ingredientHits: new Map(Object.entries(hits ?? {}).map(([k, v]) => [k, new Set(v)])),
    },
  );
  return {
    matches: result.matches.map((r) => r.id),
    related: result.related.map((r) => r.id),
  };
};

describe("searchRecipes", () => {
  it("finds a word of the title, whole, at the start of a word or inside one", () => {
    expect(search("lachs").matches).toEqual(["lachs", "lachsnudeln"]);
    expect(search("nudel").matches).toEqual(["lachsnudeln", "pesto"]);
    expect(search("LINSEN").matches).toEqual(["eintopf"]);
  });

  it("does not mind missing umlauts", () => {
    expect(search("kurbis").matches).toEqual(["suppe"]);
    expect(search("gemuese").matches).toEqual(["lasagne"]);
    expect(search("raeucherlachs").matches).toEqual(["lachsnudeln"]);
  });

  it("forgives a typing mistake in a word that finds nothing as written", () => {
    expect(search("lasange").matches).toEqual(["lasagne"]);
    expect(search("pestonudln").matches).toEqual(["pesto"]);
    expect(search("kürbisupe").matches).toEqual(["suppe"]);
  });

  it("does not turn a short or a correctly written word into another one", () => {
    // "Reis" is not "Eis", and "Lachs" finds salmon, not everything that looks like it.
    expect(search("reis").matches).toEqual(["reis"]);
    expect(search("eis").matches).toEqual(["reis", "eis"]);
    expect(search("xyz")).toEqual({ matches: [], related: [] });
  });

  it("finds recipes by an ingredient that is in no title", () => {
    expect(search("sahne", {}, { sahne: ["lasagne"] }).matches).toEqual(["lachs", "lasagne"]);
  });

  it("finds recipes by their category, diet and cookbook", () => {
    expect(search("suppe").matches).toEqual(["suppe", "eintopf"]);
    expect(search("vegan").matches).toEqual(["eintopf"]);
    expect(search("fisch").matches).toEqual(["lachs", "lachsnudeln"]);
    expect(search("freude kochen").matches).toEqual(["eintopf"]);
  });

  it("wants every word to fit, and offers what fits some of them as related", () => {
    expect(search("lachs nudeln")).toEqual({
      matches: ["lachsnudeln"],
      related: ["lachs", "pesto"],
    });
    expect(search("linsen suppe").matches).toEqual(["eintopf"]);
  });

  it("puts the closest fit first, and favourites before others that fit as well", () => {
    // The whole word beats the word inside a longer one.
    expect(search("nudeln").matches).toEqual(["lachsnudeln", "pesto"]);
    expect(search("mit").matches).toEqual(["lachs", "lachsnudeln"]);
  });

  it("searches only among the recipes the rest of the filter lets through", () => {
    expect(search("nudeln", { diet: "fisch" }).matches).toEqual(["lachsnudeln"]);
    expect(search("", { category: "suppe-eintopf" }).matches).toEqual(["suppe", "eintopf"]);
  });
});

describe("the parts of the search", () => {
  it("splits a search into words to compare", () => {
    expect(searchWords("  Lachs,  Nudeln lachs ")).toEqual(["lachs", "nudeln"]);
    expect(searchWords("a b c d e f g h")).toHaveLength(6);
  });

  it("allows mistakes only in words long enough to stay recognisable", () => {
    expect(tolerance("reis")).toBe(0);
    expect(tolerance("lachs")).toBe(1);
    expect(tolerance("pestonudeln")).toBe(2);
  });

  it("counts the changes that make a word part of a text", () => {
    expect(distanceWithin("lachs", "raeucherlachs")).toBe(0);
    expect(distanceWithin("lasange", "gemuselasagne")).toBe(1);
    expect(distanceWithin("lasxyze", "gemuselasagne")).toBe(3);
    expect(distanceWithin("nudln", "pestonudeln")).toBe(1);
    expect(nearlyContains("pestonudeln", "nudln")).toBe(true);
    expect(nearlyContains("vanilleeis", "reis")).toBe(false);
  });

  it("finds recipes by the name of one of their tags", () => {
    const curry = summary("gemuesecurry", { title: "Gemüsecurry", tags: ["asiatisch"] });
    const stew = summary("eintopf", { title: "Linseneintopf", tags: ["deutsch"] });
    const names = new Map([
      ["asiatisch", "Asiatisch"],
      ["deutsch", "Deutsch & Schwäbisch"],
    ]);
    const found = searchRecipes(
      [curry, stew],
      { ...NO_FILTER, text: "asiatisch" },
      {
        tagName: (ref) => names.get(ref),
      },
    );
    expect(found.matches.map((recipe) => recipe.id)).toEqual(["gemuesecurry"]);
  });

  it("reads one or two letters as the beginning of a title, not as a word", () => {
    const french = summary("ciabatta", { title: "Ciabatta à la française" });
    const salmon = summary("lachs", { title: "Lachs mit Currysahne" });
    const lasagne = summary("lasagne", { title: "Gemüse-Lasagne" });
    const found = (text: string) =>
      searchRecipes([french, lasagne, salmon], { ...NO_FILTER, text }).matches.map((r) => r.id);
    // The title that starts with it first, then titles with a word that does.
    expect(found("la")).toEqual(["lachs", "ciabatta", "lasagne"]);
    expect(found("l")[0]).toBe("lachs");
    // A whole word still beats the beginning of one.
    expect(found("lasagne")).toEqual(["lasagne"]);
  });
});
