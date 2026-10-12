import { describe, expect, it } from "vitest";
import { discover } from "./discover";
import { filterRecipes } from "./filter";
import { summary } from "./testing";

const categories = [
  { key: "hauptgericht", name: "Hauptgericht" },
  { key: "kuchen", name: "Kuchen & Gebäck" },
  { key: "getraenk", name: "Getränk" },
];
const old = { addedOn: "2026-01-05" };
const recipes = [
  summary("lasagne", { ...old, prepMinutes: 60 }),
  summary("lachs", { ...old, proteinType: "fish", prepMinutes: 20, isFavorite: true }),
  summary("steak", { ...old, proteinType: "red_meat", sourceBook: "Freude am Kochen" }),
  summary("kuchen", { ...old, category: "kuchen", prepMinutes: 15, sourceBook: null }),
  summary("neu", { addedOn: "2026-10-10", proteinType: "poultry" }),
];
const options = { today: "2026-10-12", history: new Map(), categories };
const shelves = (list = recipes, patch = {}) =>
  discover(list, { ...options, ...patch }).flatMap((group) => group.shelves);
const shelf = (key: string, list = recipes, patch = {}) =>
  shelves(list, patch).find((entry) => entry.key === key);

describe("discover", () => {
  it("groups the library by what it is for, kind, diet and cookbook", () => {
    expect(discover(recipes, options).map((group) => group.title)).toEqual([
      "Auswahl",
      "Nach Art",
      "Nach Ernährung",
      "Nach Kochbuch",
    ]);
    expect(shelves().map((entry) => [entry.key, entry.total])).toEqual([
      ["favoriten", 1],
      ["schnell", 1],
      ["neu", 1],
      ["kategorie-hauptgericht", 4],
      ["kategorie-kuchen", 1],
      ["kost-vegetarisch", 2],
      ["kost-fisch", 1],
      ["kost-gefluegel", 1],
      ["kost-fleisch", 1],
      ["buch-Freude am Kochen", 1],
      ["buch-Speed Cooking", 3],
    ]);
  });

  it("names a shelf as the household named the category, and leaves out empty ones", () => {
    expect(shelf("kategorie-kuchen")?.title).toBe("Kuchen & Gebäck");
    expect(shelf("kategorie-getraenk")).toBeUndefined();
  });

  it("gives every shelf the filter that lists all of it", () => {
    for (const entry of shelves()) {
      if (entry.filter === null) continue;
      expect(filterRecipes(recipes, entry.filter).length, entry.key).toBe(entry.total);
    }
  });

  it("calls only meals quick, not a cake that is stirred in a quarter of an hour", () => {
    expect(shelf("schnell")?.recipes.map((recipe) => recipe.id)).toEqual(["lachs"]);
  });

  it("shows a few recipes of a large shelf, favourites first, others changing by the day", () => {
    const many = Array.from({ length: 40 }, (_, i) => summary(`r${i}`, old));
    many[17] = { ...many[17], isFavorite: true };
    const monday = shelf("kategorie-hauptgericht", many, { size: 5 })!;
    expect(monday.total).toBe(40);
    expect(monday.recipes).toHaveLength(5);
    expect(monday.recipes[0].id).toBe("r17");
    const tuesday = shelf("kategorie-hauptgericht", many, { size: 5, today: "2026-10-13" })!;
    expect(tuesday.recipes[0].id).toBe("r17");
    expect(tuesday.recipes.map((r) => r.id)).not.toEqual(monday.recipes.map((r) => r.id));
  });

  it("brings up what was cooked long ago, longest ago first", () => {
    const history = new Map([
      ["lasagne", "2026-08-10"],
      ["steak", "2026-06-01"],
      ["lachs", "2026-10-01"],
    ]);
    expect(shelf("lange-nicht", recipes, { history })?.recipes.map((recipe) => recipe.id)).toEqual([
      "steak",
      "lasagne",
    ]);
    expect(shelf("lange-nicht")).toBeUndefined();
  });

  it("has no shelf of new recipes while most of the library is new", () => {
    const fresh = recipes.map((recipe) => ({ ...recipe, addedOn: "2026-10-11" }));
    expect(shelf("neu", fresh)).toBeUndefined();
  });
});
