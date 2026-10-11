import { describe, expect, it } from "vitest";
import { seedCatalog } from "../../../supabase/seed/catalog";
import fixtures from "../../../tests/fixtures/sample-week/recipes.json";
import { createCatalogIndex } from "../catalog";
import { toDraft } from "./draft";
import { suggestionSchema, toProposals, unmappedNames, type Suggestions } from "./proposal";
import type { ExpectedRecipe } from "./score";
import { flawless } from "./testing";

const index = createCatalogIndex(seedCatalog);
const aisleNames = seedCatalog.aisleGroups.map((a) => a.name);

function suggestion(
  patch: Partial<Suggestions["suggestions"][number]>,
): Suggestions["suggestions"][number] {
  return {
    name: "Pak Choi",
    sameAs: null,
    aisleGroup: "Obst & Gemüse",
    defaultUnit: "Stück",
    buyingMode: "count",
    packSize: null,
    isPantryStaple: false,
    shelfLifeDays: 4,
    ...patch,
  };
}

describe("unmappedNames", () => {
  it("lists each unknown ingredient once, and nothing for the sample recipes", () => {
    const expected = fixtures.recipes as ExpectedRecipe[];
    for (const recipe of expected) {
      expect(unmappedNames(toDraft(flawless(recipe), {}, index)), recipe.id).toEqual([]);
    }
    const reading = flawless(expected[0]);
    reading.ingredients[1] = { ...reading.ingredients[1], raw: "250 g Pak Choi", name: "Pak Choi" };
    reading.ingredients[2] = { ...reading.ingredients[2], raw: "1 Pak Choi", name: "Pak Choi" };
    expect(unmappedNames(toDraft(reading, {}, index))).toEqual(["Pak Choi"]);
  });
});

describe("toProposals", () => {
  it("places a new ingredient in its aisle and in the shop that aisle is usually bought in", () => {
    expect(toProposals(["Pak Choi"], [suggestion({})], index)).toEqual([
      {
        name: "Pak Choi",
        sameAsIngredientId: null,
        aisleGroupId: "obst",
        preferredShopId: "aldi",
        defaultUnit: "Stück",
        buyingMode: "count",
        packSize: null,
        isPantryStaple: false,
        shelfLifeDays: 4,
      },
    ]);
    const steak = suggestion({
      name: "Kalbsschnitzel",
      aisleGroup: "Fleisch & Wurst",
      shelfLifeDays: 2,
    });
    expect(toProposals(["Kalbsschnitzel"], [steak], index)[0]).toMatchObject({
      aisleGroupId: "fleisch",
      preferredShopId: "ec",
    });
  });

  it("recognises another name for an ingredient the catalog already has", () => {
    const [proposal] = toProposals(
      ["Porreestange"],
      [suggestion({ name: "Porreestange", sameAs: "Lauch" })],
      index,
    );
    expect(proposal.sameAsIngredientId).toBe("lauch");
  });

  it("drops a 'same as' that is not in the catalog", () => {
    const [proposal] = toProposals(["Pak Choi"], [suggestion({ sameAs: "Chinakohl" })], index);
    expect(proposal.sameAsIngredientId).toBeNull();
  });

  it("does not accept a pack ingredient without a pack size", () => {
    const [noSize] = toProposals(
      ["Pak Choi"],
      [suggestion({ buyingMode: "pack", packSize: null })],
      index,
    );
    expect(noSize).toMatchObject({ buyingMode: "none", packSize: null });
    const [sized] = toProposals(
      ["Pak Choi"],
      [suggestion({ buyingMode: "pack", packSize: 200, defaultUnit: "g" })],
      index,
    );
    expect(sized).toMatchObject({ buyingMode: "pack", packSize: 200 });
  });

  it("sums an ingredient bought by weight in grams, whatever unit was suggested", () => {
    const [proposal] = toProposals(
      ["Pak Choi"],
      [suggestion({ buyingMode: "weight", defaultUnit: "Stück" })],
      index,
    );
    expect(proposal).toMatchObject({ buyingMode: "weight", defaultUnit: "g" });
  });

  it("still proposes a name the model skipped, in the fallback aisle", () => {
    expect(toProposals(["Tonkabohne"], [], index)).toEqual([
      {
        name: "Tonkabohne",
        sameAsIngredientId: null,
        aisleGroupId: "sonstiges",
        preferredShopId: "aldi",
        defaultUnit: "Stück",
        buyingMode: "none",
        packSize: null,
        isPantryStaple: false,
        shelfLifeDays: null,
      },
    ]);
  });
});

describe("suggestionSchema", () => {
  it("only accepts the household's own aisle groups", () => {
    const schema = suggestionSchema(aisleNames);
    expect(schema.safeParse({ suggestions: [suggestion({})] }).success).toBe(true);
    expect(
      schema.safeParse({ suggestions: [suggestion({ aisleGroup: "Asia-Regal" })] }).success,
    ).toBe(false);
  });
});
