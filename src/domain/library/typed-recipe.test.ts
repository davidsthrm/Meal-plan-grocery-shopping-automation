import { describe, expect, it } from "vitest";
import { seedCatalog } from "../../../supabase/seed/catalog";
import { createCatalogIndex } from "../catalog";
import { parseIngredientLine, readTypedRecipe, type TypedRecipeInput } from "./typed-recipe";

const index = createCatalogIndex(seedCatalog);

describe("parseIngredientLine", () => {
  const line = (text: string) => parseIngredientLine(text);

  it("reads amount, unit and name", () => {
    expect(line("200 g Spaghetti")).toEqual({
      quantity: 200,
      quantityMax: null,
      unit: "g",
      name: "Spaghetti",
      note: null,
    });
    expect(line("1 Glas Pesto")).toMatchObject({ quantity: 1, unit: "Glas", name: "Pesto" });
    expect(line("500g Mehl")).toMatchObject({ quantity: 500, unit: "g", name: "Mehl" });
    expect(line("2 EL Olivenöl")).toMatchObject({ quantity: 2, unit: "EL", name: "Olivenöl" });
  });

  it("counts pieces when a number has no unit", () => {
    expect(line("3 Eier")).toMatchObject({ quantity: 3, unit: "Stück", name: "Eier" });
    // "Dose" alone after the number is the thing itself, not a unit of nothing.
    expect(line("1 Dose")).toMatchObject({ quantity: 1, unit: "Stück", name: "Dose" });
  });

  it("reads fractions, decimals and ranges", () => {
    expect(line("½ Bund Basilikum")).toMatchObject({ quantity: 0.5, unit: "Bund" });
    expect(line("1 ½ l Milch")).toMatchObject({ quantity: 1.5, unit: "l", name: "Milch" });
    expect(line("1 1/2 kg Kartoffeln")).toMatchObject({ quantity: 1.5, unit: "kg" });
    expect(line("0,5 l Sahne")).toMatchObject({ quantity: 0.5, unit: "l" });
    expect(line("2-3 Tomaten")).toMatchObject({ quantity: 2, quantityMax: 3, unit: "Stück" });
    expect(line("2 bis 3 EL Öl")).toMatchObject({ quantity: 2, quantityMax: 3, unit: "EL" });
  });

  it("takes what follows a comma as a note", () => {
    expect(line("2 Zwiebeln, fein gewürfelt")).toMatchObject({
      name: "Zwiebeln",
      note: "fein gewürfelt",
    });
  });

  it("leaves a line without an amount as it is", () => {
    expect(line("Parmesan")).toEqual({
      quantity: null,
      quantityMax: null,
      unit: null,
      name: "Parmesan",
      note: null,
    });
    expect(line("Salz, Pfeffer")).toMatchObject({ name: "Salz", note: "Pfeffer" });
    // A number that belongs to the name is no amount.
    expect(line("5-Minuten-Terrine")).toMatchObject({ quantity: null, name: "5-Minuten-Terrine" });
  });

  it("skips empty lines and notices an amount without a name", () => {
    expect(line("   ")).toBeNull();
    expect(line("200 g")).toMatchObject({ quantity: 200, unit: "Stück", name: "g" });
    expect(line("200")).toMatchObject({ quantity: null, name: "200" });
  });
});

describe("readTypedRecipe", () => {
  const form = (patch: Partial<TypedRecipeInput> = {}): TypedRecipeInput => ({
    title: "Pestonudeln",
    category: "hauptgericht",
    protein: "vegetarian",
    servings: "4",
    servingsUnit: "",
    minutes: "15",
    book: "",
    page: "",
    lines: "500 g Spaghetti\n\n1 Glas Pesto\nParmesan\n200 g Topinambur",
    ...patch,
  });

  it("turns the form into a recipe with its lines mapped to the catalog", () => {
    const result = readTypedRecipe(form(), index);
    expect(result).toMatchObject({
      ok: true,
      recipe: {
        title: "Pestonudeln",
        sourceBook: null,
        servings: { min: 4, max: 4, unit: null },
        prepMinutes: 15,
        dishType: "hauptgericht",
        proteinType: "vegetarian",
      },
    });
    const lines = result.ok ? (result.recipe.lines ?? []) : [];
    expect(lines.map((entry) => [entry.ingredientId, entry.quantity, entry.unit])).toEqual([
      ["spaghetti", 500, "g"],
      ["pesto", 1, "Glas"],
      ["parmesan", null, null],
      // Not in the catalog: kept as typed and proposed later.
      [null, 200, "g"],
    ]);
    expect(lines[3]).toMatchObject({ readName: "Topinambur", originalText: "200 g Topinambur" });
  });

  it("stores what a recipe makes when that is not persons", () => {
    const cake = readTypedRecipe(form({ servings: "1", servingsUnit: " Springform " }), index);
    expect(cake).toMatchObject({ ok: true, recipe: { servings: { min: 1, unit: "Springform" } } });
    const persons = readTypedRecipe(form({ servingsUnit: "Personen" }), index);
    expect(persons).toMatchObject({ ok: true, recipe: { servings: { unit: null } } });
  });

  it("files a recipe without a category or diet as unknown", () => {
    expect(readTypedRecipe(form({ category: "", protein: "" }), index)).toMatchObject({
      ok: true,
      recipe: { dishType: "unbekannt", proteinType: "unknown" },
    });
  });

  it("says what is missing, by field", () => {
    expect(
      readTypedRecipe(form({ title: " ", servings: "0", minutes: "kurz", lines: "\n \n" }), index),
    ).toEqual({
      ok: false,
      errors: {
        title: "Wie heißt das Gericht?",
        servings: "Für wie viele reicht es? Eine Zahl ab 1.",
        minutes: "Die Zeit in Minuten, als Zahl.",
        lines: "Mindestens eine Zutat, eine pro Zeile.",
      },
    });
  });

  it("can leave the ingredients out, for a recipe whose lines came from a photo", () => {
    expect(readTypedRecipe(form({ lines: null }), index)).toMatchObject({
      ok: true,
      recipe: { lines: null },
    });
  });
});
