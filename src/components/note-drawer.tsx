"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NoteIcon } from "./icons";
import { RestockNote } from "./restock-note";
import type { ComponentProps } from "react";

/** How long the note takes to go back up, as the stylesheet has it. */
const UP_MS = 220;

/**
 * The note for what ran out at home, in the header of every page. It does not lead to a
 * page: it is pulled down over the one that is open, like a note on a string, and pushed
 * back up when it is done with. Anything that links to "#merkzettel" pulls it down too.
 * Without scripts the sign is a plain link to the note's own page.
 */
export function NoteDrawer({ items }: { items: ComponentProps<typeof RestockNote>["items"] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The note is part of the page only while it is down: what is written on it is not
  // mistaken for something the page says.
  const [down, setDown] = useState(false);

  const pullDown = useCallback(() => setDown(true), []);
  const pushUp = useCallback(() => {
    const note = dialog.current;
    if (!note?.open) return;
    note.classList.add("going");
    setTimeout(() => {
      note.classList.remove("going");
      note.close();
      setDown(false);
    }, UP_MS);
  }, []);

  useEffect(() => {
    const note = dialog.current;
    if (down && note && !note.open) note.showModal();
  }, [down]);

  useEffect(() => {
    const asked = () => {
      if (window.location.hash !== "#merkzettel") return;
      // The address stays that of the page: going back must not pull the note down again.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      pullDown();
    };
    asked();
    window.addEventListener("hashchange", asked);
    return () => window.removeEventListener("hashchange", asked);
  }, [pullDown]);

  return (
    <>
      <a
        href="/merkzettel"
        className="btn min-h-11 gap-1.5 border-note-line bg-note px-3 text-sm"
        aria-haspopup="dialog"
        aria-label={`Merkzettel, ${items.length === 1 ? "1 Eintrag" : `${items.length} Einträge`}`}
        onClick={(event) => {
          event.preventDefault();
          pullDown();
        }}
      >
        <NoteIcon />
        Merkzettel
        {items.length > 0 && <span className="tabular-nums">{items.length}</span>}
      </a>
      <dialog
        ref={dialog}
        className="note-drawer"
        aria-label="Merkzettel"
        // A tap beside the note puts it away, and so does the escape key, without a jump.
        onClick={(event) => {
          if (event.target === dialog.current) pushUp();
        }}
        onCancel={(event) => {
          event.preventDefault();
          pushUp();
        }}
      >
        {down && (
          <>
            <div className="note-drawer-string" aria-hidden />
            <RestockNote items={items} onLeave={pushUp} />
            <button type="button" className="note-drawer-close" onClick={pushUp}>
              Zurückstecken
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
