import "server-only";
import type { ShoppingDay } from "@/domain/shopping-list/trips";
import type { Json } from "./supabase/database.types";
import type { Db } from "./catalog";

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
 * Stores where each kind of grocery is bought fresh: at the market, at the butcher, or
 * (null) at the supermarket. Row level security keeps this to the household's own groups.
 */
export async function storeFreshPlaces(
  db: Db,
  places: ReadonlyMap<string, "market" | "butcher" | null>,
): Promise<void> {
  for (const place of ["market", "butcher", null] as const) {
    const ids = [...places].filter(([, value]) => value === place).map(([id]) => id);
    if (ids.length === 0) continue;
    const stored = await db.from("aisle_group").update({ fresh_place: place }).in("id", ids);
    if (stored.error) throw new Error(`store fresh places: ${stored.error.message}`);
  }
}
