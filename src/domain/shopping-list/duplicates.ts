import { normalizeName } from "../catalog";
import type { ViewLine } from "./present";
import { noteId, type ShoppingTrip } from "./trips";

/**
 * The same thing on several notes of a week: small tomatoes on Monday's supermarket note
 * and on Saturday's market note. Each such line says where else it is, so the household can
 * buy it in one go. What is ticked off is bought and counts no more.
 */

export interface NoteLines {
  trip: ShoppingTrip;
  lines: readonly ViewLine[];
}

/** What makes two lines the same thing: the catalog ingredient, or else the name. */
function sameThing(view: ViewLine): string {
  return view.line.ingredientId ?? `text:${normalizeName(view.line.label)}`;
}

/** How a line of a note is looked up in the answer of `alsoOn`. */
export function lineOnNote(trip: ShoppingTrip, lineKey: string): string {
  return `${noteId(trip)}|${lineKey}`;
}

/**
 * For every open line that is on another note too: those other notes, in order of their
 * day. The drugstore's note is left out: it is written by hand and buys no food.
 */
export function alsoOn(notes: readonly NoteLines[]): Map<string, ShoppingTrip[]> {
  const where = new Map<string, ShoppingTrip[]>();
  const open = notes
    .filter((note) => note.trip.place !== "drugstore")
    .flatMap((note) =>
      note.lines.filter((view) => !view.checked).map((view) => ({ trip: note.trip, view })),
    );
  for (const { trip, view } of open) {
    const thing = sameThing(view);
    const others = open
      .filter((other) => noteId(other.trip) !== noteId(trip) && sameThing(other.view) === thing)
      .map((other) => other.trip);
    const unique = [...new Map(others.map((other) => [noteId(other), other])).values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.place.localeCompare(b.place),
    );
    if (unique.length > 0) where.set(lineOnNote(trip, view.line.key), unique);
  }
  return where;
}
