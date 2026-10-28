import { describe, expect, it } from "vitest";
import { bookshelf, cookedShare, openBook } from "./bookshelf";
import { summary } from "./testing";

const today = "2026-10-28";
const recipes = [
  summary("a", { title: "Apfelstrudel", sourceBook: "Omas Küche", sourcePage: 40 }),
  summary("b", { title: "Bratkartoffeln", sourceBook: "Omas Küche", sourcePage: 12 }),
  summary("c", { title: "Linsensuppe", sourceBook: "Omas Küche", sourcePage: 30 }),
  summary("d", {
    title: "Kürbissuppe",
    sourceBook: "Omas Küche",
    sourcePage: 31,
    season: { points: 3, fits: true, foods: ["Kürbis"] },
  }),
  summary("e", { sourceBook: "Einfach Hausgemacht", sourceEdition: "06/2020", sourcePage: 5 }),
  summary("f", { sourceBook: "Einfach Hausgemacht", sourceEdition: "02/2024", sourcePage: 8 }),
  summary("g", { sourceBook: "Einfach Hausgemacht", sourceEdition: "02/2024", sourcePage: 9 }),
  summary("h", { sourceBook: null }),
];
const history = new Map([
  ["b", "2026-10-01"],
  ["c", "2026-09-14"],
  ["f", "2026-08-02"],
  // Planned for next week: not cooked yet, but no longer "never cooked" either.
  ["d", "2026-11-03"],
]);

describe("bookshelf", () => {
  it("lists every book by name with how much of it was cooked", () => {
    expect(bookshelf(recipes, history, today)).toEqual([
      { name: "Einfach Hausgemacht", recipes: 3, cooked: 1, editions: ["02/2024", "06/2020"] },
      { name: "Omas Küche", recipes: 4, cooked: 2, editions: [] },
    ]);
  });
});

describe("openBook", () => {
  const shelf = bookshelf(recipes, history, today);

  it("opens a book: the season, what was never cooked by page, what was cooked last first", () => {
    const book = openBook(recipes, shelf, "Omas Küche", { today, history })!;
    expect(book).toMatchObject({ edition: null, total: 4, cooked: 2 });
    expect(book.season.map((r) => r.id)).toEqual(["d"]);
    expect(book.never.map((r) => r.id)).toEqual(["a"]);
    expect(book.known.map(({ recipe, last }) => [recipe.id, last])).toEqual([
      ["b", "2026-10-01"],
      ["c", "2026-09-14"],
    ]);
  });

  it("opens one edition of a magazine, and the whole one for an edition it lacks", () => {
    const issue = openBook(recipes, shelf, "Einfach Hausgemacht", {
      edition: "02/2024",
      today,
      history,
    })!;
    expect(issue).toMatchObject({ edition: "02/2024", total: 2, cooked: 1 });
    expect(issue.never.map((r) => r.id)).toEqual(["g"]);
    const unknown = openBook(recipes, shelf, "Einfach Hausgemacht", {
      edition: "13/2099",
      today,
      history,
    })!;
    expect(unknown).toMatchObject({ edition: null, total: 3 });
  });

  it("opens nothing for a name the shelf does not have", () => {
    expect(openBook(recipes, shelf, "Gibt es nicht", { today, history })).toBeNull();
  });
});

describe("cookedShare", () => {
  it("is never an empty bar where something was cooked", () => {
    expect(cookedShare(0, 120)).toBe(0);
    expect(cookedShare(1, 300)).toBe(0.04);
    expect(cookedShare(30, 120)).toBe(0.25);
    expect(cookedShare(0, 0)).toBe(0);
  });
});
