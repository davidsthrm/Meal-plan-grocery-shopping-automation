"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { dayProblems } from "@/domain/shopping-list/change-day";
import { readDrugstoreEntry } from "@/domain/shopping-list/drugstore";
import { noteId, readNoteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import {
  addEntry,
  changeLine,
  completeNote,
  isNote,
  loadShoppingNotes,
  moveLines,
  removeEntry,
} from "@/server/shopping/list";
import { createSessionClient } from "@/server/supabase/server";

/** What a shopping note can be told to do. Each action is the target of a plain form. */

/**
 * The week the page shows, the note the form is about, and where the form stands: on the
 * note itself, or on the page with all notes.
 */
const place = z.object({
  week: z
    .string()
    .refine(isIsoDate)
    .refine((value) => mondayOf(value) === value),
  note: z.string().max(40),
  back: z.enum(["note", "all"]),
});
const line = place.extend({ key: z.string().min(1).max(200) });

function read<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("The form of the shopping list could not be read.");
  return parsed.data;
}

/** The note an id names. */
function noteOf(id: string): ShoppingTrip {
  const trip = readNoteId(id);
  if (!trip || !isNote(trip)) throw new Error(`${id} is no shopping note.`);
  return trip;
}

function backToList(input: z.infer<typeof place>): never {
  revalidatePath("/einkauf");
  redirect(`/einkauf?w=${input.week}${input.back === "note" ? `&zettel=${input.note}` : ""}`);
}

/** Adds a line typed by hand to a note. Nothing typed adds nothing. */
export async function addListEntry(form: FormData): Promise<void> {
  const input = read(place.extend({ text: z.string().trim().max(120) }), form);
  const household = await requireHousehold();
  const trip = noteOf(input.note);
  if (input.text !== "") await addEntry(await createSessionClient(), household, trip, input.text);
  backToList(input);
}

/** Writes onto the drugstore's note: what, how many, and for whom. Nothing written adds nothing. */
export async function addDrugstoreEntry(form: FormData): Promise<void> {
  const input = read(
    place.extend({
      item: z.string().max(200),
      quantity: z.string().max(10).optional(),
      forWhom: z.string().max(200).optional(),
    }),
    form,
  );
  const household = await requireHousehold();
  const trip = noteOf(input.note);
  if (trip.place !== "drugstore") throw new Error(`${input.note} is not the drugstore's note.`);
  const entry = readDrugstoreEntry({
    item: input.item,
    quantity: input.quantity ?? "",
    forWhom: input.forWhom ?? "",
  });
  if (entry) {
    await addEntry(await createSessionClient(), household, trip, entry.text, {
      quantity: entry.quantity,
      forWhom: entry.forWhom,
    });
  }
  backToList(input);
}

export async function removeListEntry(form: FormData): Promise<void> {
  const input = read(place.extend({ entry: z.guid() }), form);
  await requireHousehold();
  await removeEntry(await createSessionClient(), input.entry);
  backToList(input);
}

/** Ticks a line off, or takes the tick away. */
export async function checkLine(form: FormData): Promise<void> {
  const input = read(line.extend({ checked: z.enum(["0", "1"]) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, noteOf(input.note), input.key, {
    checked: input.checked === "1",
  });
  backToList(input);
}

/** Says that something is at home and need not be bought, or that it has to be bought after all. */
export async function markAtHome(form: FormData): Promise<void> {
  const input = read(line.extend({ atHome: z.enum(["0", "1"]) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, noteOf(input.note), input.key, {
    atHome: input.atHome === "1",
  });
  backToList(input);
}

/** Writes a note next to a line: a brand, an offer price. */
export async function noteLine(form: FormData): Promise<void> {
  const input = read(line.extend({ note: z.string().trim().max(80) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, noteOf(input.note), input.key, {
    note: input.note,
  });
  backToList(input);
}

/**
 * Moves a line to another note: it is bought on another errand after all. `origins` are the
 * notes the parts of the line would be on by themselves.
 */
export async function moveListLine(form: FormData): Promise<void> {
  const input = read(line.extend({ origins: z.string().max(400), to: z.string().max(40) }), form);
  const household = await requireHousehold();
  const origins = input.origins.split(",").filter(Boolean).map(noteOf);
  await moveLines(
    await createSessionClient(),
    household,
    [{ key: input.key, origins }],
    noteOf(input.to),
  );
  backToList(input);
}

/** Says that an errand is done: everything still open on its note is ticked. */
export async function completeListNote(form: FormData): Promise<void> {
  const input = read(place, form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const note = (await loadShoppingNotes(db, household, input.week)).notes.find(
    (entry) => entry.id === input.note,
  );
  if (note) {
    const open = note.view.groups
      .flatMap((group) => group.lines)
      .filter((entry) => !entry.checked)
      .map((entry) => entry.line.key);
    await completeNote(db, household, note.trip, open);
  }
  backToList(input);
}

/**
 * Does an errand on another day: every line of its note moves to the note of that day at
 * the same place. Refused when something on the note would be too late or would not keep;
 * the page says so before the button is offered, and this checks it again.
 */
export async function changeNoteDay(form: FormData): Promise<void> {
  const input = read(place.extend({ day: z.string().refine(isIsoDate) }), form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const { notes, index } = await loadShoppingNotes(db, household, input.week);
  const note = notes.find((entry) => entry.id === input.note);
  if (!note) backToList(input);
  const lines = note.view.groups.flatMap((group) => group.lines).map((entry) => entry.line);
  if (dayProblems(lines, input.day, today(), index).length > 0) backToList(input);
  const target = { date: input.day, place: note.trip.place };
  await moveLines(
    db,
    household,
    lines.map((entry) => ({
      key: entry.key,
      origins: [
        ...new Set(entry.contributions.map((part) => noteId(part.origin ?? note.trip))),
      ].map(noteOf),
    })),
    target,
  );
  backToList({ ...input, note: noteId(target) });
}
