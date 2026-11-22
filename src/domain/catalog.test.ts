import { describe, expect, it } from "vitest";
import {
  aisleSortOrder,
  convertFor,
  createCatalogIndex,
  findIngredient,
  nameForOne,
  normalizeName,
  wholesOf,
} from "./catalog";
import { testCatalog, testIndex } from "./shopping-list/test-catalog";

describe("normalizeName", () => {
  it("ignores case, hyphens, dots, spaces and brackets", () => {
    expect(normalizeName("Gouda-Scheiben")).toBe(normalizeName("Gouda (Scheiben)"));
    expect(normalizeName("Frühl.zwiebeln")).toBe(normalizeName("frühl zwiebeln"));
    expect(normalizeName("Linsen-Eintopf")).toBe(normalizeName("Linseneintopf"));
  });

  it("treats umlauts, ß and accents like their plain spellings", () => {
    expect(normalizeName("Möhren")).toBe(normalizeName("Moehren"));
    expect(normalizeName("Weißweinessig")).toBe(normalizeName("Weissweinessig"));
    expect(normalizeName("Crème fraîche")).toBe(normalizeName("Creme fraiche"));
  });
});

describe("findIngredient", () => {
  it("finds an ingredient by name, synonym or abbreviation", () => {
    expect(findIngredient(testIndex, "Karotten")?.id).toBe("karotten");
    expect(findIngredient(testIndex, "möhren")?.id).toBe("karotten");
    expect(findIngredient(testIndex, "kl. Tomaten")?.id).toBe("kleine-tomaten");
  });

  it("returns undefined for unknown or empty text", () => {
    expect(findIngredient(testIndex, "Drachenfrucht")).toBeUndefined();
    expect(findIngredient(testIndex, " - ")).toBeUndefined();
  });
});

describe("createCatalogIndex", () => {
  it("rejects a name that points at two ingredients", () => {
    const clash = {
      ...testCatalog,
      ingredients: [
        ...testCatalog.ingredients,
        { ...testCatalog.ingredients[0], id: "rueben", name: "Rüben", synonyms: ["Möhren"] },
      ],
    };
    expect(() => createCatalogIndex(clash)).toThrow(/"Möhren" is a name of both/);
  });
});

describe("aisleSortOrder", () => {
  it("uses the default order unless the shop places the aisle elsewhere", () => {
    expect(aisleSortOrder(testIndex, "aldi", "brot")).toBe(60);
    expect(aisleSortOrder(testIndex, "ec", "brot")).toBe(85);
    expect(aisleSortOrder(testIndex, "ec", "molkerei")).toBe(70);
  });
});

describe("nameForOne", () => {
  it("finds the singular among the other names", () => {
    expect(nameForOne({ name: "Schalotten", synonyms: ["Schalotte"] })).toBe("Schalotte");
    expect(nameForOne({ name: "Eier", synonyms: ["Ei", "Hühnereier"] })).toBe("Ei");
    expect(nameForOne({ name: "Karotten", synonyms: ["Möhren", "Karotte"] })).toBe("Karotte");
  });

  it("finds a singular without the plural's umlaut", () => {
    // The note said "1x Äpfel".
    expect(nameForOne({ name: "Äpfel", synonyms: ["Apfel"] })).toBe("Apfel");
    expect(nameForOne({ name: "Walnüsse", synonyms: ["Walnuss"] })).toBe("Walnuss");
  });

  it("keeps the name where no other name is its singular", () => {
    expect(nameForOne({ name: "Ingwer", synonyms: ["frischer Ingwer"] })).toBe("Ingwer");
    expect(nameForOne({ name: "Tomaten", synonyms: ["Tomatenmark"] })).toBe("Tomaten");
    expect(nameForOne({ name: "Äpfel", synonyms: ["äpfel", "Äpfelchen"] })).toBe("Äpfel");
    // Named in the singular, with the plural among the other names.
    expect(nameForOne({ name: "Biskuitboden", synonyms: ["Biskuitböden"] })).toBe("Biskuitboden");
  });
});

describe("wholesOf and convertFor", () => {
  const ginger = testIndex.ingredientById.get("ingwer")!;
  const garlic = {
    ...ginger,
    defaultUnit: "Zehe" as const,
    whole: { ingredientId: null, unit: "Knolle" as const, parts: { Zehe: 10 } },
  };
  const zest = {
    ...ginger,
    defaultUnit: "TL" as const,
    whole: { ingredientId: "zitronen", unit: null, parts: { TL: 3, Stück: 1 } },
  };

  it("counts the wholes of a part, in any unit the part converts to", () => {
    expect(wholesOf(garlic, { quantity: 8, unit: "Zehe" })).toBe(0.8);
    expect(wholesOf(garlic, { quantity: 2, unit: "Knolle" })).toBe(2);
    expect(wholesOf(zest, { quantity: 1, unit: "EL" })).toBe(1);
    expect(wholesOf(zest, { quantity: 2, unit: "Stück" })).toBe(2);
    expect(wholesOf(zest, { quantity: 1, unit: "Packung" })).toBeNull();
    expect(wholesOf(ginger, { quantity: 1, unit: "Stück" })).toBeNull();
  });

  it("converts through the whole where the weights say nothing", () => {
    expect(convertFor(garlic, { quantity: 8, unit: "Zehe" }, "Knolle")).toBe(0.8);
    expect(convertFor(garlic, { quantity: 1, unit: "Knolle" }, "Zehe")).toBe(10);
    expect(convertFor(garlic, { quantity: 10, unit: "g" }, "Zehe")).toBeNull();
  });
});
