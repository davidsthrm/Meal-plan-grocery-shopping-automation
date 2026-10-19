import type { Place } from "../catalog";
import { addDays, type IsoDate } from "../dates";
import type { Amount } from "../units";
import type { ViewLine } from "./present";
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
 * The line as the plan has it, kept next to what was bought at the first decision that
 * departs from it.
 */
export interface PlannedLine {
  name: string;
  quantity: number | null;
  unit: string | null;
  date: IsoDate;
  place: Place;
  shopId: string | null;
}

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
    case "partially_bought":
      // The rest of a part moved elsewhere is not known here as a decision: the page gives
      // it back as discarded, which keeps the line closed and the amount bought.
      return view.bought?.amount
        ? {
            kind: "partial",
            amount: view.bought.amount,
            name: view.bought.name,
            remainder: { kind: "discarded" },
          }
        : { kind: "bought" };
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

/** How many days ahead a line can be moved: the notes are read for the week around. */
export const MOVE_DAYS = 7;

/**
 * The days a line can be bought on instead, from today: "Morgen" and "Übermorgen" first,
 * then any day up to a week ahead. Whether it is then too late does not matter: the
 * decision is made in the shop, where the thing is not to be had today.
 */
export function moveDays(today: IsoDate): IsoDate[] {
  return Array.from({ length: MOVE_DAYS }, (_, at) => addDays(today, at + 1));
}

/** Whether a note named in a decision is one a line may go to: today or up to a week on. */
export function canMoveTo(to: string, today: IsoDate): ShoppingTrip | null {
  const trip = readNoteId(to);
  if (!trip || trip.place === "drugstore") return null;
  return trip.date >= today && trip.date <= addDays(today, MOVE_DAYS) ? trip : null;
}
