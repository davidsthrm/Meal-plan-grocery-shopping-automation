import { describe, expect, it } from "vitest";
import { BY_KIND, byTag, groupRecipes } from "./grouping";
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
