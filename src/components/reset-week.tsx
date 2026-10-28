"use client";

import { useEffect, useRef, useState } from "react";
import { EraserIcon } from "./icons";

/** How long the rubber takes over the sheet, as the stylesheet has it. */
const RUB_MS = 1100;
/** How long to wait for the empty week before showing the sheet again in any case. */
const GIVE_UP_MS = 8000;

/**
 * Empties a whole week, after asking. A rubber goes over the plan before it is empty: the
 * sheet named by `sheet` gets the class "erasing" for that long, and then the form is sent.
 * Whoever asked for less motion gets none, and without scripts the form is simply sent.
 *
 * The class makes everything on the sheet invisible and stays there until it is taken off:
 * the sheet is the same element before and after. So it comes off as soon as the empty week
 * is drawn on it. Left on, the rubber ended on a blank page instead of the plan to fill in.
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
  const restore = useRef<() => void>(() => {});
  // Whatever happens to this button, the sheet must not stay rubbed out.
  useEffect(() => () => restore.current(), []);

  /** Shows the sheet again once its content has been drawn anew, or after a while. */
  function showAgainWhenRedrawn(paper: HTMLElement) {
    let timer = 0;
    const redrawn = new MutationObserver(() => restore.current());
    restore.current = () => {
      redrawn.disconnect();
      window.clearTimeout(timer);
      paper.classList.remove("erasing");
      restore.current = () => {};
      done.current = false;
      setRubbing(false);
      setAsking(false);
    };
    redrawn.observe(paper, { childList: true, subtree: true, characterData: true });
    timer = window.setTimeout(() => restore.current(), GIVE_UP_MS);
  }

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
          showAgainWhenRedrawn(paper);
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
            className="link min-h-11 text-sm"
            disabled={rubbing}
            onClick={() => setAsking(false)}
          >
            Abbrechen
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-small max-sm:px-3"
          aria-label="Ganze Woche leeren"
          title="Woche leeren"
          onClick={() => setAsking(true)}
        >
          <EraserIcon />
          {/* On a phone the sign alone: the plan's actions stay in one row. */}
          <span className="max-sm:hidden">Woche leeren</span>
        </button>
      )}
    </form>
  );
}
