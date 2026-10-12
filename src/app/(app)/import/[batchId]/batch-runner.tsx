"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BatchProgress } from "@/server/import/batch";

/** How many steps run side by side. More would only run into the model's rate limits. */
const WORKERS = 3;

/**
 * Drives the import of a batch while this page is open: asks the server for the next step
 * again and again until nothing is left. Closing the page pauses the batch; opening it again
 * continues where it stopped.
 */
export function BatchRunner({ batchId, initial }: { batchId: string; initial: BatchProgress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const stopped = useRef(false);

  useEffect(() => {
    if (initial.done && round === 0) return;
    stopped.current = false;
    let active = WORKERS;

    const worker = async () => {
      while (!stopped.current) {
        try {
          const response = await fetch(`/api/import/${batchId}/step`, { method: "POST" });
          if (!response.ok) throw new Error(String(response.status));
          const body = (await response.json()) as { result: string; progress: BatchProgress };
          if (stopped.current) break;
          setProgress(body.progress);
          if (body.result === "done") break;
          if (body.result === "waiting") await new Promise((resolve) => setTimeout(resolve, 1500));
          // The reading service asked for a pause. Carry on by itself after a while.
          if (body.result === "throttled")
            await new Promise((resolve) => setTimeout(resolve, 20_000));
        } catch {
          if (!stopped.current) setFailed(true);
          stopped.current = true;
          break;
        }
      }
      // Show the finished recipes once the last worker is through.
      if (--active === 0) router.refresh();
    };
    for (let i = 0; i < WORKERS; i++) void worker();
    return () => {
      stopped.current = true;
    };
  }, [batchId, initial.done, round, router]);

  const { pages, recipes } = progress;
  const looked = pages.total - pages.waiting;
  const read = recipes.total - recipes.waiting;
  if (progress.done && !failed) return null;

  return (
    <div className="card mt-4 p-4" aria-live="polite">
      {failed ? (
        <>
          <p className="font-semibold text-danger">Das Einlesen wurde unterbrochen.</p>
          <p className="mt-1 text-muted">Nichts ist verloren. Was fertig war, bleibt fertig.</p>
          <button
            type="button"
            className="btn btn-primary mt-3"
            onClick={() => {
              setFailed(false);
              setRound((value) => value + 1);
            }}
          >
            Weiter einlesen
          </button>
        </>
      ) : (
        <>
          <p className="font-semibold">Wird eingelesen …</p>
          <p className="mt-1 text-muted">
            Seiten angesehen: {looked} von {pages.total}
            {recipes.total > 0 && ` · Rezepte gelesen: ${read} von ${recipes.total}`}
          </p>
          <progress
            className="mt-3 h-2 w-full accent-accent"
            max={pages.total + Math.max(recipes.total, 1)}
            value={looked + read}
          />
          <p className="mt-2 text-sm text-muted">
            Du kannst die Seite offen lassen oder später wiederkommen. Es geht dort weiter, wo es
            aufgehört hat.
          </p>
        </>
      )}
    </div>
  );
}
