import "server-only";
import type { CatalogIndex } from "@/domain/catalog";
import type { IsoDate } from "@/domain/dates";
import { readRestock, restockTrip, type RestockItem } from "@/domain/shopping-list/restock";
import type { ShoppingTrip } from "@/domain/shopping-list/trips";
import type { Household } from "../auth";
import { loadCatalogIndex, must, type Db } from "../catalog";
import { addEntry } from "./list";

/** The note for what ran out at home: reading it, writing on it, and moving it to a list. */

export async function loadRestock(db: Db): Promise<RestockItem[]> {
  return must(
    await db.from("restock_item").select("id, text").order("created_at").limit(200),
    "load the note",
  );
}

/** How many entries the note has, for the sign that leads to it. */
export async function countRestock(db: Db): Promise<number> {
  const counted = await db.from("restock_item").select("id", { count: "exact", head: true });
  if (counted.error) throw new Error(`count the note: ${counted.error.message}`);
  return counted.count ?? 0;
}

/** Writes an entry on the note. Written a second time, it stays one entry. */
export async function addRestock(
  db: Db,
  household: Pick<Household, "id" | "userId">,
  text: string,
): Promise<void> {
  const entry = readRestock(text);
  if (entry === "") return;
  const stored = await db
    .from("restock_item")
    .insert({ household_id: household.id, text: entry, created_by: household.userId });
  // 23505: the note has this entry already.
  if (stored.error && stored.error.code !== "23505") {
    throw new Error(`write on the note: ${stored.error.message}`);
  }
}

export async function removeRestock(db: Db, id: string): Promise<void> {
  const removed = await db.from("restock_item").delete().eq("id", id);
  if (removed.error) throw new Error(`strike from the note: ${removed.error.message}`);
}

/** An entry with the shopping day it would go to. */
export interface PlacedRestock extends RestockItem {
  trip: ShoppingTrip | null;
}

/** The note with, for every entry, the shopping day that buys it. */
export function placeRestock(
  items: readonly RestockItem[],
  index: CatalogIndex,
  household: Pick<Household, "shoppingDays">,
  today: IsoDate,
): PlacedRestock[] {
  return items.map((item) => ({
    ...item,
    trip: restockTrip(item.text, index, household.shoppingDays, today),
  }));
}

/**
 * Puts entries of the note on the list of the next shopping day, one entry or all of them,
 * and takes them off the note. Answers with the days they went to.
 */
export async function moveToList(
  db: Db,
  household: Pick<Household, "id" | "userId" | "shoppingDays">,
  today: IsoDate,
  only: string | null,
): Promise<IsoDate[]> {
  const items = (await loadRestock(db)).filter((item) => only === null || item.id === only);
  if (items.length === 0) return [];
  const days: IsoDate[] = [];
  for (const item of placeRestock(items, await loadCatalogIndex(db), household, today)) {
    if (!item.trip) continue;
    await addEntry(db, household, item.trip.date, item.text);
    await removeRestock(db, item.id);
    if (!days.includes(item.trip.date)) days.push(item.trip.date);
  }
  return days.sort();
}
