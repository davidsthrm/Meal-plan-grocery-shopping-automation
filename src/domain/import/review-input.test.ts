import { describe, expect, it } from "vitest";
import { seedCatalog } from "../../../supabase/seed/catalog";
import { createCatalogIndex } from "../catalog";
import { readReview, type ReviewInput, type ReviewLineInput } from "./review-input";

const index = createCatalogIndex(seedCatalog);

const line = (patch: Partial<ReviewLineInput>): ReviewLineInput => ({
  quantity: "",
  quantityMax: "",
  unit: "",
  ingredient: "Salz",
  note: "",
  optional: false,
  approximate: false,
  alternativeTo: null,
  originalText: "Salz",
  secondary: null,
  ...patch,
});

const form = (patch: Partial<ReviewInput> = {}): ReviewInput => ({
  title: "Avocado Spaghetti",
  sourceBook: "Speed Cooking",
  sourcePage: "97",
  servingsMin: "2",
  servingsMax: "",
  servingsUnit: "",
  prepMinutes: "20",
  lines: [
    line({ quantity: "200", unit: "g", ingredient: "Spaghetti", originalText: "Spaghetti 200 g" }),
    line({
      quantity: "3½",
      unit: "EL",
      ingredient: "Zitronensaft",
      originalText: "Zitronensaft 3½ EL",
    }),
    line({}),
  ],
  ...patch,
});

describe("readReview", () => {
  it("turns a correct form into recipe lines mapped to the catalog", () => {
    const result = readReview(form(), index);
    expect(result).toMatchObject({ ok: true, servings: { min: 2, max: 2 }, page: 97, prep: 20 });
    if (!result.ok) return;
    expect(result.lines.map((l) => [l.ingredientId, l.quantity, l.unit])).toEqual([
      ["spaghetti", 200, "g"],
      ["zitronensaft", 3.5, "EL"],
      ["salz", null, null],
    ]);
  });

  it("accepts a synonym typed by hand and keeps what was printed", () => {
    const result = readReview(
      form({
        lines: [
          line({ quantity: "2", unit: "Stück", ingredient: "Möhren", originalText: "2 Möhren" }),
        ],
      }),
      index,
    );
    expect(result.ok && result.lines[0]).toMatchObject({
      ingredientId: "karotten",
      originalText: "2 Möhren",
      readName: "Möhren",
    });
  });

  it("leaves an ingredient the catalog does not know unmapped, to be proposed", () => {
    const result = readReview(form({ lines: [line({ ingredient: "Topinambur" })] }), index);
    expect(result.ok && result.lines[0]).toMatchObject({
      ingredientId: null,
      readName: "Topinambur",
    });
  });

  it("reads a range and optional servings range, page and time", () => {
    const result = readReview(
      form({
        servingsMin: "4",
        servingsMax: "6",
        sourcePage: "",
        prepMinutes: "",
        lines: [
          line({ quantity: "2", quantityMax: "3", unit: "Stück", ingredient: "Frühlingszwiebeln" }),
        ],
      }),
      index,
    );
    expect(result).toMatchObject({
      ok: true,
      servings: { min: 4, max: 6, unit: null },
      page: null,
      prep: null,
    });
    expect(result.ok && result.lines[0]).toMatchObject({ quantity: 2, quantityMax: 3 });
  });

  it("reads what the recipe makes when it does not count persons", () => {
    const cake = readReview(
      form({ servingsMin: "1", servingsUnit: "  Springform  (Ø 26 cm) " }),
      index,
    );
    expect(cake).toMatchObject({
      ok: true,
      servings: { min: 1, max: 1, unit: "Springform (Ø 26 cm)" },
    });
  });

  it("stores no unit for persons, also when someone types the word", () => {
    for (const typed of ["", "  ", "Personen", "Portionen"]) {
      expect(readReview(form({ servingsUnit: typed }), index), typed).toMatchObject({
        ok: true,
        servings: { min: 2, max: 2, unit: null },
      });
    }
  });

  it("refuses a unit that is longer than the database stores", () => {
    expect(readReview(form({ servingsUnit: "Blech ".repeat(11) }), index)).toEqual({
      ok: false,
      errors: { servingsUnit: "Höchstens 60 Zeichen." },
    });
  });

  it("says what is missing, by field", () => {
    const result = readReview(
      form({ title: " ", servingsMin: "", sourcePage: "siebzehn", lines: [] }),
      index,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "Bitte einen Titel eingeben.",
        servingsMin: "Für wie viele Portionen ist das Rezept?",
        sourcePage: "Die Seite muss eine Zahl sein.",
        lines: "Ein Rezept braucht mindestens eine Zutat.",
      },
    });
  });

  it("says which line is wrong and why", () => {
    const result = readReview(
      form({
        lines: [
          line({ quantity: "viel", unit: "g", ingredient: "Mehl" }),
          line({ quantity: "2", unit: "", ingredient: "Eier" }),
          line({ quantity: "3", quantityMax: "2", unit: "Stück", ingredient: "Tomaten" }),
          line({ ingredient: "" }),
          line({ quantityMax: "3", ingredient: "Zwiebeln" }),
        ],
      }),
      index,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        "line 0": "Die Menge ist keine Zahl.",
        "line 1": "Zur Menge fehlt die Einheit.",
        "line 2": "Die zweite Menge muss größer sein als die erste.",
        "line 3": "Welche Zutat ist das?",
        "line 4": "Bei „bis“ fehlt die erste Menge.",
      },
    });
  });

  it("drops an alternative that points outside the submitted lines", () => {
    const result = readReview(
      form({ lines: [line({ alternativeTo: 7 }), line({ alternativeTo: 0 })] }),
      index,
    );
    expect(result.ok && result.lines.map((l) => l.alternativeTo)).toEqual([null, 0]);
  });
});
