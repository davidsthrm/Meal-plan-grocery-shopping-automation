import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCatalogIndex,
  type Catalog,
  type Place,
  type CatalogIndex,
  type Ingredient,
  type Shop,
} from "@/domain/catalog";
import { favouriteSupermarkets } from "@/domain/shopping-list/supermarkets";
import type { GramsPer } from "@/domain/units";
import { readPages } from "@/lib/paging";
import type { Database } from "./supabase/database.types";

export type Db = SupabaseClient<Database>;

/** Throws with the failed operation's name. Database errors here are bugs or outages. */
export function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no data`);
  return result.data;
}

/**
 * Like `must`, for a question whose answer may be nothing: a row that `maybeSingle` did not
 * find is null, not an error.
 */
export function maybe<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> | null {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data ?? null;
}

/**
 * Loads every row of a query, page by page (`readPages`, several at a time). Anything that
 * can grow past a thousand rows has to be read this way: the API cuts a longer answer off
 * without saying so. The catalog was read in one request until it had 1024 ingredients,
 * and the last 24 of the alphabet, sugar and onions among them, silently stopped existing
 * for the app. The query must have a stable order, or pages read side by side overlap.
 */
export async function allRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  return readPages(async (from, to) => must(await page(from, to), what));
}

/** Every ingredient of the catalog with its names, for lists to choose from and to search. */
export async function loadIngredientNames(
  db: Db,
): Promise<{ id: string; name: string; synonyms: string[] }[]> {
  return allRows(
    (from, to) =>
      db.from("ingredient").select("id, name, synonyms").order("name").order("id").range(from, to),
    "load ingredient names",
  );
}

/** The household's supermarkets, the main one first. Empty until it has named one. */
export async function loadSupermarkets(db: Db): Promise<Shop[]> {
  const rows = must(
    await db
      .from("shop")
      .select("id, name, short_label, sort_order, kind, supermarket_rank, logo_url")
      .not("supermarket_rank", "is", null),
    "load supermarkets",
  );
  return favouriteSupermarkets(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      shortLabel: row.short_label,
      sortOrder: row.sort_order,
      kind: row.kind as Place,
      supermarketRank: row.supermarket_rank,
      logoUrl: row.logo_url,
      aisleSortOverrides: {},
    })),
  );
}

/**
 * Loads the household's catalog in the shape the domain logic works with. Which household is
 * decided by row level security: the client only sees its own.
 */
export async function loadCatalogIndex(db: Db): Promise<CatalogIndex> {
  const [shops, overrides, aisles, ingredients] = await Promise.all([
    db
      .from("shop")
      .select(
        "id, name, short_label, sort_order, is_default, kind, supermarket_rank, logo_url, address, found_near",
      )
      .order("sort_order"),
    db.from("shop_aisle_order").select("shop_id, aisle_group_id, sort_order"),
    db
      .from("aisle_group")
      .select("id, name, sort_order, is_fallback, fresh_place")
      .order("sort_order"),
    allRows(
      (from, to) =>
        db
          .from("ingredient")
          .select(
            "id, name, synonyms, aisle_group_id, preferred_shop_id, preferred_brand, default_unit, buying_mode, pack_size, rounding_step, grams_per, is_pantry_staple, shelf_life_days",
          )
          .eq("status", "active")
          .order("name")
          .order("id")
          .range(from, to),
      "load ingredients",
    ),
  ]);
  const shopRows = must(shops, "load shops");
  const aisleRows = must(aisles, "load aisle groups");
  const overrideRows = must(overrides, "load aisle order");

  const catalog: Catalog = {
    shops: shopRows.map((shop) => ({
      id: shop.id,
      name: shop.name,
      shortLabel: shop.short_label,
      sortOrder: shop.sort_order,
      kind: shop.kind as Place,
      supermarketRank: shop.supermarket_rank,
      logoUrl: shop.logo_url,
      address: shop.address,
      foundNear: shop.found_near,
      aisleSortOverrides: Object.fromEntries(
        overrideRows
          .filter((row) => row.shop_id === shop.id)
          .map((row) => [row.aisle_group_id, row.sort_order]),
      ),
    })),
    aisleGroups: aisleRows.map((aisle) => ({
      id: aisle.id,
      name: aisle.name,
      sortOrder: aisle.sort_order,
      freshPlace: aisle.fresh_place as "market" | "butcher" | "bakery" | null,
    })),
    ingredients: ingredients.map((row): Ingredient => ({
      id: row.id,
      name: row.name,
      synonyms: row.synonyms,
      aisleGroupId: row.aisle_group_id,
      preferredShopId: row.preferred_shop_id,
      preferredBrand: row.preferred_brand,
      defaultUnit: row.default_unit,
      buyingMode: row.buying_mode,
      packSize: row.pack_size,
      roundingStep: row.rounding_step,
      gramsPer: (row.grams_per ?? {}) as GramsPer,
      isPantryStaple: row.is_pantry_staple,
      shelfLifeDays: row.shelf_life_days,
    })),
    defaultShopId: (shopRows.find((s) => s.is_default) ?? shopRows[0])?.id ?? "",
    fallbackAisleGroupId:
      (aisleRows.find((a) => a.is_fallback) ?? aisleRows[aisleRows.length - 1])?.id ?? "",
  };
  return createCatalogIndex(catalog);
}
