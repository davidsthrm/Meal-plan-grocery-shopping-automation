"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The bar for what is done with the recipes ticked in the Regal. It counts the ticked boxes
 * of its form and stays out of sight while none is. "Alle auf dieser Seite" ticks every box
 * of the page. Without a script the bar is always there and the server reads the boxes.
 *
 * Once scripts run it lies directly in the body: the page comes in with a transform
 * (`page-in`), and inside a transformed element "fixed" means fixed to that element, so the
 * bar stood at the end of the page instead of at the foot of the screen.
 */
export function SelectionBar({
  form,
  page,
  children,
}: {
  /** The id of the form the boxes belong to. */
  form: string;
  /** What the page shows: the boxes are new, and counted again, when it changes. */
  page: string;
  children: ReactNode;
}) {
  const [count, setCount] = useState<number | null>(null);
  // The body once the page runs in the browser; null on the server and while hydrating.
  const body = useSyncExternalStore(
    () => () => {},
    () => document.body,
    () => null,
  );

  useEffect(() => {
    const boxes = () => [
      ...document.querySelectorAll<HTMLInputElement>(`input[form="${form}"][name="rezept"]`),
    ];
    const all = document.querySelector<HTMLInputElement>(`input[form="${form}"][name="alle"]`);
    const update = () => setCount(boxes().filter((box) => box.checked).length);
    const changed = (event: Event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.form?.id !== form) return;
      if (event.target === all) {
        for (const box of boxes()) box.checked = all.checked;
      } else if (all && event.target.name === "rezept") {
        all.checked = boxes().every((box) => box.checked);
      }
      update();
    };
    document.addEventListener("change", changed);
    update();
    return () => document.removeEventListener("change", changed);
  }, [form, page]);

  const bar = (
    <details className="group selection-bar" data-empty={count === 0}>
      <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span role="status">
          {count === null
            ? "Ausgewählte Rezepte ändern"
            : count === 1
              ? "1 Rezept ausgewählt"
              : `${count} Rezepte ausgewählt`}
        </span>
        <span className="text-sm text-accent">
          <span className="group-open:hidden">Ändern</span>
          <span className="hidden group-open:inline">Schließen</span>
        </span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
  return body ? createPortal(bar, body) : bar;
}
