import { describe, expect, it } from "vitest";
import { activeCount, activeFilters, facets } from "./facets";
import { NO_FILTER, type RecipeFilter } from "./filter";
import { summary } from "./testing";

const recipes = [
  summary("lachs", { proteinType: "fish", prepMinutes: 20, tags: ["schnell", "asiatisch"] }),
  summary("steak", { proteinType: "red_meat", prepMinutes: 40, tags: ["alltag", "deutsch"] }),
  summary("curry", { proteinType: "vegetarian", prepMinutes: 30, tags: ["schnell", "asiatisch"] }),
  summary("kuchen", { category: "kuchen", prepMinutes: 90, tags: ["aufwendig"] }),
];
const tagGroups = [
  {
    name: "Aufwand",
    tags: [
      { ref: "schnell", name: "Schnell", group: "Aufwand" },
      { ref: "alltag", name: "Alltagsküche", group: "Aufwand" },
      { ref: "aufwendig", name: "Braucht Zeit", group: "Aufwand" },
    ],
  },
  {
    name: "Küche",
    tags: [
      { ref: "asiatisch", name: "Asiatisch", group: "Küche" },
      { ref: "deutsch", name: "Deutsch & Schwäbisch", group: "Küche" },
    ],
  },
];
const options = {
  categories: [
    { key: "hauptgericht", name: "Hauptgericht" },
    { key: "kuchen", name: "Kuchen & Gebäck" },
  ],
  tagGroups,
  books: [],
};
const groupOf = (filter: RecipeFilter, key: string, extra = {}) =>
  facets(recipes, filter, { ...options, ...extra }).find((group) => group.key === key)!;
const option = (filter: RecipeFilter, group: string, key: string) =>
  groupOf(filter, group).options.find((entry) => entry.key === key)!;

describe("facets", () => {
  it("says how many recipes each choice leaves, together with what is on", () => {
    expect(option(NO_FILTER, "zeit", "zeit-30").count).toBe(2);
    const fish = { ...NO_FILTER, diet: "fisch" as const };
    expect(option(fish, "zeit", "zeit-30").count).toBe(1);
    expect(option(fish, "kost", "kost-fisch")).toMatchObject({ on: true, count: 1 });
    // Another diet replaces the one that is on, and counts as if it alone were on.
    expect(option(fish, "kost", "kost-fleisch")).toMatchObject({
      on: false,
      count: 1,
      filter: { diet: "fleisch" },
    });
  });

  it("takes a choice away again with a second tap", () => {
    const quick = { ...NO_FILTER, maxMinutes: 20 };
    expect(option(quick, "zeit", "zeit-20").filter.maxMinutes).toBeNull();
  });

  it("replaces a tag in a group of one, and adds one elsewhere", () => {
    const asian = { ...NO_FILTER, tags: ["asiatisch", "schnell"] };
    expect(option(asian, "gruppe-Küche", "tag-deutsch").filter.tags).toEqual([
      "schnell",
      "deutsch",
    ]);
    expect(groupOf(asian, "gruppe-Küche").single).toBe(true);
    expect(option(asian, "gruppe-Aufwand", "tag-alltag").filter.tags).toEqual([
      "asiatisch",
      "alltag",
    ]);
  });

  it("offers the season, the plans and the favourites only where a page knows them", () => {
    expect(facets(recipes, NO_FILTER, options).some((group) => group.key === "auswahl")).toBe(
      false,
    );
    const special = groupOf(NO_FILTER, "auswahl", { season: true, longAgo: true, favorites: true });
    expect(special.options.map((entry) => entry.label)).toEqual([
      "Passt zur Saison",
      "Lange nicht gekocht",
      "Favoriten",
    ]);
  });

  it("lists what is on, each to take away on its own", () => {
    const filter = { ...NO_FILTER, diet: "fisch" as const, tags: ["schnell"] };
    const active = activeFilters(facets(recipes, filter, options));
    expect(active.map((entry) => entry.label)).toEqual(["Fisch", "Schnell"]);
    expect(active[0].without).toMatchObject({ diet: null, tags: ["schnell"] });
    expect(activeCount(filter)).toBe(2);
    expect(activeCount({ ...NO_FILTER, text: "Lachs" })).toBe(0);
    expect(activeCount({ ...filter, favorites: true }, { favorites: false })).toBe(2);
  });
});
