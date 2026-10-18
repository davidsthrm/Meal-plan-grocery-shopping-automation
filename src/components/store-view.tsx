"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CompleteNote,
  SyncStatus,
  TickButton,
  TickProgress,
  useAllTicked,
  type NotePage,
  type PageLine,
} from "./ticks";

/** A note as the view for the shop shows it: by supermarket, then by kind of grocery. */
export interface StoreNote {
  /** Where and when: "Aldi & Rewe", "Montag, 12. Oktober". */
  title: string;
  when: string;
  sections: {
    /** The supermarket, on a note taken to several. */
    shop: string | null;
    groups: {
      name: string;
      lines: (PageLine & { text: string; shop: string | null })[];
    }[];
  }[];
}

/**
 * Keeps the screen on while `active`, where the browser can: nobody wants to unlock the
 * phone between two shelves. The browser lets go when the app goes to the background; it
 * is asked again when it comes back.
 */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let over = false;
    const take = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const taken = await navigator.wakeLock.request("screen");
        if (over) void taken.release();
        else lock = taken;
      } catch {
        // Refused (battery saver, no permission): the screen dims as it always does.
      }
    };
    void take();
    document.addEventListener("visibilitychange", take);
    return () => {
      over = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [active]);
}

/**
 * "Jetzt einkaufen": the note alone on the whole screen, for the shop. Large rows, each a
 * button to tick, nothing else to hit by mistake, and the screen stays on. A link to
 * "#laden" opens it too. It needs scripts; without them the note itself is there.
 */
export function StoreView({ page, note }: { page: NotePage; note: StoreNote }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const lines = note.sections.flatMap((section) => section.groups.flatMap((group) => group.lines));
  const allTicked = useAllTicked(page, lines);
  useWakeLock(open);

  const close = useCallback(() => {
    dialog.current?.close();
    setOpen(false);
  }, []);

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
          <div className="mx-auto flex min-h-full max-w-xl flex-col">
            <header className="store-head">
              <div className="min-w-0">
                <h2 className="truncate text-xl leading-tight font-bold tracking-tight">
                  {note.title}
                </h2>
                <p className="text-muted">
                  {note.when} · <TickProgress page={page} lines={lines} />
                </p>
              </div>
              <button type="button" className="btn shrink-0" onClick={close}>
                Fertig
              </button>
            </header>
            <SyncStatus className="mx-4 mt-2" />
            <div className="flex-1 px-2 pb-4">
              {note.sections.map((section) => (
                <section key={section.shop ?? "alle"} aria-label={section.shop ?? undefined}>
                  {section.shop && (
                    <h3 className="mx-2 mt-5 border-b border-line pb-1 text-lg font-bold tracking-tight">
                      {section.shop}
                    </h3>
                  )}
                  {section.groups.map((group) => (
                    <section key={group.name} aria-label={group.name} className="mt-4">
                      <h4 className="eyebrow mx-2">{group.name}</h4>
                      <ul className="mt-1">
                        {group.lines.map((line) => (
                          <li key={line.key}>
                            <TickButton page={page} line={line} label={line.text}>
                              <span className="store-text">
                                {line.text}
                                {line.shop && <span className="text-muted"> · {line.shop}</span>}
                              </span>
                            </TickButton>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </section>
              ))}
            </div>
            <footer className="store-foot">
              {allTicked ? (
                <button type="button" className="btn btn-primary w-full" onClick={close}>
                  Fertig
                </button>
              ) : (
                <CompleteNote page={page} lines={lines} className="btn w-full" />
              )}
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}
