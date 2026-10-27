import type { Place } from "../catalog";
import { addDays, type IsoDate } from "../dates";
import type { Amount } from "../units";
import { restOf, type ViewLine } from "./present";
import { noteId, readNoteId, type ShoppingTrip } from "./trips";
import type { ShoppingLine } from "./types";

/**
 * What became of a line in the shop. The household does not always buy what the plan says:
 * the eggs are sold out and bought tomorrow at the farm shop, three bottles of six are
 * enough, Geramont is there instead of Bavaria Blu, the ginger shots are not needed after
 * all. Each of these is one decision about a line, made at a moment; the decision made
 * last stands, also when it reaches the server after another one (`decide_shopping_line`).
 * A tick is the simplest of them: bought, as planned.
 */

/** Where the rest of a line bought in part goes. */
export type Remainder =
  | { kind: "discarded" }
  /**
   * Bought on another note: `to` is that note ("2026-10-20.supermarket"), `entryId` the id
   * of the entry the rest becomes there, made on the device so that sending it twice
   * writes it once.
   */
  | { kind: "moved"; to: string; shopId: string | null; amount: Amount; entryId: string };

export type Decision =
  /** Bought: as planned, or another product (`name`) or amount. */
  | { kind: "bought"; amount?: Amount | null; name?: string | null }
  /** Not decided: to buy. Taking a decision back opens the line again. */
  | { kind: "open" }
  /** Not bought, on purpose: "nicht mehr nötig". */
  | { kind: "removed"; reason?: string | null }
  /** Bought in part: `amount` of it, and the rest discarded or bought elsewhere. */
  | { kind: "partial"; amount: Amount; name?: string | null; remainder: Remainder }
  /** Bought on another note: another day, another place, or another shop on it. */
  | { kind: "moved"; to: string; shopId: string | null };

/** Whether a decision counts the line as bought, in full or in part. */
export function isBought(decision: Decision): boolean {
  return decision.kind === "bought" || decision.kind === "partial";
}

/**
 * Whether a decision takes a line off the note `note` ("2026-10-28.supermarket"): removed,
 * or bought on another note. Another shop on the same note keeps the line there, in that
 * shop's section; shown as moved away ("Avocado → Di") while it was being stored, it read
 * as moved to another day (October 2026).
 */
export function leavesNote(decision: Decision, note: string): boolean {
  return decision.kind === "removed" || (decision.kind === "moved" && decision.to !== note);
}

/**
 * The line as the plan has it, kept next to what was bought at the first decision that
 * departs from it.
 */
export type PlannedLine = {
  name: string;
  quantity: number | null;
  unit: string | null;
  date: IsoDate;
  place: Place;
  shopId: string | null;
};

export function plannedOf(view: ViewLine, note: ShoppingTrip): PlannedLine {
  return {
    name: view.line.label,
    quantity: view.purchase?.quantity ?? null,
    unit: view.purchase?.unit ?? null,
    date: note.date,
    place: note.place,
    shopId: view.chosenShopId ?? view.shopId,
  };
}

/** The decision that stands on a line as the page shows it: what an undo goes back to. */
export function decisionOf(view: ViewLine): Decision {
  switch (view.status) {
    case "removed":
      return { kind: "removed", reason: view.removedReason };
    case "bought":
      return { kind: "bought", amount: view.bought?.amount ?? null, name: view.bought?.name };
    case "partially_bought": {
      if (!view.bought?.amount) return { kind: "bought" };
      const moved = view.remainder?.kind === "moved" ? view.remainder : null;
      return {
        kind: "partial",
        amount: view.bought.amount,
        name: view.bought.name,
        // A rest moved elsewhere says where it went. Its entry is not known here: such a
        // decision is for showing, and sent again it is refused (`entryId` is no id).
        remainder: moved
          ? {
              kind: "moved",
              // Empty where the note lies beyond the weeks read.
              to: moved.to ? noteId(moved.to) : "",
              shopId: null,
              amount: restOf(view) ?? view.bought.amount,
              entryId: "",
            }
          : { kind: "discarded" },
      };
    }
    case "open":
      return { kind: "open" };
  }
}

/**
 * Something moved from a note to another: shown on its own note as where it went, quietly,
 * "Eier → Di". Each is a line on the other note with a part that would be on this one.
 */
export interface MovedAway {
  line: ShoppingLine;
  to: ShoppingTrip;
}

export function movedAway(note: ShoppingTrip, lines: readonly ShoppingLine[]): MovedAway[] {
  const here = noteId(note);
  return lines
    .filter(
      (line) =>
        noteId({ date: line.shoppingDate, place: line.place }) !== here &&
        line.contributions.some((part) => part.origin && noteId(part.origin) === here),
    )
    .map((line) => ({ line, to: { date: line.shoppingDate, place: line.place } }))
    .sort((a, b) => a.line.label.localeCompare(b.line.label, "de"));
}

/** How many days after its note a line can be moved: the notes are read for the week around. */
export const MOVE_DAYS = 7;

/** The first day a line of a note can be bought on instead: the day after it, never before today. */
function firstDay(noteDate: IsoDate, today: IsoDate): IsoDate {
  return noteDate >= today ? addDays(noteDate, 1) : addDays(today, 1);
}

/**
 * The days a line can be bought on instead: from the day after its note, or from tomorrow
 * where that note's day is over, up to a week after its note. Whether that is too late for
 * the plan does not matter: in the shop the thing is not to be had today, and on a note for
 * later the household knows its week.
 */
export function moveDays(noteDate: IsoDate, today: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (
    let day = firstDay(noteDate, today);
    day <= addDays(noteDate, MOVE_DAYS) || days.length < 2;
    day = addDays(day, 1)
  ) {
    days.push(day);
  }
  return days;
}

/**
 * The day "Verschieben" starts on: the note's own day, so that only the shop changes, or
 * today where that day is over. Started on a day that is over, the move was refused
 * (`canMoveTo`) and the line stayed where it was: 300 g Wiener on Monday's butcher note,
 * moved on Tuesday to Aldi (October 2026).
 */
export function moveStartDay(noteDate: IsoDate, today: IsoDate): IsoDate {
  return noteDate >= today ? noteDate : today;
}

/**
 * Whether a note named in a decision is one a line of `from` may go to: a food errand from
 * today on, at most a week after `from`. The same day is another shop on it.
 */
export function canMoveTo(to: string, from: ShoppingTrip, today: IsoDate): ShoppingTrip | null {
  const trip = readNoteId(to);
  if (!trip || trip.place === "drugstore") return null;
  const last = moveDays(from.date, today).at(-1) as IsoDate;
  return trip.date >= today && trip.date >= from.date && trip.date <= last ? trip : null;
}
