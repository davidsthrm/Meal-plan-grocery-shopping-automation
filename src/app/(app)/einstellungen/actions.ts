"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readName } from "@/domain/family";
import { readDaysForm } from "@/domain/shopping-list/trips";
import { requireHousehold } from "@/server/auth";
import { createInvite, renameSelf, withdrawInvite } from "@/server/family";
import { storeFreshPlaces, storeShoppingDays } from "@/server/settings";
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
  await storeShoppingDays(await createSessionClient(), household.id, days);
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
