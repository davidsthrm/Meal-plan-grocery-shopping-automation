"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findIngredient } from "@/domain/catalog";
import { readName } from "@/domain/family";
import { withAdded, withMain, without } from "@/domain/shopping-list/supermarkets";
import { readDaysForm, readWeekday } from "@/domain/shopping-list/trips";
import { requireHousehold } from "@/server/auth";
import { createInvite, renameSelf, withdrawInvite } from "@/server/family";
import { loadCatalogIndex, loadSupermarkets } from "@/server/catalog";
import {
  renameHousehold,
  storeDrugstoreWeekday,
  storeFreshPlaces,
  storePantryStaple,
  storeShoppingDays,
  storeSupermarkets,
  supermarketNamed,
} from "@/server/settings";
import { createSessionClient } from "@/server/supabase/server";

/** What the household sets once. Each action is the target of a plain form on the page. */

function back(section: string, said: Record<string, string> = {}): never {
  revalidatePath("/", "layout");
  const query = new URLSearchParams(said).toString();
  redirect(`/einstellungen${query ? `?${query}` : ""}#${section}`);
}

/** Stores the weekdays the household shops on, and where. */
export async function saveShoppingDays(form: FormData): Promise<void> {
  const days = readDaysForm((place) => form.getAll(`tage-${place}`).map(String));
  if (!days) back("einkaufstage", { fehler: "tage" });
  const household = await requireHousehold();
  const db = await createSessionClient();
  await storeShoppingDays(db, household.id, days);
  const drugstore = readWeekday(form.get("tag-drugstore"));
  if (drugstore !== null) await storeDrugstoreWeekday(db, household.id, drugstore);
  back("einkaufstage", { ok: "tage" });
}

/** Stores which kinds of grocery are bought fresh at the market or at the butcher. */
export async function saveFreshPlaces(form: FormData): Promise<void> {
  await requireHousehold();
  const places = new Map<string, "market" | "butcher" | null>();
  for (const [name, value] of form) {
    const id = /^frisch-(.+)$/.exec(name)?.[1];
    if (!id || !z.guid().safeParse(id).success) continue;
    places.set(id, value === "market" || value === "butcher" ? value : null);
  }
  await storeFreshPlaces(await createSessionClient(), places);
  back("frisch", { ok: "frisch" });
}

/** Names the household: "Stührmann". An empty name changes nothing. */
export async function saveHouseholdName(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const name = readName(String(form.get("household") ?? ""));
  if (name !== "") await renameHousehold(await createSessionClient(), household.id, name);
  back("familie");
}

/** Sets how the signed-in member is called in the household. */
export async function saveName(form: FormData): Promise<void> {
  const household = await requireHousehold();
  await renameSelf(household, readName(String(form.get("name") ?? "")));
  back("familie");
}

/** Makes an invitation. Its link is shown once, right after. */
export async function inviteMember(): Promise<void> {
  const household = await requireHousehold();
  const token = await createInvite(await createSessionClient(), household);
  back("familie", { einladung: token });
}

export async function withdrawInvitation(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  await withdrawInvite(await createSessionClient(), id);
  back("familie");
}

/**
 * Adds an ingredient to what is usually at home, by its name or another one the catalog
 * knows: "Mehl". A name the catalog does not know is said so.
 */
export async function addStaple(form: FormData): Promise<void> {
  await requireHousehold();
  const name = String(form.get("name") ?? "").trim();
  if (name === "") back("vorrat");
  const db = await createSessionClient();
  const ingredient = findIngredient(await loadCatalogIndex(db), name.slice(0, 80));
  if (!ingredient) back("vorrat", { fehler: "vorrat", name: name.slice(0, 80) });
  await storePantryStaple(db, ingredient.id, true);
  back("vorrat");
}

/** Takes an ingredient off what is usually at home: it goes on the notes again. */
export async function removeStaple(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  await storePantryStaple(await createSessionClient(), id, false);
  back("vorrat");
}

/** The household's supermarkets as ids, the main one first. */
async function rankedSupermarkets(): Promise<string[]> {
  return (await loadSupermarkets(await createSessionClient())).map((shop) => shop.id);
}

/**
 * Adds a supermarket the household goes to: one it knows, or a new one by its name. The
 * first one named is the main one.
 */
export async function addSupermarket(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const name = readName(String(form.get("name") ?? ""));
  if (name === "") back("supermaerkte");
  const db = await createSessionClient();
  const id = await supermarketNamed(db, household.id, name);
  if (!id) back("supermaerkte", { fehler: "supermarkt" });
  await storeSupermarkets(db, withAdded(await rankedSupermarkets(), id));
  back("supermaerkte");
}

/** Makes one of the household's supermarkets the main one. */
export async function makeMainSupermarket(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  const ranked = await rankedSupermarkets();
  if (ranked.includes(id)) {
    await storeSupermarkets(await createSessionClient(), withMain(ranked, id));
  }
  back("supermaerkte");
}

/** Takes a supermarket off the household's list. Lines moved there go to the main one. */
export async function removeSupermarket(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  await storeSupermarkets(await createSessionClient(), without(await rankedSupermarkets(), id), [
    id,
  ]);
  back("supermaerkte");
}
