import "server-only";
import type { IsoDate } from "@/domain/dates";
import {
  freshPlaceOf,
  readRestock,
  restockTrip,
  type RestockItem,
} from "@/domain/shopping-list/restock";
import type { FreshPlace, ShoppingTrip } from "@/domain/shopping-list/trips";
import type { Household } from "../auth";
import { loadCatalogIndex, must, type Db } from "../catalog";
import { addEntry } from "./list";

/** The note for what ran out at home: reading it, writing on it, and moving it to a list. */

/** An entry with the errand it would go to. */
export interface PlacedRestock extends RestockItem {
  trip: ShoppingTrip | null;
}

/**
 * The note, with the errand that buys each entry. Read on every page, for the header: one
 * small request, and no catalog.
 */
export async function loadRestock(
  db: Db,
  household: Pick<Household, "shoppingDays">,
  today: IsoDate,
): Promise<PlacedRestock[]> {
  const rows = must(
    await db.from("restock_item").select("id, text, fresh_place").order("created_at").limit(200),
    "load the note",
  );
  return rows.map((row) => {
    const item = { id: row.id, text: row.text, freshPlace: row.fresh_place as FreshPlace | null };
    return { ...item, trip: restockTrip(item, household.shoppingDays, today) };
  });
}

/**
 * Writes an entry on the note, with where the catalog says it is bought fresh. Written a
 * second time, it stays one entry.
 */
export async function addRestock(
  db: Db,
  household: Pick<Household, "id" | "userId">,
  text: string,
): Promise<void> {
  const entry = readRestock(text);
  if (entry === "") return;
  const stored = await db.from("restock_item").insert({
    household_id: household.id,
    text: entry,
    fresh_place: freshPlaceOf(entry, await loadCatalogIndex(db)),
    created_by: household.userId,
  });
  // 23505: the note has this entry already.
  if (stored.error && stored.error.code !== "23505") {
    throw new Error(`write on the note: ${stored.error.message}`);
  }
}

export async function removeRestock(db: Db, id: string): Promise<void> {
  const removed = await db.from("restock_item").delete().eq("id", id);
  if (removed.error) throw new Error(`strike from the note: ${removed.error.message}`);
}

/**
 * Puts entries of the note on the note of the next errand that sells them, one entry or all
 * of them, and takes them off. Answers with the errands they went to.
 */
export async function moveToList(
  db: Db,
  household: Pick<Household, "id" | "userId" | "shoppingDays">,
  today: IsoDate,
  only: string | null,
): Promise<ShoppingTrip[]> {
  const items = (await loadRestock(db, household, today)).filter(
    (item) => only === null || item.id === only,
  );
  const went: ShoppingTrip[] = [];
  for (const item of items) {
    if (!item.trip) continue;
    await addEntry(db, household, item.trip, item.text);
    await removeRestock(db, item.id);
    const { date, place } = item.trip;
    if (!went.some((trip) => trip.date === date && trip.place === place)) went.push(item.trip);
  }
  return went.sort((a, b) => a.date.localeCompare(b.date));
}
