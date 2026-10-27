import "server-only";
import { cache } from "react";
import type { Place } from "@/domain/catalog";
import { addDays, type IsoDate } from "@/domain/dates";
import { drugstoreEntryFromText } from "@/domain/shopping-list/drugstore";
import {
  aisleGroupOf,
  freshPlaceOf,
  readRestock,
  restockSupermarket,
  restockTrip,
  type RestockItem,
} from "@/domain/shopping-list/restock";
import { noteId, type FreshPlace, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { requireHousehold, type Household } from "../auth";
import { loadCatalogIndex, loadSupermarkets, must, type Db } from "../catalog";
import { addEntry } from "./list";
import { createSessionClient } from "../supabase/server";

/** The note for what ran out at home: reading it, writing on it, and moving it to a list. */

/** An entry with the errand it would go to, and the supermarket where that is one. */
export interface PlacedRestock extends RestockItem {
  trip: ShoppingTrip | null;
  supermarket: string | null;
}

/**
 * The note, with the errand that buys each entry. Read on every page, for the header: two
 * small requests side by side, and no catalog.
 */
export async function loadRestock(
  db: Db,
  household: Pick<Household, "shoppingDays">,
  today: IsoDate,
): Promise<PlacedRestock[]> {
  const [read, supermarkets, movedRows] = await Promise.all([
    db
      .from("restock_item")
      .select("id, text, fresh_place, aisle_group_id")
      .order("created_at")
      .limit(200),
    loadSupermarkets(db),
    // Errands done on another day: the next errand may be one of the days before, moved on.
    db
      .from("shopping_list")
      .select("shopping_date, place, moved_to")
      .not("moved_to", "is", null)
      .gte("shopping_date", addDays(today, -7)),
  ]);
  const rows = must(read, "load the note");
  const movedTo = new Map(
    must(movedRows, "load errands moved").map((row) => [
      noteId({ date: row.shopping_date, place: row.place as Place }),
      row.moved_to as IsoDate,
    ]),
  );
  return rows.map((row) => {
    const item = {
      id: row.id,
      text: row.text,
      freshPlace: row.fresh_place as FreshPlace | null,
      aisleGroupId: row.aisle_group_id,
    };
    const trip = restockTrip(item, household.shoppingDays, today, movedTo);
    return {
      ...item,
      trip,
      supermarket: restockSupermarket(item, trip, supermarkets)?.name ?? null,
    };
  });
}

/**
 * The note of the signed-in household, read once per request: the header of every page shows
 * it, and the shopping notes and the Merkzettel's page show it again.
 */
export const loadOwnRestock = cache(async (today: IsoDate): Promise<PlacedRestock[]> =>
  loadRestock(await createSessionClient(), await requireHousehold(), today),
);

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
  const index = await loadCatalogIndex(db);
  const stored = await db.from("restock_item").insert({
    household_id: household.id,
    text: entry,
    fresh_place: freshPlaceOf(entry, index),
    aisle_group_id: aisleGroupOf(entry, index),
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
    if (item.trip.place === "drugstore") {
      // On the drugstore's note a number in front is how many: "2 Zahnpasta".
      const entry = drugstoreEntryFromText(item.text);
      await addEntry(db, household, item.trip, entry.text, {
        quantity: entry.quantity,
        forWhom: null,
      });
    } else {
      await addEntry(db, household, item.trip, item.text);
    }
    await removeRestock(db, item.id);
    const { date, place } = item.trip;
    if (!went.some((trip) => trip.date === date && trip.place === place)) went.push(item.trip);
  }
  return went.sort((a, b) => a.date.localeCompare(b.date));
}
