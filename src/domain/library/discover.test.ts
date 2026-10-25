import { describe, expect, it } from "vitest";
import {
  byCategory,
  directory,
  discover,
  isMarked,
  seasonOf,
  toDiscover,
  withHistory,
} from "./discover";
import { filterRecipes, NO_FILTER } from "./filter";
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

const fits = (points: number, foods: string[] = []) => ({ points, fits: true, foods });

describe("discover", () => {
  it("puts a few shelves on top that change with the day, and leaves out empty ones", () => {
    expect(discover(recipes, options).map((entry) => [entry.key, entry.total])).toEqual([
      ["schnell", 2],
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
    expect(shelves.flatMap((entry) => entry.recipes).some(isMarked)).toBe(false);
  });

  it("shows what fits the season, the most of it first, and says why", () => {
    const list = [
      summary("kuerbis", { ...old, season: fits(3, ["Kürbis"]) }),
      summary("suppe", { ...old, season: fits(5, ["Kürbis", "Lauch"]) }),
      summary("salat", { ...old, season: { points: 1, fits: false, foods: [] } }),
    ];
    const season = shelf("saison", list)!;
    expect(season.title).toBe("Passt zur Saison");
    expect(season.recipes.map((recipe) => recipe.id)).toEqual(["suppe", "kuerbis"]);
    expect(season.why).toEqual({ suppe: "Mit Kürbis, Lauch", kuerbis: "Mit Kürbis" });
    expect(season.filter).toMatchObject({ season: true });
    // Without the season worked out, there is no such shelf.
    expect(shelf("saison")).toBeUndefined();
  });

  it("gives every shelf but the new one the filter that lists all of it", () => {
    const history = new Map([["steak", "2026-06-01"]]);
    const list = withHistory(
      [
        ...recipes.map((recipe) => ({ ...recipe, season: fits(3) })),
        summary("eintopf", { ...old, isFavorite: true, season: fits(2) }),
      ],
      history,
      options.today,
    );
    const shelves = discover(list, { ...options, history });
    expect(shelves.map((entry) => entry.key)).toEqual(["saison", "schnell", "lange-nicht", "neu"]);
    // What the filter lists includes the favourite the shelf leaves out.
    expect(shelves[0]).toMatchObject({ total: 6 });
    for (const entry of shelves) {
      if (entry.filter === null) continue;
      expect(filterRecipes(list, entry.filter).length, entry.key).toBe(entry.total);
    }
  });

  it("puts quick meals before a cake that is stirred in a quarter of an hour", () => {
    expect(shelf("schnell")?.recipes.map((recipe) => recipe.id)).toEqual(["lachs", "kuchen"]);
  });

  it("shows a few recipes of a large shelf, changing by the day", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      summary(`r${i}`, { ...old, prepMinutes: 10 }),
    );
    const monday = shelf("schnell", many, { size: 5 })!;
    expect(monday.total).toBe(40);
    expect(monday.recipes).toHaveLength(5);
    const tuesday = shelf("schnell", many, { size: 5, today: "2026-10-13" })!;
    expect(tuesday.recipes.map((r) => r.id)).not.toEqual(monday.recipes.map((r) => r.id));
  });

  it("brings up what was cooked long ago, longest ago first", () => {
    const history = new Map([
      ["lasagne", "2026-08-10"],
      ["steak", "2026-06-01"],
      ["lachs", "2026-10-01"],
    ]);
    const known = withHistory(recipes, history, options.today);
    expect(shelf("lange-nicht", known, { history })?.recipes.map((recipe) => recipe.id)).toEqual([
      "steak",
      "lasagne",
    ]);
    expect(shelf("lange-nicht")).toBeUndefined();
  });

  it("has no shelf of new recipes while most of the library is new", () => {
    const fresh = recipes.map((recipe) => ({ ...recipe, addedOn: "2026-10-11" }));
    expect(shelf("neu", fresh)).toBeUndefined();
  });

  it("has shelves for a few of the tags used most", () => {
    const tagGroups = [
      {
        name: "Gericht",
        tags: [
          { ref: "pasta", name: "Pasta & Nudeln", group: "Gericht" },
          { ref: "reis", name: "Reis & Getreide", group: "Gericht" },
        ],
      },
      { name: "Aufwand", tags: [{ ref: "schnell", name: "Schnell", group: "Aufwand" }] },
    ];
    const list = [
      ...Array.from({ length: 6 }, (_, i) =>
        summary(`p${i}`, { ...old, tags: ["pasta", "schnell"] }),
      ),
      ...Array.from({ length: 2 }, (_, i) => summary(`r${i}`, { ...old, tags: ["reis"] })),
    ];
    const shelves = discover(list, { ...options, tagGroups });
    // Too few recipes make no shelf, and the effort has a shelf of its own.
    expect(
      shelves.filter((entry) => entry.key.startsWith("tag-")).map((entry) => entry.title),
    ).toEqual(["Pasta & Nudeln"]);
    expect(shelves.find((entry) => entry.key === "tag-pasta")?.filter).toMatchObject({
      tags: ["pasta"],
    });
  });
});

describe("toDiscover", () => {
  const marked = [
    summary("lasagne", { isFavorite: true }),
    summary("lachs", { wanted: true }),
    summary("steak"),
  ];
  const ids = (list: { id: string }[]) => list.map((recipe) => recipe.id);

  it("leaves favourites and wishes to their own page while browsing and filtering", () => {
    expect(ids(toDiscover(marked, NO_FILTER))).toEqual(["steak"]);
    expect(ids(toDiscover(marked, { ...NO_FILTER, category: "hauptgericht" }))).toEqual(["steak"]);
  });

  it("finds a favourite by its name", () => {
    expect(ids(toDiscover(marked, { ...NO_FILTER, text: "Lasagne" }))).toEqual([
      "lasagne",
      "lachs",
      "steak",
    ]);
    expect(ids(toDiscover(marked, { ...NO_FILTER, text: "  " }))).toEqual(["steak"]);
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
