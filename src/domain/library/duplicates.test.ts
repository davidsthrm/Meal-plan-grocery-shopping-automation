import { describe, expect, it } from "vitest";
import {
  comparableIngredients,
  findDuplicates,
  ingredientOverlap,
  keepReason,
  pairKey,
  titleSimilarity,
  type DuplicateCandidate,
} from "./duplicates";

function candidate(id: string, patch: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    id,
    title: id,
    sourceBook: null,
    sourcePage: null,
    ingredients: [],
    names: [],
    ...patch,
  };
}

describe("titleSimilarity", () => {
  it("ignores case, umlauts, hyphens and small words", () => {
    expect(titleSimilarity("Pesto-Nudeln mit Rucola", "Pestonudeln und Rucola")).toBe(1);
    expect(titleSimilarity("Gemüse-Lasagne", "Gemuese Lasagne")).toBe(1);
  });

  it("keeps two different pastas apart", () => {
    expect(titleSimilarity("Spaghetti Carbonara", "Spaghetti Bolognese")).toBeLessThan(0.6);
  });
});

describe("ingredientOverlap", () => {
  it("is the share both have, and nothing for too few", () => {
    expect(ingredientOverlap(["a", "b", "c", "d"], ["a", "b", "c", "e"])).toBeCloseTo(3 / 5);
    expect(ingredientOverlap(["a", "b"], ["a", "b", "c"])).toBeNull();
  });
});

describe("comparableIngredients", () => {
  it("leaves out staples where enough else is left", () => {
    const lines = [
      { key: "salz", staple: true },
      { key: "lachs", staple: false },
      { key: "dill", staple: false },
      { key: "zitrone", staple: false },
      { key: "dill", staple: false },
    ];
    expect(comparableIngredients(lines)).toEqual(["lachs", "dill", "zitrone"]);
    expect(comparableIngredients(lines.slice(0, 3))).toEqual(["salz", "lachs", "dill"]);
  });
});

describe("findDuplicates", () => {
  const lasagne = ["hack", "tomaten", "nudelplatten", "zwiebeln", "mozzarella"];

  it("finds one recipe from two cookbooks", () => {
    const pairs = findDuplicates([
      candidate("x", { title: "Lasagne Bolognese", sourceBook: "A", ingredients: lasagne }),
      candidate("y", {
        title: "Lasagne alla Bolognese",
        sourceBook: "B",
        ingredients: [...lasagne.slice(0, 4), "parmesan"],
      }),
      candidate("z", { title: "Apfelkuchen", ingredients: ["aepfel", "zimt", "mandeln"] }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "x", b: "y", title: 1, samePage: false });
    expect(pairs[0].ingredients).toBeCloseTo(4 / 6);
  });

  it("keeps two cakes of the same name apart when they are made differently", () => {
    expect(
      findDuplicates([
        candidate("a", { title: "Apfelkuchen", ingredients: ["aepfel", "zimt", "mandeln"] }),
        candidate("b", { title: "Apfelkuchen", ingredients: ["aepfel", "quark", "streusel"] }),
      ]),
    ).toEqual([]);
  });

  it("finds a renamed recipe by its ingredients", () => {
    const curry = ["kichererbsen", "kokosmilch", "spinat", "currypaste", "ingwer", "tomaten"];
    const pairs = findDuplicates([
      candidate("a", { title: "Kichererbsen-Curry", ingredients: curry }),
      candidate("b", { title: "Schnelles Kichererbsencurry mit Spinat", ingredients: curry }),
    ]);
    expect(pairs.map((pair) => pairKey(pair.a, pair.b))).toEqual(["a|b"]);
  });

  it("does not take two recipes of one page for one: a page often holds several", () => {
    // Both from page 111 of the same folder.
    expect(
      findDuplicates([
        candidate("a", {
          title: "Tunfisch und Zwiebeln",
          sourceBook: "bunter Ordner",
          sourcePage: 111,
          ingredients: ["blaetterteig", "chili", "thymian", "tunfisch", "kapern"],
          names: ["TK-Blätterteig", "Chilischoten", "Thymian", "Tunfischfilet", "Kapern"],
        }),
        candidate("b", {
          title: "Zwiebeln und Cheddar",
          sourceBook: "bunter Ordner",
          sourcePage: 111,
          ingredients: ["blaetterteig", "zwiebeln", "majoran", "aepfel", "cheddar"],
          names: ["TK-Blätterteig", "Zwiebeln", "Majoran", "Äpfel", "Cheddar"],
        }),
      ]),
    ).toEqual([]);
  });

  it("finds one page imported twice: same title, same ingredients", () => {
    const salad = ["linsen", "oliven", "salami", "mozzarella", "tomaten"];
    const pairs = findDuplicates([
      candidate("a", { title: "Linsensalat", sourceBook: "B", sourcePage: 88, ingredients: salad }),
      candidate("b", {
        title: "Rustikaler Linsensalat",
        sourceBook: "B",
        sourcePage: 88,
        ingredients: salad,
      }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "a", b: "b", samePage: true });
  });

  it("keeps variants apart whose titles name an ingredient only one has", () => {
    const base = ["couscous", "bruehe", "zwiebeln", "paprika", "gurke", "minze"];
    const names = ["Instant-Couscous", "Gemüsebrühe", "rote Zwiebeln", "Paprika", "Gurke", "Minze"];
    expect(
      findDuplicates([
        candidate("a", {
          title: "Couscoussalat mit Chili-Garnelen",
          ingredients: [...base, "garnelen"],
          names: [...names, "Garnelen"],
        }),
        candidate("b", {
          title: "Couscoussalat mit Kichererbsen",
          ingredients: [...base, "kichererbsen"],
          names: [...names, "Kichererbsen"],
        }),
      ]),
    ).toEqual([]);
  });

  it("leaves out pairs the household keeps both of", () => {
    const recipes = [
      candidate("b", { title: "Linsensalat" }),
      candidate("a", { title: "Linsensalat" }),
    ];
    expect(findDuplicates(recipes)).toHaveLength(1);
    expect(findDuplicates(recipes, new Set([pairKey("b", "a")]))).toEqual([]);
  });
});

describe("keepReason", () => {
  const side = { isFavorite: false, planned: 0 };

  it("names the one that was planned more often, then the favourite", () => {
    expect(keepReason({ ...side, id: "a" }, { ...side, id: "b", planned: 2 })).toEqual({
      id: "b",
      reason: "Öfter geplant",
    });
    expect(keepReason({ ...side, id: "a", isFavorite: true }, { ...side, id: "b" })).toEqual({
      id: "a",
      reason: "Favorit",
    });
  });

  it("names none where nothing speaks for one", () => {
    expect(keepReason({ ...side, id: "a" }, { ...side, id: "b" })).toBeNull();
  });
});
