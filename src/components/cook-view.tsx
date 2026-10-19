"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stepAfter, stepText } from "@/domain/cooking";
import { TickIcon } from "./icons";
import { leaveSheet } from "./sheet";
import { useWakeLock } from "./wake-lock";

/** An ingredient as the cooking view lists it: "200 g", "Spaghetti", ", gekocht". */
export interface CookIngredient {
  id: string;
  amount: string;
  name: string;
  note: string | null;
}

/**
 * "Kochen": the recipe alone on the whole screen, for the kitchen. The ingredients to tick off
 * as they are set out, the steps in large writing, the one being cooked marked, and "Weiter"
 * and "Zurück" large at the foot for a hand that is not clean. The screen stays on. On an
 * iPad the ingredients stand beside the steps. A link to "#kochen" opens it too; it needs
 * scripts, and without them the recipe page itself is there. Nothing of it is stored.
 */
export function CookView({
  title,
  facts,
  ingredients,
  steps,
}: {
  title: string;
  /** "4 Portionen · 20 Min." */
  facts: string;
  ingredients: CookIngredient[];
  steps: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState<ReadonlySet<string>>(new Set());
  const [step, setStep] = useState<number | null>(null);
  useWakeLock(open);

  const close = useCallback(() => leaveSheet(dialog.current, () => setOpen(false)), []);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  useEffect(() => {
    const asked = () => {
      if (window.location.hash !== "#kochen") return;
      // Going back must not open it again.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setOpen(true);
    };
    asked();
    window.addEventListener("hashchange", asked);
    return () => window.removeEventListener("hashchange", asked);
  }, []);

  // The step being cooked comes into the middle of the screen.
  useEffect(() => {
    if (step === null || !open) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dialog.current
      ?.querySelector(`[data-step="${step}"]`)
      ?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [step, open]);

  const toggle = (id: string) =>
    setReady((before) => {
      const after = new Set(before);
      if (after.has(id)) after.delete(id);
      else after.add(id);
      return after;
    });

  if (ingredients.length === 0 && steps.length === 0) return null;
  const last = step !== null && step === steps.length - 1;
  return (
    <>
      <a
        href="#kochen"
        className="btn print:hidden"
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        Kochen
      </a>
      <dialog
        ref={dialog}
        className="store-view cook-view"
        aria-label={`Kochen: ${title}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {open && (
          <div className="mx-auto flex min-h-full max-w-5xl flex-col">
            <header className="store-head">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl leading-tight font-bold tracking-tight">{title}</h2>
                <p className="text-muted" aria-live="polite">
                  {[facts, stepText(step, steps.length)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button type="button" className="btn shrink-0" onClick={close}>
                Fertig
              </button>
            </header>

            <div className="flex-1 gap-8 px-2 pb-4 tablet:grid tablet:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] tablet:px-4">
              {ingredients.length > 0 && (
                <section
                  aria-labelledby="kochen-zutaten"
                  className="tablet:sticky tablet:top-20 tablet:self-start"
                >
                  <h3 id="kochen-zutaten" className="eyebrow mx-2 mt-4">
                    Zutaten
                  </h3>
                  <ul className="mt-1">
                    {ingredients.map((entry) => {
                      const on = ready.has(entry.id);
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className="store-row"
                            aria-pressed={on}
                            data-on={on}
                            onClick={() => toggle(entry.id)}
                          >
                            <span className="tickbox tickbox-large" data-on={on} aria-hidden>
                              <TickIcon />
                            </span>
                            <span className="store-text min-w-0">
                              {entry.amount && (
                                <span className="font-semibold tabular-nums">{entry.amount} </span>
                              )}
                              {entry.name}
                              {entry.note && <span className="text-muted">, {entry.note}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section aria-labelledby="kochen-schritte">
                <h3 id="kochen-schritte" className="eyebrow mx-2 mt-4">
                  Arbeitsschritte
                </h3>
                {steps.length === 0 ? (
                  <p className="mx-2 mt-2 text-muted">
                    Keine Arbeitsschritte vorhanden. Gekocht wird aus dem Buch.
                  </p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {steps.map((text, at) => (
                      <li key={at}>
                        <button
                          type="button"
                          data-step={at}
                          className="cook-step"
                          aria-current={step === at ? "step" : undefined}
                          data-done={step !== null && at < step}
                          onClick={() => setStep(at)}
                        >
                          <span className="cook-step-number" aria-hidden>
                            {at + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="sr-only">Schritt {at + 1}: </span>
                            {text}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>

            {steps.length > 0 && (
              <footer className="cook-foot">
                <button
                  type="button"
                  className="btn flex-1"
                  disabled={step === null || step === 0}
                  onClick={() => setStep((at) => stepAfter(at, steps.length, "back"))}
                >
                  Zurück
                </button>
                {last ? (
                  <button type="button" className="btn btn-primary flex-[2]" onClick={close}>
                    Fertig gekocht
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary flex-[2]"
                    onClick={() => setStep((at) => stepAfter(at, steps.length, "forward"))}
                  >
                    {step === null ? "Erster Schritt" : "Weiter"}
                  </button>
                )}
              </footer>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
