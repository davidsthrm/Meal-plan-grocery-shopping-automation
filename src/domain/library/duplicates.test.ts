import { describe, expect, it } from "vitest";
import {
  comparableIngredients,
  findDuplicates,
  ingredientOverlap,
  pairKey,
  preferredToKeep,
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

  it("finds one page imported twice first", () => {
    const pairs = findDuplicates([
      candidate("a", { title: "Linsensalat", sourceBook: "B", sourcePage: 88 }),
      candidate("b", { title: "Rustikaler Linsensalat", sourceBook: "B", sourcePage: 88 }),
      candidate("c", { title: "Linsensalat" }),
    ]);
    expect(pairs[0]).toMatchObject({ a: "a", b: "b", samePage: true, score: 1 });
    expect(pairs.map((pair) => pairKey(pair.a, pair.b))).toContain("a|c");
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

describe("preferredToKeep", () => {
  const side = { isFavorite: false, planned: 0, lines: 5, addedOn: "2026-10-01" };

  it("keeps the one that was planned, then the favourite, then the fuller one, then the older", () => {
    expect(preferredToKeep({ ...side, id: "a" }, { ...side, id: "b", planned: 2 })).toBe("b");
    expect(preferredToKeep({ ...side, id: "a", isFavorite: true }, { ...side, id: "b" })).toBe("a");
    expect(preferredToKeep({ ...side, id: "a" }, { ...side, id: "b", lines: 9 })).toBe("b");
    expect(preferredToKeep({ ...side, id: "a", addedOn: "2026-10-05" }, { ...side, id: "b" })).toBe(
      "b",
    );
  });
});
