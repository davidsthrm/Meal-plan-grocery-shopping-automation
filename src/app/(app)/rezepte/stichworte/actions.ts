"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cleanTagName } from "@/domain/library/tag-admin";
import { requireHousehold } from "@/server/auth";
import { createSessionClient } from "@/server/supabase/server";
import { deleteTag, mergeTags, moveTag, renameTag } from "@/server/tags";

/**
 * Looking after the tags on their own page. A change that a rule refuses goes back to the
 * tag with what was asked for in the address; the page works out again why, and says so.
 */

const tagId = z.guid();

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function back(said: Record<string, string> = {}, anchor = ""): never {
  revalidatePath("/", "layout");
  const query = new URLSearchParams(said).toString();
  redirect(`/rezepte/stichworte${query ? `?${query}` : ""}${anchor}`);
}

function idFrom(form: FormData): string {
  const id = text(form, "stichwort");
  if (!tagId.safeParse(id).success) back();
  return id;
}

export async function renameTagAction(form: FormData): Promise<void> {
  await requireHousehold();
  const id = idFrom(form);
  const name = cleanTagName(text(form, "name"));
  const result = await renameTag(await createSessionClient(), id, name);
  if (!result.ok) back({ stichwort: id, name }, `#s-${id}`);
  back({ getan: "umbenannt", wert: id }, `#s-${id}`);
}

export async function mergeTagAction(form: FormData): Promise<void> {
  const household = await requireHousehold();
  const id = idFrom(form);
  const into = text(form, "mit");
  if (!tagId.safeParse(into).success) back({ stichwort: id }, `#s-${id}`);
  const result = await mergeTags(await createSessionClient(), household.id, id, into);
  if (!result.ok) back({ stichwort: id, mit: into }, `#s-${id}`);
  back({ getan: "zusammengefuehrt", wert: into }, `#s-${into}`);
}

export async function moveTagAction(form: FormData): Promise<void> {
  await requireHousehold();
  const id = idFrom(form);
  const group = text(form, "gruppe").slice(0, 40);
  const result = await moveTag(await createSessionClient(), id, group);
  if (!result.ok) back({ stichwort: id, gruppe: group }, `#s-${id}`);
  back({ getan: "verschoben", wert: id }, `#s-${id}`);
}

/** Deletes a tag of the household's own, after the page asked once more. */
export async function deleteTagAction(form: FormData): Promise<void> {
  await requireHousehold();
  const id = idFrom(form);
  if (text(form, "bestaetigt") !== "ja") back({ stichwort: id }, `#s-${id}`);
  const result = await deleteTag(await createSessionClient(), id);
  if (!result.ok) back({ stichwort: id }, `#s-${id}`);
  back({ getan: "geloescht" });
}
