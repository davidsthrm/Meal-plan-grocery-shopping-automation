import { createCatalogIndex, type Catalog, type Ingredient } from "../catalog";
import type { RecipeIngredient } from "../recipe";
import type { Unit } from "../units";

/** A small catalog for tests. The real one lives in supabase/seed. */

function ingredient(id: string, name: string, patch: Partial<Ingredient>): Ingredient {
  return {
    id,
    name,
    synonyms: [],
    aisleGroupId: "obst",
    preferredShopId: "aldi",
    preferredBrand: null,
    defaultUnit: "g",
    buyingMode: "none",
    packSize: null,
    roundingStep: null,
    gramsPer: {},
    isPantryStaple: false,
    shelfLifeDays: null,
    ...patch,
  };
}

export const testCatalog: Catalog = {
  defaultShopId: "aldi",
  fallbackAisleGroupId: "sonstiges",
  shops: [
    { id: "aldi", name: "Aldi", shortLabel: "Aldi", sortOrder: 1, aisleSortOverrides: {} },
    // At E-Center the bakery comes after the meat counter.
    {
      id: "ec",
      name: "E-Center",
      shortLabel: "EC",
      sortOrder: 2,
      aisleSortOverrides: { brot: 85 },
    },
  ],
  aisleGroups: [
    { id: "obst", name: "Obst & Gemüse", sortOrder: 10, market: true },
    { id: "gewuerze", name: "Gewürze, Öl & Essig", sortOrder: 50 },
    { id: "brot", name: "Brot & Backwaren", sortOrder: 60 },
    { id: "molkerei", name: "Molkerei & Kühlregal", sortOrder: 70 },
    { id: "fleisch", name: "Fleisch & Wurst", sortOrder: 80, market: true },
    { id: "sonstiges", name: "Sonstiges", sortOrder: 150 },
  ],
  ingredients: [
    ingredient("karotten", "Karotten", {
      synonyms: ["Möhren", "Karotte"],
      defaultUnit: "Stück",
      buyingMode: "count",
      gramsPer: { Stück: 100 },
    }),
    ingredient("ingwer", "Ingwer", {}),
    ingredient("tomaten", "Tomaten", {
      defaultUnit: "Stück",
      buyingMode: "count",
      shelfLifeDays: 7,
    }),
    ingredient("kleine-tomaten", "kleine Tomaten", {
      synonyms: ["kl. Tomaten", "Kirschtomaten"],
      buyingMode: "pack",
      packSize: 250,
    }),
    ingredient("salz", "Salz", { aisleGroupId: "gewuerze", isPantryStaple: true }),
    ingredient("sahne", "Sahne", {
      synonyms: ["Sahne frisch"],
      aisleGroupId: "molkerei",
      defaultUnit: "ml",
      buyingMode: "pack",
      packSize: 200,
    }),
    ingredient("milch", "Milch", {
      aisleGroupId: "molkerei",
      preferredShopId: "ec",
      defaultUnit: "ml",
      buyingMode: "pack",
      packSize: 1000,
    }),
    ingredient("butter", "Butter", {
      aisleGroupId: "molkerei",
      preferredShopId: "ec",
      buyingMode: "pack",
      packSize: 250,
      isPantryStaple: true,
    }),
    ingredient("garnelen", "Garnelen", {
      aisleGroupId: "fleisch",
      buyingMode: "pack",
      packSize: 225,
    }),
    ingredient("steak", "Rindersteaks", {
      aisleGroupId: "fleisch",
      preferredShopId: "ec",
      defaultUnit: "Stück",
      buyingMode: "count",
      shelfLifeDays: 2,
    }),
    ingredient("leberkaese", "Leberkäse", {
      aisleGroupId: "fleisch",
      preferredShopId: "ec",
      buyingMode: "weight",
      roundingStep: 50,
    }),
    ingredient("brot", "Brot", { aisleGroupId: "brot", preferredShopId: "ec" }),
    ingredient("eier", "Eier", {
      aisleGroupId: "molkerei",
      preferredShopId: "ec",
      defaultUnit: "Stück",
      buyingMode: "count",
      roundingStep: 10,
    }),
  ],
};

export const testIndex = createCatalogIndex(testCatalog);

/** A recipe line with the given amount and everything else at its plain default. */
export function line(
  ingredientId: string | null,
  quantity: number | null,
  unit: Unit | null,
  patch: Partial<RecipeIngredient> = {},
): RecipeIngredient {
  return {
    ingredientId,
    quantity,
    quantityMax: null,
    unit,
    approximate: false,
    secondary: null,
    alternativeTo: null,
    optional: false,
    originalText: [quantity, unit, ingredientId].filter((part) => part !== null).join(" "),
    note: null,
    ...patch,
  };
}
