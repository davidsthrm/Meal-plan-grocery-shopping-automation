import { describe, expect, it } from "vitest";
import { byCategory, directory, discover, isMarked, seasonOf } from "./discover";
import { filterRecipes } from "./filter";
import { summary } from "./testing";

const categories = [
  { key: "hauptgericht", name: "Hauptgericht" },
  { key: "kuchen", name: "Kuchen & Gebäck" },
  { key: "getraenk", name: "Getränk" },
];
const old = { addedOn: "2026-01-05" };
const recipes = [
  summary("lasagne", { ...old, prepMinutes: 60, tags: ["aufwendig", "herbst"] }),
  summary("lachs", { ...old, proteinType: "fish", prepMinutes: 20 }),
  summary("steak", { ...old, proteinType: "red_meat", sourceBook: "Freude am Kochen" }),
  summary("kuchen", { ...old, category: "kuchen", prepMinutes: 15, sourceBook: null }),
  summary("neu", { addedOn: "2026-10-10", proteinType: "poultry", tags: ["schnell"] }),
];
const options = { today: "2026-10-12", history: new Map() };
const shelf = (key: string, list = recipes, patch = {}) =>
  discover(list, { ...options, ...patch }).find((entry) => entry.key === key);

describe("discover", () => {
  it("puts a few shelves on top that change with the day, and leaves out empty ones", () => {
    expect(discover(recipes, options).map((entry) => [entry.key, entry.total])).toEqual([
      ["schnell", 1],
      ["saison", 1],
      ["neu", 1],
    ]);
  });

  it("brings up what nobody has marked: favourites and wishes have a page of their own", () => {
    const marked = recipes.map((recipe) => ({
      ...recipe,
      isFavorite: recipe.id === "lachs",
      wanted: recipe.id === "lasagne",
    }));
    const shelves = discover(marked, options);
    expect(shelves.map((entry) => entry.key)).toEqual(["neu"]);
    expect(shelves.flatMap((entry) => entry.recipes).some(isMarked)).toBe(false);
  });

  it("shows what is tagged for the season of the day", () => {
    expect(shelf("saison")).toMatchObject({ title: "Jetzt im Herbst", total: 1 });
    expect(shelf("saison", recipes, { today: "2026-07-01" })).toBeUndefined();
  });

  it("gives a shelf the filter that lists all of it, where a filter can say it", () => {
    // What the filter lists includes the favourites the shelf leaves out.
    const marked = [...recipes, summary("eintopf", { ...old, tags: ["herbst"], isFavorite: true })];
    for (const list of [recipes, marked]) {
      for (const entry of discover(list, options)) {
        if (entry.filter === null) continue;
        expect(filterRecipes(list, entry.filter).length, entry.key).toBe(entry.total);
      }
    }
    expect(shelf("saison", marked)).toMatchObject({ total: 2, recipes: [{ id: "lasagne" }] });
  });

  it("calls only meals quick, not a cake that is stirred in a quarter of an hour", () => {
    expect(shelf("schnell")?.recipes.map((recipe) => recipe.id)).toEqual(["lachs"]);
  });

  it("shows a few recipes of a large shelf, changing by the day", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      summary(`r${i}`, { ...old, tags: ["herbst"] }),
    );
    const monday = shelf("saison", many, { size: 5 })!;
    expect(monday.total).toBe(40);
    expect(monday.recipes).toHaveLength(5);
    const tuesday = shelf("saison", many, { size: 5, today: "2026-10-13" })!;
    expect(tuesday.recipes.map((r) => r.id)).not.toEqual(monday.recipes.map((r) => r.id));
  });

  it("counts on a shelf without a filter only what it can show", () => {
    const quick = Array.from({ length: 3 }, (_, i) =>
      summary(`q${i}`, { ...old, prepMinutes: 10, isFavorite: i === 0 }),
    );
    expect(shelf("schnell", quick)).toMatchObject({ total: 2 });
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

describe("seasonOf", () => {
  it("goes by the calendar", () => {
    expect(seasonOf("2026-03-01")).toBe("fruehling");
    expect(seasonOf("2026-08-31")).toBe("sommer");
    expect(seasonOf("2026-10-12")).toBe("herbst");
    expect(seasonOf("2026-12-24")).toBe("winter");
    expect(seasonOf("2027-02-28")).toBe("winter");
  });
});

describe("directory", () => {
  const tagGroups = [
    {
      name: "Aufwand",
      tags: [
        { ref: "schnell", name: "Schnell", group: "Aufwand" },
        { ref: "alltag", name: "Alltagsküche", group: "Aufwand" },
        { ref: "aufwendig", name: "Braucht Zeit", group: "Aufwand" },
      ],
    },
    { name: "Saison", tags: [{ ref: "herbst", name: "Herbst", group: "Saison" }] },
    { name: "Anlass", tags: [{ ref: "grillen", name: "Grillen", group: "Anlass" }] },
  ];
  const books = ["Freude am Kochen", "Speed Cooking"];
  const sections = directory(recipes, { categories, tagGroups, books });

  it("lists every way to narrow the library down, with the number of recipes behind it", () => {
    expect(
      sections.map((section) => [
        section.title,
        section.entries.map((entry) => `${entry.label} ${entry.count}`),
      ]),
    ).toEqual([
      ["Art", ["Hauptgericht 4", "Kuchen & Gebäck 1"]],
      ["Aufwand", ["Schnell 1", "Braucht Zeit 1"]],
      ["Saison", ["Herbst 1"]],
      ["Ernährung", ["Vegetarisch 2", "Fisch 1", "Geflügel 1", "Fleisch 1"]],
      ["Kochbuch", ["Freude am Kochen 1", "Speed Cooking 3"]],
    ]);
  });

  it("gives every entry the filter that lists exactly its recipes", () => {
    for (const entry of sections.flatMap((section) => section.entries)) {
      expect(filterRecipes(recipes, entry.filter).length, entry.key).toBe(entry.count);
    }
  });
});

describe("byCategory", () => {
  it("sorts recipes into their categories in the household's order, by title", () => {
    const loose = summary("vesperbrett", { category: null });
    const groups = byCategory([...recipes, loose], [...categories].reverse());
    expect(groups.map((group) => [group.name, group.recipes.map((recipe) => recipe.id)])).toEqual([
      ["Kuchen & Gebäck", ["kuchen"]],
      ["Hauptgericht", ["lachs", "lasagne", "neu", "steak"]],
      ["Ohne Art", ["vesperbrett"]],
    ]);
  });
});
