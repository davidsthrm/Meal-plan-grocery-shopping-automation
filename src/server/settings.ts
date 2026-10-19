import "server-only";
import type { ShoppingDay } from "@/domain/shopping-list/trips";
import type { Json } from "./supabase/database.types";
import { must, type Db } from "./catalog";

/** What a household sets once and that then holds for every week. */

export async function storeShoppingDays(
  db: Db,
  householdId: string,
  days: readonly ShoppingDay[],
): Promise<void> {
  const stored = await db
    .from("household")
    .update({ shopping_days: days as unknown as Json })
    .eq("id", householdId);
  if (stored.error) throw new Error(`store shopping days: ${stored.error.message}`);
}

/** Renames the household: "Stührmann". Row level security keeps this to the member's own. */
export async function renameHousehold(db: Db, householdId: string, name: string): Promise<void> {
  const stored = await db.from("household").update({ name }).eq("id", householdId);
  if (stored.error) throw new Error(`rename household: ${stored.error.message}`);
}

/** Stores the weekday the household goes to the drugstore on. */
export async function storeDrugstoreWeekday(
  db: Db,
  householdId: string,
  weekday: number,
): Promise<void> {
  const stored = await db
    .from("household")
    .update({ drugstore_weekday: weekday })
    .eq("id", householdId);
  if (stored.error) throw new Error(`store drugstore day: ${stored.error.message}`);
}

/**
 * Stores where each kind of grocery is bought fresh: at the market, the butcher, the bakery, or
 * (null) at the supermarket. Row level security keeps this to the household's own groups.
 */
export async function storeFreshPlaces(
  db: Db,
  places: ReadonlyMap<string, "market" | "butcher" | "bakery" | null>,
): Promise<void> {
  for (const place of ["market", "butcher", "bakery", null] as const) {
    const ids = [...places].filter(([, value]) => value === place).map(([id]) => id);
    if (ids.length === 0) continue;
    const stored = await db.from("aisle_group").update({ fresh_place: place }).in("id", ids);
    if (stored.error) throw new Error(`store fresh places: ${stored.error.message}`);
  }
}

/**
 * Says whether an ingredient is usually at home: salt, oil, flour. What is is put under
 * "Haben wir schon" instead of on a note. Row level security keeps this to the household's
 * own catalog.
 */
export async function storePantryStaple(
  db: Db,
  ingredientId: string,
  staple: boolean,
): Promise<void> {
  const stored = await db
    .from("ingredient")
    .update({ is_pantry_staple: staple })
    .eq("id", ingredientId);
  if (stored.error) throw new Error(`store pantry staple: ${stored.error.message}`);
}

/**
 * Stores the order of the household's supermarkets, the main one first. Shops that are left
 * out are none of them any more.
 */
export async function storeSupermarkets(
  db: Db,
  ranked: readonly string[],
  removed: readonly string[] = [],
): Promise<void> {
  for (const [at, id] of ranked.entries()) {
    const stored = await db
      .from("shop")
      .update({ supermarket_rank: at + 1 })
      .eq("id", id);
    if (stored.error) throw new Error(`store supermarkets: ${stored.error.message}`);
  }
  if (removed.length === 0) return;
  const cleared = await db.from("shop").update({ supermarket_rank: null }).in("id", removed);
  if (cleared.error) throw new Error(`store supermarkets: ${cleared.error.message}`);
}

/**
 * The id of the supermarket of that name, made for the household if it has none yet: "Rewe".
 * Null when the name belongs to a place that is no supermarket, such as the butcher.
 */
export async function supermarketNamed(
  db: Db,
  householdId: string,
  name: string,
): Promise<string | null> {
  const shops = must(await db.from("shop").select("id, name, kind, sort_order"), "load shops");
  const known = shops.find((shop) => shop.name.toLowerCase() === name.toLowerCase());
  if (known) return known.kind === "supermarket" ? known.id : null;
  const created = must(
    await db
      .from("shop")
      .insert({
        household_id: householdId,
        name,
        short_label: name,
        sort_order: Math.max(0, ...shops.map((shop) => shop.sort_order)) + 1,
        kind: "supermarket",
      })
      .select("id")
      .single(),
    "add supermarket",
  );
  return created.id;
}

/** Stores where the household lives, or (null) forgets it. */
export async function storePostalCode(
  db: Db,
  householdId: string,
  postalCode: string | null,
  placeName: string | null,
): Promise<void> {
  const stored = await db
    .from("household")
    .update({ postal_code: postalCode, place_name: placeName?.slice(0, 80) ?? null })
    .eq("id", householdId);
  if (stored.error) throw new Error(`store postal code: ${stored.error.message}`);
}

/**
 * Keeps the supermarkets found near a postal code as shops of the household, to be chosen
 * from. One the household has by that name already is given its logo and street; the others
 * are made. Those found for an earlier postal code stay, and stay chosen if they were.
 */
export async function storeFoundSupermarkets(
  db: Db,
  householdId: string,
  postalCode: string,
  found: readonly {
    name: string;
    address: string | null;
    logoUrl: string | null;
    position: { lat: number; lon: number };
  }[],
): Promise<void> {
  const shops = must(
    await db.from("shop").select("id, name, kind, sort_order, address"),
    "load shops",
  );
  let order = Math.max(0, ...shops.map((shop) => shop.sort_order));
  for (const shop of found) {
    const known = shops.find((each) => each.name.toLowerCase() === shop.name.toLowerCase());
    const details = {
      logo_url: shop.logoUrl,
      // A street the household typed is kept: it knows its market better than the map.
      address: known?.address ?? shop.address,
      found_near: postalCode,
      lat: shop.position.lat,
      lon: shop.position.lon,
    };
    // A butcher of the same name is no supermarket: it is left as it is.
    if (known && known.kind !== "supermarket") continue;
    const stored = known
      ? await db.from("shop").update(details).eq("id", known.id)
      : await db.from("shop").insert({
          household_id: householdId,
          name: shop.name,
          short_label: shop.name,
          sort_order: ++order,
          kind: "supermarket",
          ...details,
        });
    if (stored.error) throw new Error(`store supermarket: ${stored.error.message}`);
  }
}

/** Stores for how many the household cooks: the persons a meal is planned for. */
export async function storeFamilySize(db: Db, householdId: string, size: number): Promise<void> {
  const stored = await db
    .from("household")
    .update({ default_servings: size })
    .eq("id", householdId);
  if (stored.error) throw new Error(`store family size: ${stored.error.message}`);
}

/**
 * Stores what the household says about one of its shops: its street, where it stands on the
 * map (null: where it was, if the street could not be found), and the kinds of
 * grocery bought there. Row level security keeps this to the household's own shops.
 */
export async function storeShopDetails(
  db: Db,
  shopId: string,
  details: {
    address: string | null;
    position: { lat: number; lon: number } | null;
    aisleGroupIds: readonly string[];
  },
): Promise<void> {
  const stored = await db
    .from("shop")
    .update({
      address: details.address,
      aisle_group_ids: [...details.aisleGroupIds],
      // A street that cannot be found leaves the mark where it was.
      ...(details.position ? { lat: details.position.lat, lon: details.position.lon } : {}),
    })
    .eq("id", shopId);
  if (stored.error) throw new Error(`store shop: ${stored.error.message}`);
}

/** The household's supermarkets that have a street but no place on the map yet. */
export async function supermarketsWithoutPlace(db: Db): Promise<{ id: string; address: string }[]> {
  const rows = must(
    await db
      .from("shop")
      .select("id, address")
      .eq("kind", "supermarket")
      .is("lat", null)
      .not("address", "is", null),
    "load supermarkets without a place",
  );
  return rows.map((row) => ({ id: row.id, address: row.address as string }));
}

/** Keeps where each of these shops stands. */
export async function storeShopPlaces(
  db: Db,
  places: ReadonlyMap<string, { lat: number; lon: number }>,
): Promise<void> {
  for (const [id, place] of places) {
    const stored = await db.from("shop").update({ lat: place.lat, lon: place.lon }).eq("id", id);
    if (stored.error) throw new Error(`store shop place: ${stored.error.message}`);
  }
}
