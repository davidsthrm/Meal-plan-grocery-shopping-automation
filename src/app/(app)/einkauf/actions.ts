"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PLACES } from "@/domain/catalog";
import { isIsoDate, mondayOf } from "@/domain/dates";
import { noteToBuyOn } from "@/domain/shopping-list/at-home";
import { originsOf } from "@/domain/shopping-list/build";
import { blocks, dayProblems, noteDays } from "@/domain/shopping-list/change-day";
import { readDrugstoreEntry } from "@/domain/shopping-list/drugstore";
import { noteId, readNoteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { daysToOpen } from "@/domain/shopping-list/week-notes";
import { parseQuantity } from "@/domain/quantity";
import { isUnit } from "@/domain/units";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import {
  addEntry,
  changeLine,
  completeNote,
  isNote,
  loadShoppingNotes,
  moveErrand,
  moveLines,
  openNote,
  putAwayNote,
  setEntryKind,
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

/**
 * "Doch kaufen" on a thing at home: every line it stands for is to be bought again. A line
 * whose errand is over goes to the next note that is in time for it (`noteToBuyOn`), and is
 * not at home there either. Each `line` field is "<note>|<key>".
 */
export async function buyAfterAll(form: FormData): Promise<void> {
  const input = read(place, form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const { atHome, index } = await loadShoppingNotes(db, household, input.week);
  const now = today();
  for (const value of form.getAll("line").map(String)) {
    const [note, key] = value.split("|");
    const entry = atHome.find(
      ({ trip, line: view }) => noteId(trip) === note && view.line.key === key,
    );
    if (!entry) continue;
    const { trip, line: view } = entry;
    await changeLine(db, household, trip, view.line.key, { atHome: false });
    const target = noteToBuyOn(view.line, trip, now, household.shoppingDays, index);
    if (noteId(target) === noteId(trip)) continue;
    await moveLines(
      db,
      household,
      [{ key: view.line.key, origins: originsOf(view.line, trip) }],
      target,
    );
    await changeLine(db, household, target, view.line.key, { atHome: false });
  }
  backToList(input);
}

/** Writes a note next to a line: a brand, an offer price. */
export async function noteLine(form: FormData): Promise<void> {
  // The text is not called "note": that is the shopping note the line is on.
  const input = read(line.extend({ text: z.string().trim().max(80) }), form);
  const household = await requireHousehold();
  await changeLine(await createSessionClient(), household, noteOf(input.note), input.key, {
    note: input.text,
  });
  backToList(input);
}

/**
 * Puts a typed line the catalog does not know under a kind of grocery: "Lakritzschnecken"
 * under "Süßes". The same text written again goes there by itself.
 */
export async function kindOfEntry(form: FormData): Promise<void> {
  const input = read(line.extend({ entry: z.guid(), kind: z.string().min(1).max(64) }), form);
  await requireHousehold();
  const db = await createSessionClient();
  // Row level security lets this find the household's own kinds only.
  const kind = await db.from("aisle_group").select("id").eq("id", input.kind).maybeSingle();
  if (kind.error) throw new Error(`load kind: ${kind.error.message}`);
  if (kind.data) await setEntryKind(db, input.entry, kind.data.id);
  backToList(input);
}

/**
 * Writes an amount over the one the plan works out: "5" Karotten, "300" g Hack. An empty
 * amount, or "Wie geplant", takes it back. What cannot be read changes nothing.
 */
export async function amountLine(form: FormData): Promise<void> {
  const input = read(
    line.extend({
      quantity: z.string().max(12).optional(),
      unit: z.string().max(12).optional(),
      reset: z.enum(["1"]).optional(),
    }),
    form,
  );
  const household = await requireHousehold();
  const quantity = input.reset ? null : parseQuantity(input.quantity ?? "");
  const unit = input.unit ?? "";
  const amount =
    quantity === null
      ? null
      : quantity !== undefined && quantity > 0 && quantity < 100000 && isUnit(unit)
        ? { quantity, unit }
        : undefined;
  if (amount !== undefined) {
    await changeLine(await createSessionClient(), household, noteOf(input.note), input.key, {
      amount,
    });
  }
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
 * Does an errand on another day, earlier or later: every line of its note moves to the note
 * of that day at the same place. Refused when something on the note would be too late; that
 * something would not keep so long is only said. The page offers only the days that work,
 * and this checks it again.
 */
export async function changeNoteDay(form: FormData): Promise<void> {
  const input = read(place.extend({ day: z.string().refine(isIsoDate) }), form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const { notes, index } = await loadShoppingNotes(db, household, input.week);
  const note = notes.find((entry) => entry.id === input.note);
  if (!note) backToList(input);
  const lines = note.view.groups.flatMap((group) => group.lines).map((entry) => entry.line);
  const target = { date: input.day, place: note.trip.place };
  const now = today();
  if (
    !noteDays(note.trip.date, now).includes(input.day) ||
    dayProblems(lines, target, now, index).some(blocks)
  ) {
    backToList(input);
  }
  // The lines go, and so does the errand: what the plan needs later is bought on the new day
  // by itself, and what keeps from there, such as milk for Sunday, needs no errand of its own.
  await moveLines(
    db,
    household,
    lines.map((entry) => ({ key: entry.key, origins: originsOf(entry, note.trip) })),
    target,
  );
  await moveErrand(db, household, note.trip, input.day);
  backToList({ ...input, note: noteId(target) });
}

/**
 * "Neuer Zettel": opens a note for a place on a day of the week from today on, and shows it
 * to be written on. A note that is there already is simply shown.
 */
export async function openListNote(form: FormData): Promise<void> {
  const input = read(
    z.object({
      week: place.shape.week,
      place: z.enum(PLACES),
      day: z.string().refine(isIsoDate),
    }),
    form,
  );
  const household = await requireHousehold();
  if (!daysToOpen(input.week, today()).includes(input.day)) {
    redirect(`/einkauf?w=${input.week}`);
  }
  const trip = { date: input.day, place: input.place };
  await openNote(await createSessionClient(), household.id, trip);
  revalidatePath("/einkauf");
  redirect(`/einkauf?w=${input.week}&zettel=${noteId(trip)}`);
}

/** Puts away a note opened by hand that nothing is written on. */
export async function putAwayListNote(form: FormData): Promise<void> {
  const input = read(place, form);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const { notes } = await loadShoppingNotes(db, household, input.week);
  const note = notes.find((entry) => entry.id === input.note);
  const empty =
    note &&
    note.view.groups.every((group) => group.lines.length === 0) &&
    note.view.notBought.length === 0;
  if (note?.openedByHand && empty) await putAwayNote(db, note.trip);
  backToList({ ...input, back: "all" });
}
