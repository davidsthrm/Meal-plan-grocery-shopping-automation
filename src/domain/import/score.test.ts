import { describe, expect, it } from "vitest";
import fixtures from "../../../tests/fixtures/sample-week/recipes.json";
import { extractedRecipeSchema } from "./extraction";
import { scoreExtraction, type ExpectedRecipe } from "./score";
import { flawless } from "./testing";

const recipes = fixtures.recipes as ExpectedRecipe[];
const byId = (id: string) => recipes.find((r) => r.id === id)!;

describe("extraction schema", () => {
  it("accepts a flawless reading of every sample recipe", () => {
    for (const recipe of recipes) {
      expect(extractedRecipeSchema.safeParse(flawless(recipe)).success, recipe.id).toBe(true);
    }
  });

  it("rejects a unit outside the allowed set", () => {
    const reading = flawless(byId("IMG_5683"));
    reading.ingredients[0].unit = "cup";
    expect(extractedRecipeSchema.safeParse(reading).success).toBe(false);
  });
});

describe("scoreExtraction", () => {
  it("scores a flawless reading as perfect, for all five sample recipes", () => {
    for (const recipe of recipes) {
      const score = scoreExtraction(recipe, flawless(recipe));
      expect(score, recipe.id).toMatchObject({
        perfect: true,
        missing: [],
        extra: [],
        mistakes: [],
      });
      expect(score.matchedLines).toBe(score.expectedLines);
    }
  });

  it("counts the alternative ingredient as its own line", () => {
    // 10 printed ingredients, one of them with "oder Petersilie".
    expect(scoreExtraction(byId("IMG_5682"), flawless(byId("IMG_5682"))).expectedLines).toBe(11);
  });

  it("catches a misread fraction", () => {
    const reading = flawless(byId("IMG_5684"));
    const lemon = reading.ingredients.find((i) => i.name === "Zitronensaft")!;
    lemon.quantity = 0.5; // "3½ EL" read as "½ EL"
    const score = scoreExtraction(byId("IMG_5684"), reading);
    expect(score.perfect).toBe(false);
    expect(score.mistakes).toEqual([
      { where: "Zitronensaft 3½ EL [Zitronensaft]", field: "quantity", expected: 3.5, actual: 0.5 },
    ]);
  });

  it("catches a wrong unit and a collapsed range", () => {
    const reading = flawless(byId("IMG_5683"));
    reading.ingredients.find((i) => i.name === "Öl")!.unit = "TL";
    reading.ingredients.find((i) => i.name === "Frühlingszwiebeln")!.quantityMax = null;
    const fields = scoreExtraction(byId("IMG_5683"), reading).mistakes.map((m) => m.field);
    expect(fields.sort()).toEqual(["quantityMax", "unit"]);
  });

  it("catches an invented title", () => {
    const reading = flawless(byId("IMG_5685"));
    reading.title = "Linsensalat mit Salami";
    expect(scoreExtraction(byId("IMG_5685"), reading).mistakes).toEqual([
      { where: "recipe", field: "title", expected: null, actual: "Linsensalat mit Salami" },
    ]);
  });

  it("catches a guessed scope for an ambiguous second measure", () => {
    const reading = flawless(byId("IMG_5683"));
    reading.ingredients.find((i) => i.name === "Möhren")!.secondaryScope = "total";
    expect(scoreExtraction(byId("IMG_5683"), reading).mistakes).toMatchObject([
      { field: "secondaryScope", expected: "unknown", actual: "total" },
    ]);
  });

  it("catches an ingredient the steps call optional but the reading does not", () => {
    const reading = flawless(byId("IMG_5684"));
    reading.ingredients.find((i) => i.name === "Chiliflocken")!.optional = false;
    expect(scoreExtraction(byId("IMG_5684"), reading).mistakes).toMatchObject([
      { field: "optional", expected: true, actual: false },
    ]);
  });

  it("reports missing and extra lines", () => {
    const reading = flawless(byId("IMG_5680"));
    reading.ingredients = reading.ingredients.filter((i) => i.name !== "Sahne");
    // The vegetarian tip on that page must not become an ingredient.
    reading.ingredients.push({
      ...reading.ingredients[0],
      raw: "eine Zwiebel",
      name: "Zwiebel",
      quantity: 1,
    });
    const score = scoreExtraction(byId("IMG_5680"), reading);
    expect(score.missing).toEqual(["150 ml Sahne [Sahne]"]);
    expect(score.extra).toEqual(["eine Zwiebel [Zwiebel]"]);
  });

  it("accepts garlic counted in cloves instead of pieces of 'Knoblauchzehe'", () => {
    const reading = flawless(byId("IMG_5680"));
    const garlic = reading.ingredients.find((i) => i.name === "Knoblauchzehe")!;
    garlic.unit = "Zehe";
    garlic.name = "Knoblauch";
    expect(scoreExtraction(byId("IMG_5680"), reading).perfect).toBe(true);
  });

  it("tells salt from pepper when both are printed on one line", () => {
    const reading = flawless(byId("IMG_5680"));
    reading.ingredients = reading.ingredients.filter((i) => i.name !== "Pfeffer");
    expect(scoreExtraction(byId("IMG_5680"), reading).missing).toEqual(["Salz, Pfeffer [Pfeffer]"]);
  });
});
