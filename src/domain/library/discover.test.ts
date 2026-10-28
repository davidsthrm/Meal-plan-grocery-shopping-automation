import { describe, expect, it } from "vitest";
import {
  byCategory,
  discover,
  isMarked,
  recipeOfTheDay,
  seasonOf,
  surprisePool,
  themes,
  toDiscover,
  withHistory,
} from "./discover";
import { rank } from "../rank";
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

  it("gives every shelf but the new and the never cooked one the filter that lists all of it", () => {
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
    expect(shelves.map((entry) => entry.key)).toEqual([
      "saison",
      "schnell",
      "lange-nicht",
      "neu",
      "nie",
    ]);
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

describe("the looks of the shelves", () => {
  it("shows the season large and quick recipes as rows, the rest as cards", () => {
    const list = recipes.map((recipe) => ({ ...recipe, season: fits(3) }));
    const looks = Object.fromEntries(
      discover(list, options).map((entry) => [entry.key, entry.look]),
    );
    expect(looks).toMatchObject({ saison: "large", schnell: "list", neu: "card" });
  });
});

describe("what is like the favourites", () => {
  const tagGroups = [
    {
      name: "Hauptzutat",
      tags: [
        { ref: "lachs", name: "Lachs & Forelle", group: "Hauptzutat" },
        { ref: "haehnchen", name: "Hähnchen & Pute", group: "Hauptzutat" },
      ],
    },
    {
      name: "Gericht",
      tags: [
        { ref: "pasta", name: "Pasta & Nudeln", group: "Gericht" },
        { ref: "reis", name: "Reis & Getreide", group: "Gericht" },
        { ref: "auflauf", name: "Auflauf & Gratin", group: "Gericht" },
      ],
    },
    {
      name: "Küche",
      tags: [
        { ref: "asiatisch", name: "Asiatisch", group: "Küche" },
        { ref: "deutsch", name: "Deutsch & Schwäbisch", group: "Küche" },
      ],
    },
    { name: "Aufwand", tags: [{ ref: "schnell", name: "Schnell", group: "Aufwand" }] },
  ];
  const favorite = summary("teriyaki", {
    ...old,
    title: "Teriyaki-Lachs",
    isFavorite: true,
    proteinType: "fish",
    tags: ["lachs", "asiatisch", "schnell"],
  });
  const gratin = summary("hackgratin", {
    ...old,
    title: "Hack-Gratin",
    isFavorite: true,
    proteinType: "red_meat",
    tags: ["auflauf", "deutsch"],
  });
  const list = [
    favorite,
    gratin,
    // The same fish: like it, and the closest.
    summary("lachsnudeln", { ...old, proteinType: "fish", tags: ["lachs", "asiatisch", "pasta"] }),
    summary("lachsreis", { ...old, proteinType: "fish", tags: ["lachs"] }),
    // A cuisine alone, or with the kind of meal, is not enough.
    summary("curry", { ...old, proteinType: "poultry", tags: ["haehnchen", "asiatisch"] }),
    summary("tofu", { ...old, proteinType: "fish", tags: ["asiatisch"] }),
    // A mushroom risotto is nothing like a mince gratin, German or not.
    summary("pilzrisotto", { ...old, tags: ["reis", "deutsch"] }),
    // A gratin of the same cuisine and kind of meal is.
    summary("kartoffelgratin", { ...old, proteinType: "red_meat", tags: ["auflauf", "deutsch"] }),
    // The effort alone makes nothing alike.
    summary("ruehrei", { ...old, tags: ["schnell"] }),
    summary("kuchen", { ...old, category: "kuchen", tags: ["lachs", "asiatisch"] }),
  ];

  it("brings up meals that share enough with a favourite, the closest first", () => {
    const like = discover(list, { ...options, tagGroups, favorites: [favorite, gratin] }).find(
      (entry) => entry.key === "wie-favoriten",
    )!;
    expect(like.title).toBe("Wie eure Favoriten");
    expect(like.recipes.map((recipe) => recipe.id)).toEqual([
      "lachsnudeln",
      ...["kartoffelgratin", "lachsreis"].sort(
        (a, b) => rank(options.today, a) - rank(options.today, b),
      ),
    ]);
    expect(like.why).toMatchObject({
      lachsnudeln: "Wie „Teriyaki-Lachs“",
      lachsreis: "Wie „Teriyaki-Lachs“",
      kartoffelgratin: "Wie „Hack-Gratin“",
    });
  });

  it("has no such shelf without favourites", () => {
    const keys = discover(list, { ...options, tagGroups }).map((entry) => entry.key);
    expect(keys).not.toContain("wie-favoriten");
  });
});

describe("a cookbook of the day", () => {
  it("offers one with enough recipes nobody marked, another one on another day", () => {
    const books = ["Speed Cooking", "Omas Küche", "Einfach Hausgemacht"];
    const list = books.flatMap((book) =>
      Array.from({ length: 6 }, (_, i) => summary(`${book}-${i}`, { ...old, sourceBook: book })),
    );
    const titles = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map(
      (today) => discover(list, { ...options, today }).find((e) => e.key.startsWith("buch-"))!,
    );
    expect(new Set(titles.map((entry) => entry.title)).size).toBeGreaterThan(1);
    const first = titles[0];
    expect(first.title).toMatch(/^Aus „.+“$/);
    expect(first.total).toBe(6);
    expect(filterRecipes(list, first.filter!)).toHaveLength(6);
  });

  it("has none where no cookbook has enough", () => {
    const keys = discover(recipes, options).map((entry) => entry.key);
    expect(keys.some((key) => key.startsWith("buch-"))).toBe(false);
  });
});

describe("never cooked", () => {
  it("lists meals no plan ever held, once there are plans", () => {
    const history = new Map([["lasagne", "2026-08-10"]]);
    const never = discover(recipes, { ...options, history }).find((e) => e.key === "nie")!;
    expect(never.look).toBe("list");
    expect(never.recipes.map((recipe) => recipe.id).sort()).toEqual(["lachs", "neu", "steak"]);
    expect(discover(recipes, options).some((entry) => entry.key === "nie")).toBe(false);
  });
});

describe("recipeOfTheDay", () => {
  it("picks a meal nobody marked that fits the season, and says why", () => {
    const list = [
      summary("kuerbis", { ...old, season: fits(3, ["Kürbis", "Lauch"]) }),
      summary("lachs", { ...old }),
      summary("kuchen", { ...old, category: "kuchen", season: fits(4, ["Äpfel"]) }),
      summary("fav", { ...old, isFavorite: true, season: fits(5, ["Kürbis"]) }),
    ];
    expect(recipeOfTheDay(list, options)).toEqual({
      recipe: list[0],
      why: "Passt zur Saison: Kürbis, Lauch",
    });
  });

  it("takes any meal outside the season, saying whether it was never cooked", () => {
    const list = [summary("a", old), summary("b", old), summary("c", old)];
    const history = new Map([["x", "2026-10-01"]]);
    const day = recipeOfTheDay(list, { ...options, history })!;
    expect(list).toContain(day.recipe);
    expect(day.why).toBe("Noch nie gekocht");
    // Another day, another recipe sooner or later.
    const week = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map(
      (today) => recipeOfTheDay(list, { today, history })!.recipe.id,
    );
    expect(new Set([day.recipe.id, ...week]).size).toBeGreaterThan(1);
  });

  it("has none in a library of marked recipes only", () => {
    expect(recipeOfTheDay([summary("a", { isFavorite: true })], options)).toBeNull();
  });
});

describe("surprisePool", () => {
  it("draws meals nobody marked, each once", () => {
    const list = [
      ...Array.from({ length: 30 }, (_, i) => summary(`m${i}`, old)),
      summary("fav", { isFavorite: true }),
      summary("kuchen", { category: "kuchen" }),
    ];
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pool = surprisePool(list, random, 10);
    expect(pool).toHaveLength(10);
    expect(new Set(pool).size).toBe(10);
    expect(pool).not.toContain("fav");
    expect(pool).not.toContain("kuchen");
    expect(surprisePool(list, random, 100)).toHaveLength(30);
  });
});

describe("themes", () => {
  const many = (prefix: string, patch: object, count = 5) =>
    Array.from({ length: count }, (_, i) => summary(`${prefix}${i}`, { ...old, ...patch }));
  const library = [
    ...many("quick", { prepMinutes: 20 }),
    ...many("long", { prepMinutes: 90, tags: ["aufwendig"] }),
    ...many("soup", { category: "suppe-eintopf" }),
    ...many("cookie", { category: "plaetzchen" }),
    ...many("grill", { tags: ["grillen"] }),
    // Too few to be offered.
    ...many("pasta", { tags: ["pasta"], prepMinutes: 15 }, 3),
  ];

  it("puts filters together, says plainly what is behind each, and counts it", () => {
    const shown = themes(library, "2026-10-12");
    const evening = shown.find((theme) => theme.key === "feierabend")!;
    expect(evening).toMatchObject({
      title: "Feierabendküche",
      line: "Hauptgerichte in höchstens 30 Minuten",
      // The quick ones, and the grill and pasta recipes of half an hour or less.
      count: 13,
    });
    expect(filterRecipes(library, evening.filter)).toHaveLength(13);
    expect(shown.map((theme) => theme.key)).not.toContain("pasta");
  });

  it("offers a theme of the time of year in its months only, before the others", () => {
    const october = themes(library, "2026-10-12").map((theme) => theme.key);
    expect(october[0]).toBe("suppe");
    expect(october).not.toContain("plaetzchen");
    expect(october).not.toContain("grill");
    const december = themes(library, "2026-12-07").map((theme) => theme.key);
    expect(december.slice(0, 2).sort()).toEqual(["plaetzchen", "suppe"]);
    const july = themes(library, "2026-07-06").map((theme) => theme.key);
    expect(july[0]).toBe("grill");
    expect(july).not.toContain("suppe");
  });

  it("shows six at most", () => {
    const full = [
      ...library,
      ...many("veg", { category: "hauptgericht", proteinType: "vegetarian", prepMinutes: 25 }),
      ...many("fish", { proteinType: "fish", prepMinutes: 25 }),
      ...many("ofen", { tags: ["auflauf"] }),
      ...many("guests", { tags: ["fuer-gaeste"] }),
      ...many("cake", { category: "kuchen" }),
      ...many("away", { tags: ["mitnehmen"] }),
    ];
    expect(themes(full, "2026-10-12")).toHaveLength(6);
  });
});
