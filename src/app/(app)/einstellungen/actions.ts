"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readName, readNewPassword } from "@/domain/family";
import { withAdded, withMain, without } from "@/domain/shopping-list/supermarkets";
import { readPostalCode } from "@/domain/supermarket-search";
import { readDaysForm, readWeekday } from "@/domain/shopping-list/trips";
import { requireHousehold, type Household } from "@/server/auth";
import {
  createInvite,
  leaveHousehold,
  removeMember,
  renameSelf,
  withdrawInvite,
} from "@/server/family";
import { changePassword } from "@/server/password";
import { loadSupermarkets } from "@/server/catalog";
import {
  renameHousehold,
  storeDrugstoreWeekday,
  storeFoundSupermarkets,
  storeFreshPlaces,
  storePantryStaple,
  storePostalCode,
  storeShoppingDays,
  storeSupermarkets,
  supermarketNamed,
} from "@/server/settings";
import { createSessionClient } from "@/server/supabase/server";
import { searchSupermarkets } from "@/server/supermarket-search";

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

/** Stores which kinds of grocery are bought fresh at the market, the butcher or the bakery. */
export async function saveFreshPlaces(form: FormData): Promise<void> {
  await requireHousehold();
  const places = new Map<string, "market" | "butcher" | "bakery" | null>();
  for (const [name, value] of form) {
    const id = /^frisch-(.+)$/.exec(name)?.[1];
    if (!id || !z.guid().safeParse(id).success) continue;
    places.set(id, value === "market" || value === "butcher" || value === "bakery" ? value : null);
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
 * The admin removes a member. The account stays; it no longer sees anything of the
 * household. The database checks that the one asking is the admin.
 */
export async function removeFamilyMember(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  await removeMember(await createSessionClient(), id);
  back("familie");
}

/**
 * The signed-in member leaves the household and is signed out: the account has nothing to
 * show any more. The form is marked as a sign-out, so the device forgets the notes kept
 * for the shop and the ticks not sent yet.
 */
export async function leaveFamily(): Promise<void> {
  await requireHousehold();
  const db = await createSessionClient();
  await leaveHousehold(db);
  await db.auth.signOut();
  redirect("/login?verlassen=1");
}

export interface PasswordChange {
  error: string | null;
  done: boolean;
}

/** Changes the signed-in member's password, once the one they have now is right. */
export async function changeOwnPassword(
  _previous: PasswordChange,
  form: FormData,
): Promise<PasswordChange> {
  await requireHousehold();
  const next = String(form.get("password") ?? "");
  const wrong = readNewPassword(next, String(form.get("repeated") ?? ""));
  if (wrong) return { error: wrong, done: false };
  const failed = await changePassword(String(form.get("current") ?? ""), next);
  return { error: failed, done: failed === null };
}

/** Back to the page of what is usually at home, with the search that was open. */
function backToPantry(form: FormData): never {
  revalidatePath("/", "layout");
  const q = String(form.get("q") ?? "").slice(0, 80);
  redirect(`/einstellungen/vorrat${q ? `?${new URLSearchParams({ q })}` : ""}`);
}

/** Adds an ingredient of the catalog to what is usually at home. */
export async function addStaple(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  await storePantryStaple(await createSessionClient(), id, true);
  backToPantry(form);
}

/** Takes an ingredient off what is usually at home: it goes on the notes again. */
export async function removeStaple(form: FormData): Promise<void> {
  const id = z.guid().parse(form.get("id"));
  await requireHousehold();
  await storePantryStaple(await createSessionClient(), id, false);
  backToPantry(form);
}

/** Looks for the supermarkets near the household's postal code and keeps them to choose. */
async function findSupermarkets(household: Household, postalCode: string): Promise<never> {
  const db = await createSessionClient();
  let search: Awaited<ReturnType<typeof searchSupermarkets>>;
  try {
    search = await searchSupermarkets(postalCode);
  } catch (error) {
    // The postal code is kept: "Neu suchen" tries again. What went wrong is said on the page.
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    console.error(`supermarket search for ${postalCode}: ${reason}`);
    await storePostalCode(db, household.id, postalCode, household.placeName);
    back("supermaerkte", { fehler: "suche", grund: reason });
  }
  if (!search) back("supermaerkte", { fehler: "plz" });
  await storePostalCode(db, household.id, postalCode, search.place);
  await storeFoundSupermarkets(db, household.id, postalCode, search.supermarkets);
  back("supermaerkte");
}

/**
 * Stores where the household lives and finds the supermarkets there. Nothing typed forgets
 * it, and the supermarkets cannot be chosen again until a postal code is entered.
 */
export async function savePostalCode(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const typed = String(form.get("plz") ?? "").trim();
  if (typed === "") {
    await storePostalCode(await createSessionClient(), household.id, null, null);
    back("supermaerkte");
  }
  const postalCode = readPostalCode(typed);
  if (!postalCode) back("supermaerkte", { fehler: "plz" });
  await findSupermarkets(household, postalCode);
}

/** Looks for the supermarkets near the household's postal code once more. */
export async function searchAgain(): Promise<void> {
  const household = await requireHousehold();
  if (!household.postalCode) back("supermaerkte");
  await findSupermarkets(household, household.postalCode);
}

/** The household's supermarkets as ids, the main one first. */
async function rankedSupermarkets(): Promise<string[]> {
  return (await loadSupermarkets(await createSessionClient())).map((shop) => shop.id);
}

/**
 * Marks a supermarket: as the main one, as one more the household goes to, or as none of
 * them. A new main one makes the one before it one more. Only with a postal code.
 */
export async function markSupermarket(form: FormData): Promise<void> {
  const input = z
    .object({ id: z.guid(), as: z.enum(["main", "more", "none"]) })
    .parse(Object.fromEntries(form));
  const household = await requireHousehold();
  if (!household.postalCode) back("supermaerkte");
  const ranked = await rankedSupermarkets();
  const db = await createSessionClient();
  if (input.as === "none") {
    await storeSupermarkets(db, without(ranked, input.id), [input.id]);
  } else {
    const order = input.as === "main" ? withMain(ranked, input.id) : withAdded(ranked, input.id);
    await storeSupermarkets(db, order);
  }
  back("supermaerkte");
}

/**
 * A supermarket the map does not know, by its name. It is one more the household goes to,
 * or the main one when there is none yet.
 */
export async function addSupermarket(form: FormData): Promise<void> {
  const household = await requireHousehold();
  if (!household.postalCode) back("supermaerkte");
  const name = readName(String(form.get("name") ?? ""));
  if (name === "") back("supermaerkte");
  const db = await createSessionClient();
  const id = await supermarketNamed(db, household.id, name);
  if (!id) back("supermaerkte", { fehler: "supermarkt" });
  await storeSupermarkets(db, withAdded(await rankedSupermarkets(), id));
  back("supermaerkte");
}
