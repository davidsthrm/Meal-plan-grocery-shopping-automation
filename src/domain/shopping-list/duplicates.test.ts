import { describe, expect, it } from "vitest";
import { buildShoppingList } from "./build";
import { alsoOn, lineOnNote, type NoteLines } from "./duplicates";
import { presentByAisle } from "./present";
import { line, testIndex } from "./test-catalog";
import { noteId, type ShoppingTrip } from "./trips";
import type { LineState, ShoppingLine } from "./types";

const MONDAY: ShoppingTrip = { date: "2026-10-12", place: "supermarket" };
const SATURDAY: ShoppingTrip = { date: "2026-10-17", place: "market" };
const DM: ShoppingTrip = { date: "2026-10-17", place: "drugstore" };

const lines = buildShoppingList({
  index: testIndex,
  trips: [MONDAY, SATURDAY],
  onDemand: [],
  recipes: [
    {
      id: "salat",
      title: "Salat",
      kind: "quick_meal",
      servings: { min: 4, max: 4, unit: null },
      ingredients: [line("kleine-tomaten", 200, "g"), line("sahne", 100, "ml")],
    },
  ],
  slots: [
    // Bought on Monday at the supermarket, and on Saturday at the market for Sunday.
    {
      id: "a",
      date: "2026-10-13",
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "salat", servings: 4 }],
    },
    {
      id: "b",
      date: "2026-10-18",
      meal: "lunch",
      kind: "recipes",
      items: [{ recipeId: "salat", servings: 4 }],
    },
  ],
});

function notes(states: Record<string, Record<string, LineState>> = {}): NoteLines[] {
  return [MONDAY, SATURDAY].map((trip) => {
    const own: ShoppingLine[] = lines.filter(
      (entry) => entry.shoppingDate === trip.date && entry.place === trip.place,
    );
    const view = presentByAisle(own, states[noteId(trip)] ?? {}, testIndex);
    return { trip, lines: view.groups.flatMap((group) => group.lines) };
  });
}

describe("alsoOn", () => {
  it("says for a line which other notes of the week have the same thing", () => {
    const where = alsoOn(notes());
    expect(where.get(lineOnNote(MONDAY, "kleine-tomaten@main"))).toEqual([SATURDAY]);
    expect(where.get(lineOnNote(SATURDAY, "kleine-tomaten@main"))).toEqual([MONDAY]);
  });

  it("says nothing for what is on one note only", () => {
    // The cream is bought at the supermarket both times: Monday and Saturday's market
    // do not share it, and there is no supermarket on Saturday in this week.
    const where = alsoOn(notes());
    expect(where.has(lineOnNote(SATURDAY, "sahne@main"))).toBe(false);
  });

  it("counts what is ticked off as bought", () => {
    const where = alsoOn(
      notes({ [noteId(SATURDAY)]: { "kleine-tomaten@main": { checked: true } } }),
    );
    expect(where.has(lineOnNote(MONDAY, "kleine-tomaten@main"))).toBe(false);
    expect(where.has(lineOnNote(SATURDAY, "kleine-tomaten@main"))).toBe(false);
  });

  it("knows a typed line by its name", () => {
    const typed = (trip: ShoppingTrip, id: string) =>
      buildShoppingList({
        index: testIndex,
        trips: [trip],
        recipes: [],
        slots: [],
        manualEntries: [{ id, text: "Geschenkpapier", shoppingDate: trip.date, place: trip.place }],
      });
    const view = (trip: ShoppingTrip, id: string) => ({
      trip,
      lines: presentByAisle(typed(trip, id), {}, testIndex).groups.flatMap((group) => group.lines),
    });
    const where = alsoOn([view(MONDAY, "m1"), view(SATURDAY, "m2")]);
    expect(where.get(lineOnNote(MONDAY, "manual:m1"))).toEqual([SATURDAY]);
  });

  it("leaves the drugstore's note out", () => {
    const own = notes();
    const where = alsoOn([...own, { trip: DM, lines: own[0].lines }]);
    expect(where.get(lineOnNote(MONDAY, "kleine-tomaten@main"))).toEqual([SATURDAY]);
    expect([...where.keys()].some((key) => key.startsWith(noteId(DM)))).toBe(false);
  });
});
