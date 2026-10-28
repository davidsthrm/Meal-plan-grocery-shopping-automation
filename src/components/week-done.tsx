"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** The colours of the kinds of meals, which fly off the stamp. */
const COLOURS = [
  "var(--color-veg)",
  "var(--color-veg-ink)",
  "var(--color-fish)",
  "var(--color-fish-ink)",
  "var(--color-poultry)",
  "var(--color-poultry-ink)",
  "var(--color-meat)",
  "var(--color-meat-ink)",
  "var(--color-sweet)",
  "var(--color-note)",
];

/** Where each piece flies to, spread around the stamp: always the same, never random. */
const PIECES = Array.from({ length: 18 }, (_, at) => {
  const angle = (at / 18) * Math.PI * 2 + (at % 2) * 0.17;
  const reach = 7 + (at % 3) * 2.2;
  return {
    x: `${(Math.cos(angle) * reach).toFixed(2)}rem`,
    y: `${(Math.sin(angle) * reach * 0.8).toFixed(2)}rem`,
    turn: `${(at % 2 ? 1 : -1) * (120 + at * 23)}deg`,
    colour: COLOURS[at % COLOURS.length],
    round: at % 3 === 0,
  };
});

const noSubscription = () => () => undefined;

/** Remembered per device, so that each week is celebrated once, and only having been open. */
const SEEN_OPEN = "woche-offen:";
const CELEBRATED = "woche-gefeiert:";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function mark(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Without storage nothing is celebrated: better none than one on every visit.
  }
}

/**
 * A little reward for planning a week ahead to the last meal: a stamp, "Woche steht!", is
 * pressed onto the screen and the colours of the kinds of meals fly off it. It plays once
 * per week and device, and only where this device saw the week still open: a week that was
 * planned before this existed is not celebrated out of the blue.
 */
export function WeekDone({
  week,
  planned,
  meals,
}: {
  week: string;
  /** Every lunch and dinner of the week has something (`weekPlanned`). */
  planned: boolean;
  /** How many meals are planned, for the stamp's second line. */
  meals: number;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  // Into the body: the page comes in with a transform, and inside a transformed element
  // "fixed" is fixed to that element, not to the screen.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  useEffect(() => {
    // The stage is in the body only once the page is live in the browser.
    if (!hydrated) return;
    if (!planned) {
      mark(SEEN_OPEN + week);
      return;
    }
    if (!read(SEEN_OPEN + week) || read(CELEBRATED + week)) return;
    mark(CELEBRATED + week);
    const element = stage.current;
    if (!element) return;
    element.classList.add("celebrating");
    if (status.current) status.current.textContent = "Die Woche ist fertig geplant.";
    const done = window.setTimeout(() => element.classList.remove("celebrating"), 1900);
    return () => window.clearTimeout(done);
  }, [hydrated, week, planned]);

  const overlay = (
    <div ref={stage} className="week-done" aria-hidden>
      <div className="week-done-stamp">
        Woche steht!
        <small>Alle {meals} Mahlzeiten geplant</small>
      </div>
      {PIECES.map((piece, at) => (
        <span
          key={at}
          className="week-done-piece"
          data-round={piece.round || undefined}
          style={
            {
              "--to-x": piece.x,
              "--to-y": piece.y,
              "--turn": piece.turn,
              background: piece.colour,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );

  return (
    <>
      {hydrated && createPortal(overlay, document.body)}
      <p ref={status} role="status" className="sr-only" />
    </>
  );
}
