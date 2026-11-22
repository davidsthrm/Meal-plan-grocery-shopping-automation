import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "@/domain/catalog";
import { buildShoppingList } from "@/domain/shopping-list/build";
import { resolveLine } from "@/domain/shopping-list/present";
import { singleTrip } from "@/domain/shopping-list/trips";
import type { ShoppingLine } from "@/domain/shopping-list/types";
import { convert, dimensionOf, type Unit } from "@/domain/units";
import { line } from "@/domain/shopping-list/test-catalog";
import { seedCatalog } from "../../supabase/seed/catalog";
import { seedRecipes } from "../../supabase/seed/recipes";

/**
 * Every seed recipe on a list of its own, at its own servings and for four, held against
 * what no line may read. The household's library read "10 EL Limettensaft", "5 l
 * Haferdrink" and "1 Blatt Lorbeerblätter" (audit of 21 November 2026).
 */

const index = createCatalogIndex(seedCatalog);
const DATE = "2026-11-23";

const lines = seedRecipes.flatMap((recipe) =>
  [...new Set([recipe.servings.min, 4])].flatMap((servings) =>
    buildShoppingList({
      index,
      recipes: [recipe],
      trips: singleTrip(DATE),
      onDemand: [],
      slots: [
        {
          id: "s",
          date: DATE,
          meal: "dinner",
          kind: "recipes",
          items: [{ recipeId: recipe.id, servings }],
        },
      ],
    }).map((line) => ({ line, text: resolveLine(line).text, of: `${recipe.title}, ${servings}` })),
  ),
);

/** The lines that read wrong, as "text (recipe, servings)". */
const wrong = (test: (line: ShoppingLine, text: string) => boolean) =>
  lines.filter(({ line, text }) => test(line, text)).map(({ text, of }) => `${text} (${of})`);

const measured = (unit: Unit) => ["mass", "volume"].includes(dimensionOf(unit));

/** A unit's word, as it stands before the name or in it. */
const UNIT_WORD: Partial<Record<Unit, RegExp>> = {
  Blatt: /blatt|blätter/gi,
  Knolle: /knolle/gi,
  Kopf: /kopf|köpfe/gi,
  Zehe: /zehe/gi,
  Scheibe: /scheibe/gi,
  Stange: /stange/gi,
  Zweig: /zweig/gi,
  Stängel: /stängel/gi,
  Bund: /bund/gi,
  Glas: /glas|gläser/gi,
  Becher: /becher/gi,
  Beutel: /beutel/gi,
  Würfel: /würfel/gi,
  Dose: /dose/gi,
};

describe("every seed recipe on a list", () => {
  it("is read at all", () => {
    expect(lines.length).toBeGreaterThan(50);
  });

  it("shows no amount in spoons, pinches or handfuls", () => {
    const spoons: Unit[] = ["EL", "TL", "Prise", "Msp", "Handvoll"];
    expect(wrong(({ purchase }) => purchase !== null && spoons.includes(purchase.unit))).toEqual(
      [],
    );
  });

  it("buys no weight or volume of more than 50 times what is needed", () => {
    const tooMuch = ({ purchase, amounts }: ShoppingLine) => {
      if (!purchase || !measured(purchase.unit)) return false;
      const needed = amounts
        .map((exact) => convert(exact.quantity, exact.unit, purchase.unit))
        .find((each) => each !== null);
      return needed != null && purchase.quantity > 50 * needed;
    };
    expect(wrong(tooMuch)).toEqual([]);
  });

  it("says a unit once", () => {
    const twice = ({ purchase }: ShoppingLine, text: string) => {
      const word = purchase && UNIT_WORD[purchase.unit];
      return Boolean(word && (text.match(word) ?? []).length > 1);
    };
    expect(wrong(twice)).toEqual([]);
  });

  it("counts whole pieces", () => {
    const part = ({ purchase }: ShoppingLine) =>
      purchase !== null && !measured(purchase.unit) && !Number.isInteger(purchase.quantity);
    expect(wrong(part)).toEqual([]);
  });
});

describe("parts on the seed catalog", () => {
  // As David decided on 22 November 2026.
  const week = (...parts: [string, number | null, Unit | null][]) =>
    buildShoppingList({
      index,
      recipes: parts.map(([id, quantity, unit], at) => ({
        id: `r${at}`,
        title: `r${at}`,
        kind: "cookbook",
        servings: { min: 4, max: 4, unit: null },
        ingredients: [line(id, quantity, unit)],
      })),
      trips: singleTrip(DATE),
      onDemand: [],
      slots: parts.map((_, at) => ({
        id: `s${at}`,
        date: DATE,
        meal: "dinner",
        kind: "recipes",
        items: [{ recipeId: `r${at}`, servings: 4 }],
      })),
    }).map((each) => ({ text: resolveLine(each).text, atHome: each.defaultAtHome }));

  it("buys the whole", () => {
    expect(week(["knoblauch", 8, "Zehe"])).toEqual([{ text: "1 Knolle Knoblauch", atHome: true }]);
    expect(week(["thymian", 12, "Zweig"])).toEqual([{ text: "2 Bund Thymian", atHome: false }]);
    expect(week(["fruehlingszwiebeln", 1, "Bund"], ["fruehlingszwiebeln", 4, "Stück"])).toEqual([
      { text: "2 Bund Frühlingszwiebeln", atHome: false },
    ]);
    expect(week(["zitronenschale", 2, "TL"])).toEqual([{ text: "1x Zitrone Bio", atHome: false }]);
  });

  it("has lemon and lime juice at home and buys orange juice", () => {
    expect(week(["zitronensaft", 2, "EL"], ["limettensaft", 1, "EL"])).toEqual([
      { text: "Zitronensaft", atHome: true },
      { text: "Limettensaft", atHome: true },
    ]);
    expect(week(["orangensaft", 200, "ml"])).toEqual([
      { text: "200 ml Orangensaft", atHome: false },
    ]);
  });
});
