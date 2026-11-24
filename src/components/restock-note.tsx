"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { tellRestock, type RestockState } from "@/app/(app)/merkzettel/actions";
import { mondayOf } from "@/domain/dates";
import { noteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { dayName, noteName } from "@/lib/list-text";
import { useOnline } from "./connection";
import { CloseIcon, ListIcon, PlusIcon } from "./icons";
import { PictogramIcon } from "./pictogram";
import { SubmitButton } from "./submit-button";

/** How long an entry struck can be written again with one tap. */
const UNDO_MS = 5000;

interface Props {
  /**
   * The entries, each with the errand it would be bought on, and at a supermarket errand the
   * supermarket its kind of grocery is bought at.
   */
  items: readonly {
    id: string;
    text: string;
    trip: ShoppingTrip | null;
    supermarket?: string | null;
  }[];
  /** On its own page the note is the page: its name is the page's title. */
  asPage?: boolean;
  /** Told when a link on the note is followed, so that what holds the note can put it away. */
  onLeave?: () => void;
}

/**
 * The yellow note for what ran out at home. Anyone writes on it; the sign of the shopping
 * notes beside an entry ("Auf den Einkaufszettel") moves it to the note of the next errand
 * that sells it. As narrow as a real sticky note, each entry one line: its name, where it
 * will go in small words, and two quiet signs (22 November 2026). Before, every entry had a
 * pill of its own under it and the note was a page of buttons.
 */
export function RestockNote({ items, asPage = false, onLeave }: Props) {
  const [state, tell] = useActionState(tellRestock, { moved: [] });
  const online = useOnline();
  // The entry struck last says so on the note for a few seconds, to write it again: the cross
  // tapped by mistake lost it for good. A bar at the foot would lie under the note's dim
  // (audit, 24 November 2026).
  const [over, setOver] = useState<RestockState | null>(null);
  useEffect(() => {
    if (!state.struck) return;
    const timer = setTimeout(() => setOver(state), UNDO_MS);
    return () => clearTimeout(timer);
  }, [state]);
  const struck = over === state ? null : state.struck;
  const quiet = "border-note-line bg-white/60";
  return (
    <section
      aria-label="Merkzettel"
      className="note mx-auto w-full max-w-[18rem] px-4 pt-6 pb-3 print:hidden"
    >
      {asPage ? (
        <h1 className="text-xl font-bold tracking-tight">Merkzettel</h1>
      ) : (
        <h2 className="text-xl font-bold tracking-tight">Merkzettel</h2>
      )}

      <form action={tell} className="mt-3 flex gap-2">
        <input type="hidden" name="do" value="note" />
        <label className="flex-1">
          <span className="sr-only">Auf den Merkzettel schreiben</span>
          <input
            name="text"
            maxLength={120}
            autoComplete="off"
            className={`field ${quiet}`}
            placeholder="z. B. Mehl"
          />
        </label>
        <SubmitButton
          className={`btn ${quiet} w-11 shrink-0 px-0`}
          label="Notieren"
          title="Notieren"
        >
          <PlusIcon />
        </SubmitButton>
      </form>
      {/* The bar that says so lies under the note's dim. */}
      {!online && (
        <p className="mt-2 text-sm text-warn">Offline: Das geht erst wieder mit Verbindung.</p>
      )}

      {struck && (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
          <span>{struck} gestrichen</span>
          <form action={tell}>
            <input type="hidden" name="do" value="note" />
            <input type="hidden" name="text" value={struck} />
            <SubmitButton className="link min-h-11">Widerrufen</SubmitButton>
          </form>
        </div>
      )}

      {state.moved.length > 0 && (
        <p role="status" className="mt-3 text-sm font-semibold">
          Steht auf dem Einkaufszettel:{" "}
          {state.moved.map((trip, at) => (
            <span key={noteId(trip)}>
              {at > 0 && ", "}
              <Link
                href={`/einkauf?w=${mondayOf(trip.date)}&zettel=${noteId(trip)}`}
                className="underline underline-offset-4"
                onClick={onLeave}
              >
                {noteName(trip)}
              </Link>
            </span>
          ))}
        </p>
      )}

      {items.length === 0 ? (
        <>
          <PictogramIcon name="korb" className="empty-picture mt-3" />
          <p className="muted text-sm">Nichts ist ausgegangen.</p>
        </>
      ) : (
        <ul className="note-lines mt-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              <span className="min-w-0 flex-1 py-2.5">
                <span className="font-semibold">{item.text}</span>
                {item.trip && (
                  <span className="muted text-xs">
                    {" "}
                    {item.supermarket
                      ? `${dayName(item.trip.date)} ${item.supermarket}`
                      : noteName(item.trip)}
                  </span>
                )}
              </span>
              <form action={tell}>
                <input type="hidden" name="do" value="list" />
                <input type="hidden" name="id" value={item.id} />
                <SubmitButton
                  className="icon-button text-note-ink"
                  label={`${item.text} auf den Einkaufszettel`}
                  title="Auf den Einkaufszettel"
                >
                  <ListIcon />
                </SubmitButton>
              </form>
              <form action={tell} className="-mr-2.5">
                <input type="hidden" name="do" value="strike" />
                <input type="hidden" name="id" value={item.id} />
                <SubmitButton
                  className="icon-button text-note-ink hover:text-danger"
                  label={`${item.text} streichen`}
                  title="Streichen"
                >
                  <CloseIcon />
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      {items.length > 1 && (
        <form action={tell} className="mt-1">
          <input type="hidden" name="do" value="list" />
          <SubmitButton className="link min-h-11 text-sm">Alle auf den Einkaufszettel</SubmitButton>
        </form>
      )}
    </section>
  );
}
