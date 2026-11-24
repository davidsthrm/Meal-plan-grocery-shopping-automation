"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Where the panel stands beside the list (`.filter-aside` in globals.css). */
const BESIDE = "(min-width: 46rem) and (min-height: 30rem)";

/** The panel of `FilterPanel` itself, the browser's popover. */
export function FilterFrame({
  id,
  layout,
  children,
}: {
  id: string;
  layout: "aside" | "sheet";
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // On an iPad the first choice on Entdecken puts the panel beside the list, but the sheet
  // it was stayed open in the browser's top layer: a panel across the screen that let the
  // page show through, with neither its cross nor "… anzeigen" (November 2026). On a phone
  // it stays a sheet, and open.
  useLayoutEffect(() => {
    const element = panel.current;
    if (layout === "aside" && element?.matches(":popover-open") && matchMedia(BESIDE).matches) {
      element.hidePopover();
    }
  }, [layout]);

  return (
    <div
      ref={panel}
      id={id}
      popover="auto"
      className={`filter-panel ${layout === "aside" ? "filter-aside" : ""}`}
      aria-label="Filter"
    >
      {children}
    </div>
  );
}
