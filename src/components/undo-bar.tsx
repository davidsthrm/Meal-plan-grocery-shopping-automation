"use client";

import { useEffect, useRef } from "react";

/** What was just decided, with the way to take it back, if there is one. */
export interface Toast {
  id: number;
  text: string;
  undo: (() => void) | null;
}

/** How long a decision can be taken back from the bar at the foot. */
const UNDO_MS = 5000;

/**
 * The bar at the foot that says what was just decided, with "Widerrufen" for a few seconds.
 * It lies above everything, also above the view for the shop: a popover in the top layer.
 */
export function UndoBar({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  // How many views over the whole screen were open when the bar was last shown.
  const viewsWhenShown = useRef(0);
  useEffect(() => {
    const element = bar.current;
    if (!element || !toast) return;
    const views = document.querySelectorAll("dialog:modal").length;
    if (!element.matches(":popover-open")) {
      element.showPopover();
    } else if (views > viewsWhenShown.current) {
      // A view opened over the page since: shown again, the bar comes above it.
      element.hidePopover();
      element.showPopover();
    }
    // Otherwise it stays where it is and only its words change: shown afresh for every
    // decision, it rose again from nothing and jumped under quick swipes.
    viewsWhenShown.current = views;
    const timer = window.setTimeout(() => {
      element.hidePopover();
      onDone();
    }, UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <div ref={bar} popover="manual" className="undo-bar" role="status" aria-live="polite">
      {toast && (
        <>
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="undo-button"
              onClick={() => {
                toast.undo?.();
                bar.current?.hidePopover();
                onDone();
              }}
            >
              Widerrufen
            </button>
          )}
        </>
      )}
    </div>
  );
}
