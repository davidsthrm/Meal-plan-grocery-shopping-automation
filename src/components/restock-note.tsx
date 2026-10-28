"use client";

import Link from "next/link";
import { useActionState } from "react";
import { tellRestock } from "@/app/(app)/merkzettel/actions";
import { mondayOf } from "@/domain/dates";
import { noteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import { dayName, noteName } from "@/lib/list-text";
import { CloseIcon } from "./icons";
import { SubmitButton } from "./submit-button";

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
 * The yellow note for what ran out at home. Anyone writes on it; "Auf den Einkaufszettel"
 * moves an entry to the note of the next errand that sells it.
 */
export function RestockNote({ items, asPage = false, onLeave }: Props) {
  const [state, tell] = useActionState(tellRestock, { moved: [] });
  const quiet = "border-note-line bg-white/60";
  return (
    <section aria-label="Merkzettel" className="note px-4 pt-6 pb-4 sm:px-5 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {asPage ? (
          <h1 className="text-2xl font-bold tracking-tight">Merkzettel</h1>
        ) : (
          <h2 className="text-xl font-bold tracking-tight">Merkzettel</h2>
        )}
        <p className="muted text-sm">Was zu Hause ausgegangen ist</p>
      </div>

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
        <SubmitButton className={`btn ${quiet}`}>Notieren</SubmitButton>
      </form>

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
        <p className="muted mt-3 text-sm">Nichts ist ausgegangen.</p>
      ) : (
        <ul className="note-lines mt-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-32 flex-1">
                <span className="font-semibold">{item.text}</span>
                {item.trip && (
                  <span className="muted text-sm">
                    {" "}
                    ·{" "}
                    {item.supermarket
                      ? `${dayName(item.trip.date)} ${item.supermarket}`
                      : noteName(item.trip)}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <form action={tell}>
                  <input type="hidden" name="do" value="list" />
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton
                    className={`btn btn-small ${quiet}`}
                    label={`${item.text} auf den Einkaufszettel`}
                  >
                    Auf den Einkaufszettel
                  </SubmitButton>
                </form>
                <form action={tell}>
                  <input type="hidden" name="do" value="strike" />
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton
                    className="muted flex size-11 items-center justify-center rounded-full hover:text-danger"
                    label={`${item.text} streichen`}
                  >
                    <CloseIcon />
                  </SubmitButton>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      {items.length > 1 && (
        <form action={tell} className="mt-3">
          <input type="hidden" name="do" value="list" />
          <SubmitButton className="btn btn-primary btn-small">
            Alles auf den Einkaufszettel
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
