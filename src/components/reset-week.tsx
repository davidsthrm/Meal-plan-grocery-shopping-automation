"use client";

import { useRef, useState } from "react";
import { EraserIcon } from "./icons";

/** How long the rubber takes over the sheet, as the stylesheet has it. */
const RUB_MS = 1100;

/**
 * Empties a whole week, after asking. A rubber goes over the plan before it is empty: the
 * sheet named by `sheet` gets the class "erasing" for that long, and then the form is sent.
 * Whoever asked for less motion gets none, and without scripts the form is simply sent.
 */
export function ResetWeek({
  action,
  week,
  sheet,
}: {
  action: (form: FormData) => Promise<void>;
  week: string;
  /** The id of the element the rubber goes over. */
  sheet: string;
}) {
  const [asking, setAsking] = useState(false);
  const [rubbing, setRubbing] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef(false);

  return (
    <form
      ref={form}
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        if (done.current) return;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const paper = document.getElementById(sheet);
        if (still || !paper) return;
        // First the rubber, then the empty week.
        event.preventDefault();
        setRubbing(true);
        paper.classList.add("erasing");
        setTimeout(() => {
          done.current = true;
          form.current?.requestSubmit();
        }, RUB_MS);
      }}
    >
      <input type="hidden" name="week" value={week} />
      {asking ? (
        <>
          <span className="text-sm">Alle Mahlzeiten dieser Woche entfernen?</span>
          <button className="btn btn-small btn-danger" disabled={rubbing}>
            <EraserIcon />
            Ja, leeren
          </button>
          <button
            type="button"
            className="link min-h-10 text-sm"
            disabled={rubbing}
            onClick={() => setAsking(false)}
          >
            Abbrechen
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-small"
          aria-label="Ganze Woche leeren"
          onClick={() => setAsking(true)}
        >
          <EraserIcon />
          Woche leeren
        </button>
      )}
    </form>
  );
}
