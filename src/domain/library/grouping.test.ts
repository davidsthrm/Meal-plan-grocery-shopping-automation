import { describe, expect, it } from "vitest";
import {
  BY_EFFORT,
  BY_KIND,
  byTag,
  groupRecipes,
  readWishGrouping,
  wishGrouping,
} from "./grouping";
import { summary } from "./testing";

const recipes = [
  summary("Steak", { proteinType: "red_meat" }),
  summary("Lachs", { proteinType: "fish" }),
  summary("Linsencurry", { proteinType: "vegan", tags: ["indisch"] }),
  summary("Apfelkuchen", { category: "kuchen", proteinType: "vegetarian" }),
  summary("Brot", { proteinType: null, tags: ["italienisch"] }),
  summary("Gemüselasagne", { tags: ["italienisch"] }),
  summary("Hähnchen", { proteinType: "poultry" }),
];
const shown = (groups: ReturnType<typeof groupRecipes>) =>
  groups.map((group) => [group.key, group.recipes.map((recipe) => recipe.id)]);

describe("groupRecipes by kind", () => {
  it("sorts recipes into the kinds of the week, cakes apart, the rest last", () => {
    expect(shown(groupRecipes(recipes, BY_KIND))).toEqual([
      ["vegetarian", ["Gemüselasagne", "Linsencurry"]],
      ["fish", ["Lachs"]],
      ["poultry", ["Hähnchen"]],
      ["red_meat", ["Steak"]],
      ["sweet", ["Apfelkuchen"]],
      [null, ["Brot"]],
    ]);
  });

  it("leaves out kinds without a recipe", () => {
    expect(shown(groupRecipes([recipes[1]], BY_KIND))).toEqual([["fish", ["Lachs"]]]);
    expect(groupRecipes([], BY_KIND)).toEqual([]);
  });
});

describe("groupRecipes by tag", () => {
  it("groups by a recipe's tag of a group, in the order of the tags", () => {
    expect(shown(groupRecipes(recipes, byTag(["italienisch", "indisch"])))).toEqual([
      ["italienisch", ["Brot", "Gemüselasagne"]],
      ["indisch", ["Linsencurry"]],
      [null, ["Apfelkuchen", "Hähnchen", "Lachs", "Steak"]],
    ]);
  });
});

describe("groupRecipes by effort", () => {
  it("goes by the effort tag, or by the printed time without one", () => {
    const efforts = [
      summary("Gulasch", { tags: ["aufwendig"], prepMinutes: 20 }),
      summary("Omelett", { tags: [], prepMinutes: 15 }),
      summary("Eintopf", { tags: [], prepMinutes: null }),
    ];
    expect(shown(groupRecipes(efforts, BY_EFFORT))).toEqual([
      ["schnell", ["Omelett"]],
      ["aufwendig", ["Gulasch"]],
      [null, ["Eintopf"]],
    ]);
  });
});

describe("wishGrouping", () => {
  const tagGroups = [
    {
      name: "Küche",
      tags: [
        { ref: "italienisch", name: "Italienisch", group: "Küche" },
        { ref: "indisch", name: "Indisch", group: "Küche" },
      ],
    },
  ];

  it("groups by the household's tags of the group it names", () => {
    expect(shown(groupRecipes(recipes, wishGrouping("kueche", tagGroups)))[0]).toEqual([
      "italienisch",
      ["Brot", "Gemüselasagne"],
    ]);
    expect(groupRecipes(recipes, wishGrouping("saison", tagGroups))).toEqual([
      { key: null, recipes: expect.any(Array) },
    ]);
  });

  it("reads the way from the address, by kind unless it knows it", () => {
    expect(readWishGrouping("kueche")).toBe("kueche");
    expect(readWishGrouping("x")).toBe("art");
    expect(readWishGrouping(undefined)).toBe("art");
  });
});
