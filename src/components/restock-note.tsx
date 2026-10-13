import Link from "next/link";
import { listRestock, noteRestock, strikeRestock } from "@/app/(app)/merkzettel/actions";
import { mondayOf, weekdayLong, type IsoDate } from "@/domain/dates";
import { dayTitle } from "@/lib/list-text";
import type { PlacedRestock } from "@/server/shopping/restock";
import { CloseIcon } from "./icons";
import { SubmitButton } from "./submit-button";

interface Props {
  items: readonly PlacedRestock[];
  /** The page the note is shown on: where its buttons lead back to. */
  back: string;
  /** The shopping days entries were just put on. */
  moved?: readonly IsoDate[];
  /** Names the field offers while typing. */
  suggestions?: readonly string[];
  /** On its own page the note is the page: its name is the page's title. */
  asPage?: boolean;
}

/**
 * The yellow note for what ran out at home. Anyone writes on it; "Auf den Einkaufszettel"
 * moves an entry to the list of the next shopping day.
 */
export function RestockNote({ items, back, moved = [], suggestions = [], asPage = false }: Props) {
  return (
    <section aria-label="Merkzettel" className="note px-4 pt-6 pb-4 sm:px-5 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {asPage ? (
          <h1 className="text-2xl font-bold tracking-tight">Merkzettel</h1>
        ) : (
          <h2 className="text-lg font-bold tracking-tight">Merkzettel</h2>
        )}
        <p className="muted text-sm">Was zu Hause ausgegangen ist</p>
      </div>

      <form action={noteRestock} className="mt-3 flex gap-2">
        <input type="hidden" name="back" value={back} />
        <label className="flex-1">
          <span className="sr-only">Auf den Merkzettel schreiben</span>
          <input
            name="text"
            maxLength={120}
            list="merkzettel-namen"
            autoComplete="off"
            className="field border-note-line bg-white/60"
            placeholder="z. B. Mehl"
          />
        </label>
        <SubmitButton className="btn border-note-line bg-white/60">Notieren</SubmitButton>
      </form>
      {suggestions.length > 0 && (
        <datalist id="merkzettel-namen">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      {moved.length > 0 && (
        <p role="status" className="mt-3 text-sm font-semibold">
          Steht auf dem Einkaufszettel für{" "}
          {moved.map((date, at) => (
            <span key={date}>
              {at > 0 && " und "}
              <Link
                href={`/einkauf?w=${mondayOf(date)}&tag=${date}`}
                className="underline underline-offset-4"
              >
                {dayTitle({ date })}
              </Link>
            </span>
          ))}
          .
        </p>
      )}

      {items.length === 0 ? (
        <p className="muted mt-3 text-sm">Es steht nichts darauf.</p>
      ) : (
        <ul className="note-lines mt-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-32 flex-1">
                <span className="font-semibold">{item.text}</span>
                {item.trip && (
                  <span className="muted text-sm"> · {weekdayLong(item.trip.date)}</span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <form action={listRestock}>
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton
                    className="btn btn-small border-note-line bg-white/60"
                    label={`${item.text} auf den Einkaufszettel`}
                  >
                    Auf den Einkaufszettel
                  </SubmitButton>
                </form>
                <form action={strikeRestock}>
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton
                    className="muted flex size-10 items-center justify-center rounded-full hover:text-danger"
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
        <form action={listRestock} className="mt-3">
          <input type="hidden" name="back" value={back} />
          <SubmitButton className="btn btn-primary btn-small">
            Alles auf den Einkaufszettel
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
