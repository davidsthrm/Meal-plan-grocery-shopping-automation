import type { GramsPer, Unit } from "./units";

/**
 * Where the household shops. Every place it goes to on a day has a note of its own. The
 * drugstore sells no food: its note is written by hand.
 */
export const PLACES = ["supermarket", "market", "butcher", "bakery", "drugstore"] as const;
export type Place = (typeof PLACES)[number];

/**
 * How an ingredient is bought, which decides what the shopping line shows.
 * - count: a number of pieces ("2 Karotten", "20 Eier")
 * - weight: a weight ("600 g Leberkäse")
 * - pack: packs of a fixed size; a multiplier is shown only for more than one ("2x Garnelen")
 * - none: the name is enough ("Feldsalat", "Ingwer")
 */
export type BuyingMode = "count" | "weight" | "pack" | "none";

export interface Shop {
  id: string;
  name: string;
  /** How the household writes it on the list, e.g. "EC". */
  shortLabel: string;
  sortOrder: number;
  /** Aisle groups that sit somewhere else in this shop: aisle group id to sort order. */
  aisleSortOverrides: Record<string, number>;
  /** What kind of place it is. A supermarket unless it says otherwise. */
  kind?: Place;
}

export interface AisleGroup {
  id: string;
  name: string;
  sortOrder: number;
  /**
   * Where this kind of grocery is bought fresh when a shopping day goes there. Null or left
   * out: at the supermarket.
   */
  freshPlace?: "market" | "butcher" | null;
}

export interface Ingredient {
  id: string;
  /** The household's word. This is what the list shows. */
  name: string;
  /** Other names, spellings and abbreviations that mean the same product. */
  synonyms: string[];
  aisleGroupId: string;
  preferredShopId: string;
  preferredBrand: string | null;
  /** The unit amounts of this ingredient are summed in. */
  defaultUnit: Unit;
  buyingMode: BuyingMode;
  /** Size of one pack in `defaultUnit`. Required for buying mode "pack". */
  packSize: number | null;
  /** Purchase quantities are rounded up to a multiple of this, in `defaultUnit`. */
  roundingStep: number | null;
  gramsPer: GramsPer;
  /** Usually at home. Pre-ticked in the "Haben wir schon?" step. */
  isPantryStaple: boolean;
  /** Days it stays good after buying. Null means it keeps for any planned week. */
  shelfLifeDays: number | null;
}

export interface Catalog {
  shops: Shop[];
  aisleGroups: AisleGroup[];
  ingredients: Ingredient[];
  /** Where lines go that have no catalog ingredient. */
  defaultShopId: string;
  fallbackAisleGroupId: string;
}

/**
 * Reduces a name to a comparison key: case, umlaut spelling, accents, hyphens, dots, spaces
 * and brackets do not matter. "Crème fraîche" equals "Creme fraiche", "Möhren" equals
 * "Moehren", "Gouda-Scheiben" equals "Gouda (Scheiben)".
 */
export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export interface CatalogIndex {
  catalog: Catalog;
  ingredientById: Map<string, Ingredient>;
  ingredientByName: Map<string, Ingredient>;
  shopById: Map<string, Shop>;
  aisleGroupById: Map<string, AisleGroup>;
}

/**
 * Builds the lookups the list logic needs. Throws on a name or synonym that points at two
 * ingredients, because such a catalog would map recipes unpredictably.
 */
export function createCatalogIndex(catalog: Catalog): CatalogIndex {
  const ingredientByName = new Map<string, Ingredient>();
  for (const ingredient of catalog.ingredients) {
    for (const name of [ingredient.name, ...ingredient.synonyms]) {
      const key = normalizeName(name);
      const existing = ingredientByName.get(key);
      if (existing && existing.id !== ingredient.id) {
        throw new Error(`"${name}" is a name of both "${existing.name}" and "${ingredient.name}"`);
      }
      ingredientByName.set(key, ingredient);
    }
  }
  return {
    catalog,
    ingredientById: new Map(catalog.ingredients.map((i) => [i.id, i])),
    ingredientByName,
    shopById: new Map(catalog.shops.map((s) => [s.id, s])),
    aisleGroupById: new Map(catalog.aisleGroups.map((a) => [a.id, a])),
  };
}

/** Finds the catalog ingredient a name, synonym or abbreviation refers to. */
export function findIngredient(index: CatalogIndex, text: string): Ingredient | undefined {
  const key = normalizeName(text);
  return key === "" ? undefined : index.ingredientByName.get(key);
}

/** Position of an aisle group inside a shop: the shop's own order wins over the default. */
export function aisleSortOrder(index: CatalogIndex, shopId: string, aisleGroupId: string): number {
  const override = index.shopById.get(shopId)?.aisleSortOverrides[aisleGroupId];
  if (override !== undefined) return override;
  return index.aisleGroupById.get(aisleGroupId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
}
