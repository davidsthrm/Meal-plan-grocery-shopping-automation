import { describe, expect, it } from "vitest";
import type { ExtractedIngredient, ExtractedRecipe } from "../import/extraction";
import { pastedRecipe, typedLine } from "./pasted-recipe";
import { parseIngredientLine } from "./typed-recipe";

const ingredient = (patch: Partial<ExtractedIngredient>): ExtractedIngredient => ({
  raw: "",
  quantity: null,
  quantityMax: null,
  unit: null,
  name: "Salz",
  note: "",
  approximate: false,
  optional: false,
  secondaryQuantity: null,
  secondaryUnit: null,
  secondaryScope: "none",
  alternativeTo: null,
  unclear: false,
  ...patch,
});
const recipe = (patch: Partial<ExtractedRecipe>): ExtractedRecipe => ({
  title: "Pestonudeln",
  subtitle: "",
  servingsMin: 2,
  servingsMax: 2,
  servingsRaw: "Für 2 Personen",
  page: null,
  prepMinutes: 15,
  dishType: "hauptgericht",
  proteinType: "vegetarian",
  ingredients: [],
  uncertain: [],
  notes: [],
  ...patch,
});

describe("typedLine", () => {
  it("writes an ingredient the way it is typed on a shopping note", () => {
    expect(typedLine(ingredient({ quantity: 200, unit: "g", name: "Spaghetti" }))).toBe(
      "200 g Spaghetti",
    );
    expect(
      typedLine(
        ingredient({
          quantity: 2,
          quantityMax: 3,
          unit: "Stück",
          name: "Tomaten",
          note: "gewürfelt",
        }),
      ),
    ).toBe("2-3 Tomaten, gewürfelt");
    expect(typedLine(ingredient({ quantity: 0.5, unit: "Bund", name: "Basilikum" }))).toBe(
      "0,5 Bund Basilikum",
    );
    expect(typedLine(ingredient({}))).toBe("Salz");
    // A second measure has no field of its own in the form: it stays as a note.
    expect(
      typedLine(
        ingredient({
          quantity: 1,
          unit: "Stück",
          name: "Feta",
          note: "Block",
          secondaryQuantity: 200,
          secondaryUnit: "g",
          secondaryScope: "total",
        }),
      ),
    ).toBe("1 Feta, Block, 200 g");
  });

  it("writes lines the typed form reads back as the same amounts", () => {
    for (const line of [
      ingredient({ quantity: 200, unit: "g", name: "Spaghetti" }),
      ingredient({
        quantity: 2,
        quantityMax: 3,
        unit: "Stück",
        name: "Tomaten",
        note: "gewürfelt",
      }),
      ingredient({ quantity: 1.5, unit: "EL", name: "Olivenöl" }),
    ]) {
      expect(parseIngredientLine(typedLine(line))).toMatchObject({
        quantity: line.quantity,
        quantityMax: line.quantityMax,
        unit: line.unit,
        name: line.name,
      });
    }
  });
});

describe("pastedRecipe", () => {
  it("fills the form for a new recipe with what was read", () => {
    const read = pastedRecipe(
      recipe({
        ingredients: [
          ingredient({ quantity: 250, unit: "g", name: "Spaghetti" }),
          ingredient({ quantity: 1, unit: "Glas", name: "Pesto" }),
          ingredient({ name: "Parmesan" }),
        ],
      }),
      4,
    );
    expect(read.values).toEqual({
      title: "Pestonudeln",
      category: "hauptgericht",
      protein: "vegetarian",
      servings: "2",
      servingsUnit: "",
      minutes: "15",
      book: "",
      page: "",
      lines: "250 g Spaghetti\n1 Glas Pesto\nParmesan",
    });
    expect(read.check).toEqual([]);
  });

  it("takes over what the text counts instead of persons", () => {
    const cake = pastedRecipe(
      recipe({ servingsMin: null, servingsMax: null, servingsRaw: "Für 1 Springform (26 cm)" }),
      4,
    );
    expect(cake.values).toMatchObject({ servings: "1", servingsUnit: "Springform (26 cm)" });
  });

  it("says what to look at instead of guessing", () => {
    const read = pastedRecipe(
      recipe({
        title: null,
        servingsMin: null,
        servingsMax: null,
        servingsRaw: "",
        dishType: "unbekannt",
        proteinType: "unknown",
        ingredients: [
          ingredient({ raw: "1 Bund Koriander", quantity: 1, unit: "Bund", name: "Koriander" }),
          ingredient({ raw: "oder Petersilie", name: "Petersilie", alternativeTo: 0 }),
          ingredient({ raw: "etwas Öl?", name: "Öl", unclear: true }),
        ],
        uncertain: [{ field: "prepMinutes", reason: "Zwei Zeiten im Text" }],
      }),
      4,
    );
    expect(read.values).toMatchObject({
      title: "",
      category: "",
      protein: "",
      servings: "4",
      lines: "1 Bund Koriander\nÖl",
    });
    expect(read.check).toEqual([
      "Im Text steht kein Titel.",
      "Im Text steht nicht, für wie viele es reicht. Eingetragen ist 4.",
      "Als Alternative weggelassen: oder Petersilie",
      "Bitte prüfen: etwas Öl?",
      "Unsicher (prepMinutes): Zwei Zeiten im Text",
    ]);
  });
});
