"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Shop } from "@/domain/catalog";
import type { Pictogram } from "@/domain/library/pictogram";
import type { ShoppingTrip } from "@/domain/shopping-list/trips";
import {
  ActionRow,
  CompleteLines,
  LineActionsHere,
  MovedAwayRow,
  NotBoughtRow,
  type About,
  type ActionLine,
} from "./line-actions";
import { PictogramIcon } from "./pictogram";
import { ShopLogo } from "./shop-logo";
import { leaveSheet } from "./sheet";
import { TickedLast, TickedPart, type TickedSection } from "./ticked-last";
import { useWakeLock } from "./wake-lock";
import { SyncStatus, TickProgress, useAllTicked, type NotePage } from "./ticks";

/** A supermarket as the view shows it: its logo and its name. */
type Market = Pick<Shop, "id" | "name" | "logoUrl">;

/** A note as the view for the shop shows it: by supermarket, then by kind of grocery. */
export interface StoreNote {
  /** Where and when: "Aldi & Rewe", "Montag, 12. Oktober". */
  title: string;
  when: string;
  /** The supermarkets the note is taken to, the main one first; empty for another place. */
  markets: Market[];
  /** The place's sign and pastel, where it has no logos: the market's basket. */
  look: { pictogram: Pictogram; tone: string };
  sections: {
    /** The supermarket, on a note taken to several. */
    shop: Market | null;
    groups: {
      name: string;
      lines: ActionLine[];
    }[];
  }[];
  /** "Nicht gekaufte Einträge": removed, or the rest not bought. */
  notBought: { line: ActionLine; amount: string | null; reason: string | null }[];
  /** What was on the note and is bought on another one now. */
  moved: { line: { key: string; label: string; about: About }; to: ShoppingTrip }[];
}

/**
 * "Jetzt einkaufen": the note alone on the whole screen, for the shop. Large rows, each a
 * button that buys it, with its bin, pen and arrow quiet at the end (`ActionRow`), and the
 * screen stays on. A link to
 * "#laden" opens it too. It needs scripts; without them the note itself is there.
 */
export function StoreView({ page, note }: { page: NotePage; note: StoreNote }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const lines = note.sections.flatMap((section) => section.groups.flatMap((group) => group.lines));
  const rows: TickedSection[] = note.sections.map((section) => ({
    shop: section.shop,
    groups: section.groups.map((group) => ({
      name: group.name,
      lines: group.lines.map((line) => ({
        ...line,
        row: <ActionRow line={line} variant="store" />,
      })),
    })),
  }));
  const allTicked = useAllTicked(page, lines);
  useWakeLock(open);

  const close = useCallback(() => leaveSheet(dialog.current, () => setOpen(false)), []);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  useEffect(() => {
    const asked = () => {
      if (window.location.hash !== "#laden") return;
      // Going back must not open it again.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setOpen(true);
    };
    asked();
    window.addEventListener("hashchange", asked);
    return () => window.removeEventListener("hashchange", asked);
  }, []);

  if (lines.length === 0) return null;
  return (
    <>
      <a
        href="#laden"
        className="btn btn-primary print:hidden"
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        Jetzt einkaufen
      </a>
      <dialog
        ref={dialog}
        className="store-view"
        aria-label={`Einkaufen: ${note.title}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {open && (
          <LineActionsHere>
            <div className="mx-auto flex min-h-full max-w-xl flex-col">
              <header className="store-head">
                {note.markets.length > 0 ? (
                  <span className="flex shrink-0 -space-x-2">
                    {note.markets.slice(0, 3).map((market) => (
                      <ShopLogo
                        key={market.id}
                        shop={market}
                        size={note.markets.length > 1 ? 36 : 44}
                      />
                    ))}
                  </span>
                ) : (
                  <span className={`badge size-11 shrink-0 ${note.look.tone}`}>
                    <PictogramIcon name={note.look.pictogram} className="h-[66%] w-[66%]" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl leading-tight font-bold tracking-tight">
                    {note.title}
                  </h2>
                  <p className="text-muted">
                    {note.when} ·{" "}
                    <span className="whitespace-nowrap">
                      <TickProgress page={page} lines={lines} />
                    </span>
                  </p>
                </div>
                <button type="button" className="btn shrink-0" onClick={close}>
                  Fertig
                </button>
              </header>
              <SyncStatus className="mx-4 mt-2" />
              <TickedLast page={page} sections={rows}>
                <div className="flex-1 px-2 pb-4">
                  <TickedPart part="open" variant="store" />
                  {note.moved.length > 0 && (
                    <section aria-label="Verschoben" className="mx-2 mt-6">
                      <h4 className="eyebrow">Verschoben</h4>
                      <ul className="mt-1">
                        {note.moved.map((entry) => (
                          <MovedAwayRow key={entry.line.key} {...entry} />
                        ))}
                      </ul>
                    </section>
                  )}
                  {note.notBought.length > 0 && (
                    <section aria-label="Nicht gekaufte Einträge" className="mx-2 mt-6">
                      <h4 className="eyebrow">Nicht gekaufte Einträge</h4>
                      <ul className="mt-1">
                        {note.notBought.map((entry) => (
                          <NotBoughtRow key={entry.line.key} {...entry} />
                        ))}
                      </ul>
                    </section>
                  )}
                  {/* What is in the trolley, last of all: the open lines are what is read. */}
                  <TickedPart part="bought" variant="store" />
                </div>
              </TickedLast>
              <footer className="store-foot">
                {allTicked ? (
                  <button type="button" className="btn btn-primary w-full" onClick={close}>
                    Fertig
                  </button>
                ) : (
                  <CompleteLines lines={lines} className="btn w-full" />
                )}
              </footer>
            </div>
          </LineActionsHere>
        )}
      </dialog>
    </>
  );
}
