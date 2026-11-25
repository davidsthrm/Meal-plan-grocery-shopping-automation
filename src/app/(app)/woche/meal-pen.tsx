"use client";

import { useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ActionSheet, useCloseSheet } from "@/components/action-sheet";
import { PenIcon } from "@/components/icons";

/**
 * The meal whose pen is open, by its id. A change made in the sheet comes back as a new page,
 * which may draw the meal afresh: the sheet opens again as it was, so that the persons can
 * be stepped more than once. A meal keeps its id while it is changed or moved.
 */
let openMeal: string | null = null;

/**
 * The one pen of a planned meal and what it opens: everything the row of signs under the
 * meal held, each a row of its own. On a phone a sheet from the foot of the screen; from the
 * tablet width on a panel at the pen. While planning, a meal was its name, a stepper and a
 * row of five signs, about 150 points on a phone, and a week four screens long (decided on
 * 25 November 2026).
 */
export function MealPen({
  slot,
  what,
  children,
}: {
  /** The meal's id. */
  slot: string;
  /** The meal in words: "Montag Abend". */
  what: string;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<"no" | "yes" | "again">(() =>
    openMeal === slot ? "again" : "no",
  );
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className="pen-button"
        aria-label={`${what} bearbeiten`}
        aria-haspopup="dialog"
        aria-expanded={open !== "no"}
        title="Bearbeiten"
        onClick={() => {
          openMeal = slot;
          setOpen("yes");
        }}
      >
        <PenIcon />
      </button>
      {open !== "no" && (
        <ActionSheet
          title={what}
          closeLabel="Fertig"
          anchor={anchor}
          still={open === "again"}
          onClose={() => {
            openMeal = null;
            setOpen("no");
          }}
        >
          <PenRows>{children}</PenRows>
        </ActionSheet>
      )}
    </>
  );
}

/**
 * The rows of the sheet. A step of the persons or of the extra portions leaves it open; any
 * other form is done with it, and a link leads away from it.
 */
function PenRows({ children }: { children: ReactNode }) {
  const close = useCloseSheet();
  return (
    <div
      className="pen-rows"
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as Element).closest("a")) openMeal = null;
      }}
      onSubmit={(event: FormEvent<HTMLDivElement>) => {
        if ((event.target as Element).closest(".stepper")) return;
        openMeal = null;
        close();
      }}
    >
      {children}
    </div>
  );
}

/** A row of the sheet that opens what it holds under it: "Mehr kochen für Reste". */
export function PenFold({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="pen-row"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {icon}
        {label}
      </button>
      {open && <div className="pen-fold">{children}</div>}
    </div>
  );
}
