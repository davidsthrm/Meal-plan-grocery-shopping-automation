import { describe, expect, it } from "vitest";
import {
  animalIn,
  checkLibrary,
  checkRecipe,
  commonServingsUnits,
  isAnimalProduct,
  servingsChoices,
  servingsChoiceText,
  suggestionText,
  type QualityRecipe,
} from "./quality";

function recipe(patch: Partial<QualityRecipe> = {}): QualityRecipe {
  return {
    id: "r",
    title: "Gemüsepfanne",
    category: "hauptgericht",
    proteinType: "vegetarian",
    prepMinutes: 25,
    servings: { min: 4, max: 4, unit: null },
    tags: ["schnell"],
    ingredients: ["Zucchini", "Paprika", "Zwiebeln", "Olivenöl"],
    checked: [],
    ...patch,
  };
}

const fields = (r: QualityRecipe) => checkRecipe(r).findings.map((finding) => finding.field);

describe("animalIn", () => {
  it("knows meat, poultry and fish by their names", () => {
    expect(animalIn("Speck")).toEqual({ kind: "red_meat", trace: false });
    expect(animalIn("Rinderhackfleisch")).toEqual({ kind: "red_meat", trace: false });
    expect(animalIn("Hähnchenbrust")).toEqual({ kind: "poultry", trace: false });
    expect(animalIn("Putenschnitzel")).toEqual({ kind: "poultry", trace: false });
    expect(animalIn("Lachsfilet")).toEqual({ kind: "fish", trace: false });
    expect(animalIn("200 g Garnelen, geschält")).toEqual({ kind: "fish", trace: false });
  });

  it("names the animal a compound is about: tuna steak is fish", () => {
    expect(animalIn("Thunfischsteak")?.kind).toBe("fish");
    expect(animalIn("Putensteak")?.kind).toBe("poultry");
    expect(animalIn("Lachsschinken")?.kind).toBe("red_meat");
  });

  it("takes a stock or a sauce for a seasoning", () => {
    expect(animalIn("Hühnerbrühe")).toEqual({ kind: "poultry", trace: true });
    expect(animalIn("Fischsauce")).toEqual({ kind: "fish", trace: true });
  });

  it("is not fooled by words that only look like meat", () => {
    for (const name of [
      "Flammkuchenteig",
      "Fleischtomaten",
      "Hirschhornsalz",
      "Parmesanrinde",
      "Austernpilze",
      "Muschelnudeln",
      "Limettensaft",
      "Auberginenkaviar",
      "Wachteleier",
      "Gänseblümchen",
      "Pilzgulasch",
      "Kohlrabischnitzel",
      "Ochsenherztomate",
      "Petersilie, gehackt",
      "gehackte Mandeln",
      "vegane Bratwurst",
    ]) {
      expect(animalIn(name), name).toBeNull();
    }
  });
});

describe("isAnimalProduct", () => {
  it("finds dairy, eggs and honey, not their plant twins", () => {
    expect(isAnimalProduct("Sahne")).toBe(true);
    expect(isAnimalProduct("Eier")).toBe(true);
    expect(isAnimalProduct("geriebener Käse")).toBe(true);
    expect(isAnimalProduct("Kokosmilch")).toBe(false);
    expect(isAnimalProduct("Butternutkürbis")).toBe(false);
    expect(isAnimalProduct("Reis")).toBe(false);
  });
});

describe("the kind of a recipe", () => {
  it("doubts a fish recipe without fish: Käsewaffeln", () => {
    const check = checkRecipe(
      recipe({
        title: "Käsewaffeln",
        proteinType: "fish",
        ingredients: ["Mehl", "Eier", "Milch", "Bergkäse", "Butter"],
      }),
    );
    expect(check.findings).toEqual([
      {
        field: "protein",
        text: "Als Fisch eingetragen, aber kein Fisch unter den Zutaten.",
        weight: 5,
        suggestion: "vegetarian",
      },
    ]);
  });

  it("doubts a vegetarian recipe with bacon, and suggests meat", () => {
    const [finding] = checkRecipe(
      recipe({ ingredients: ["Spätzle", "Speck", "Zwiebeln", "Bergkäse"] }),
    ).findings;
    expect(finding.text).toBe("Als vegetarisch eingetragen, enthält aber Speck.");
    expect(finding.suggestion).toBe("red_meat");
  });

  it("mentions a chicken stock in a vegetarian recipe, without a suggestion", () => {
    const [finding] = checkRecipe(
      recipe({ ingredients: ["Reis", "Erbsen", "Hühnerbrühe", "Parmesan"] }),
    ).findings;
    expect(finding).toMatchObject({ field: "protein", weight: 2, suggestion: null });
  });

  it("doubts a vegan recipe with cream", () => {
    const [finding] = checkRecipe(
      recipe({ proteinType: "vegan", ingredients: ["Nudeln", "Sahne", "Erbsen"] }),
    ).findings;
    expect(finding.suggestion).toBe("vegetarian");
  });

  it("counts the heaviest protein: chicken wrapped in bacon is meat", () => {
    const [finding] = checkRecipe(
      recipe({ proteinType: "poultry", ingredients: ["Hähnchenbrust", "Bacon", "Salbei"] }),
    ).findings;
    expect(finding).toMatchObject({ weight: 2, suggestion: "red_meat" });
  });

  it("asks for a kind that was never set", () => {
    const [finding] = checkRecipe(
      recipe({ proteinType: null, ingredients: ["Lachsfilet", "Dill", "Kartoffeln"] }),
    ).findings;
    expect(finding.suggestion).toBe("fish");
  });

  it("leaves a vegan smoothie with lime juice alone", () => {
    expect(
      fields(
        recipe({
          title: "Beeren-Kokos-Smoothie",
          category: "getraenk",
          proteinType: "vegan",
          servings: { min: 2, max: 2, unit: "Gläser" },
          ingredients: ["Himbeeren", "Kokosmilch", "Banane", "Limettensaft", "Agavendicksaft"],
        }),
      ),
    ).toEqual([]);
  });

  it("finds drinks and cookies by their titles", () => {
    const category = (title: string, filed: string) =>
      checkRecipe(recipe({ title, category: filed }))
        .findings.filter((finding) => finding.field === "category")
        .map((finding) => finding.suggestion);
    expect(category("Erdbeer-Holunder-Bowle", "dessert")).toEqual(["getraenk"]);
    expect(category("Vanillekipferl", "kuchen")).toEqual(["plaetzchen"]);
    expect(category("Schokoladen-Cookies", "hauptgericht")).toEqual(["plaetzchen"]);
    expect(category("Marmorkuchen", "kuchen")).toEqual([]);
    // The last part of the name says what the dish is.
    expect(category("Lebkuchen-Mousse", "dessert")).toEqual([]);
    expect(category("Chai-Latte-Overnight-Oats", "fruehstueck")).toEqual([]);
    expect(category("Krabbencocktail", "salat")).toEqual([]);
  });

  it("accepts what fits, and says nothing without ingredients", () => {
    expect(fields(recipe())).toEqual([]);
    expect(
      fields(recipe({ proteinType: "fish", ingredients: ["Lachsfilet", "Zitrone", "Dill"] })),
    ).toEqual([]);
    expect(fields(recipe({ proteinType: "fish", ingredients: [] }))).toEqual([]);
  });
});

describe("the category", () => {
  it("doubts a soup that is not filed as one", () => {
    const [finding] = checkRecipe(recipe({ title: "Kürbissuppe mit Ingwer" }), (key) =>
      key === "hauptgericht" ? "Hauptgericht" : key,
    ).findings;
    expect(finding).toMatchObject({
      field: "category",
      text: "Der Titel nennt eine Suppe, eingetragen ist Hauptgericht.",
      suggestion: "suppe-eintopf",
    });
  });

  it("doubts a cake filed as a main dish, but not a Flammkuchen", () => {
    expect(checkRecipe(recipe({ title: "Apfelkuchen vom Blech" })).findings[0]).toMatchObject({
      field: "category",
      suggestion: "kuchen",
    });
    expect(fields(recipe({ title: "Flammkuchen mit Lauch" }))).toEqual([]);
  });

  it("doubts a cake with bacon", () => {
    const check = checkRecipe(
      recipe({
        title: "Zwiebelkuchen",
        category: "kuchen",
        proteinType: "red_meat",
        servings: { min: 1, max: 1, unit: "Backblech" },
        ingredients: ["Zwiebeln", "Speck", "Eier", "Mehl"],
      }),
    );
    expect(check.findings.map((f) => [f.field, f.suggestion])).toEqual([
      ["category", "hauptgericht"],
    ]);
  });

  it("does not take the end of Ricotta for a dessert", () => {
    expect(fields(recipe({ title: "Ricotta-Gnocchi mit Salbeibutter" }))).toEqual([]);
  });

  it("asks for a missing category, with what the title says", () => {
    expect(checkRecipe(recipe({ title: "Linsensuppe", category: null })).findings[0]).toEqual({
      field: "category",
      text: "Keine Kategorie eingetragen.",
      weight: 2,
      suggestion: "suppe-eintopf",
    });
  });
});

describe("the time", () => {
  it("doubts a quick recipe that prints more than half an hour", () => {
    const [finding] = checkRecipe(recipe({ prepMinutes: 75 })).findings;
    expect(finding).toMatchObject({ field: "time", suggestion: "aufwendig" });
    expect(suggestionText(finding)).toBe("Braucht Zeit");
  });

  it("doubts a time that cannot be right", () => {
    expect(checkRecipe(recipe({ prepMinutes: 2 })).findings[0]).toMatchObject({
      field: "time",
      weight: 3,
    });
  });

  it("leaves a long effort with a short printed time alone: the print may count the stove only", () => {
    expect(fields(recipe({ prepMinutes: 20, tags: ["aufwendig"] }))).toEqual([]);
  });

  it("notes a recipe whose effort is not known at all", () => {
    expect(fields(recipe({ prepMinutes: null, tags: [] }))).toEqual(["time"]);
  });
});

describe("the servings", () => {
  it("doubts twenty persons", () => {
    expect(fields(recipe({ servings: { min: 20, max: 20, unit: null } }))).toEqual(["servings"]);
  });

  it("asks what a cake for four persons makes", () => {
    expect(
      fields(
        recipe({
          title: "Marmorkuchen",
          category: "kuchen",
          ingredients: ["Mehl", "Zucker", "Kakao"],
        }),
      ),
    ).toEqual(["servings"]);
    expect(
      fields(
        recipe({
          title: "Marmorkuchen",
          category: "kuchen",
          servings: { min: 1, max: 1, unit: "Gugelhupfform" },
        }),
      ),
    ).toEqual([]);
  });
});

describe("checkLibrary", () => {
  it("leaves out fields a person confirmed", () => {
    expect(
      fields(recipe({ title: "Käsewaffeln", proteinType: "fish", checked: ["protein"] })),
    ).toEqual([]);
  });

  it("shows the least trustworthy first and leaves out what fits", () => {
    const checks = checkLibrary([
      recipe({ id: "fine" }),
      recipe({ id: "slow", prepMinutes: 75 }),
      recipe({ id: "fish", proteinType: "fish", prepMinutes: 75 }),
    ]);
    expect(checks.map((check) => [check.recipe.id, check.score])).toEqual([
      ["fish", 7],
      ["slow", 2],
    ]);
  });
});

describe("servings choices", () => {
  it("takes the units the library uses more than once, most used first", () => {
    expect(
      commonServingsUnits([
        { min: 1, max: 1, unit: "Backblech" },
        { min: 12, max: 12, unit: "Muffins" },
        { min: 1, max: 1, unit: "backblech" },
        { min: 12, max: 12, unit: "Muffins" },
        { min: 1, max: 1, unit: "Muffins" },
        { min: 1, max: 1, unit: "Gugelhupfform" },
        { min: 4, max: 4, unit: null },
        null,
      ]),
    ).toEqual(["Muffins", "Backblech"]);
  });

  it("offers one tin or tray, and the number read as pieces", () => {
    const choices = servingsChoices({ min: 20, max: 20, unit: null }, ["Muffins", "Backblech"]);
    expect(choices.map(servingsChoiceText)).toEqual([
      "20 Muffins",
      "1 Backblech",
      "1 Springform (Ø 26 cm)",
      "1 Kastenform",
      "1 Auflaufform",
      "20 Stück",
    ]);
  });

  it("offers a cake for four persons only tins and trays", () => {
    expect(
      servingsChoices({ min: 4, max: 4, unit: null }, ["Muffins"]).map(servingsChoiceText),
    ).toEqual(["1 Springform (Ø 26 cm)", "1 Backblech", "1 Kastenform", "1 Auflaufform"]);
  });
});
