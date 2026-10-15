import { describe, expect, it } from "vitest";
import {
  aisleSortOrder,
  createCatalogIndex,
  findIngredient,
  nameForOne,
  normalizeName,
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

  it("keeps the name where no other name is its singular", () => {
    expect(nameForOne({ name: "Ingwer", synonyms: ["frischer Ingwer"] })).toBe("Ingwer");
    expect(nameForOne({ name: "Tomaten", synonyms: ["Tomatenmark"] })).toBe("Tomaten");
  });
});
