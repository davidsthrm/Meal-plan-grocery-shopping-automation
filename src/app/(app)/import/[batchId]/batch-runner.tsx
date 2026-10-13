"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mondayOf, weekdayLong } from "@/domain/dates";
import { MEAL_NAME } from "@/lib/plan-text";
import type { BatchProgress } from "@/server/import/batch";
import type { PlacedRecipe } from "@/server/import/for-meal";

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
  // The recipe this upload was made for, once it stands on its meal of the week plan.
  const [placed, setPlaced] = useState<PlacedRecipe | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (initial.done && initial.photosWaiting === 0 && round === 0) return;
    stopped.current = false;
    let active = WORKERS;

    const worker = async () => {
      while (!stopped.current) {
        try {
          const response = await fetch(`/api/import/${batchId}/step`, { method: "POST" });
          if (!response.ok) throw new Error(String(response.status));
          const body = (await response.json()) as {
            result: string;
            progress: BatchProgress;
            placed?: PlacedRecipe | null;
          };
          if (stopped.current) break;
          setProgress(body.progress);
          if (body.placed) setPlaced(body.placed);
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
  }, [batchId, initial.done, initial.photosWaiting, round, router]);

  const { pages, recipes } = progress;
  const looked = pages.total - pages.waiting;
  const read = recipes.total - recipes.waiting;
  const onPlan = placed && (
    <p role="status" className="mt-4 rounded-xl bg-accent-soft px-4 py-3">
      <span className="font-semibold">{placed.title}</span> steht jetzt im Wochenplan:{" "}
      {weekdayLong(placed.date)} {MEAL_NAME[placed.meal]}.{" "}
      <Link href={`/woche?w=${mondayOf(placed.date)}#tag-${placed.date}`} className="link">
        Zum Wochenplan
      </Link>
    </p>
  );
  if (progress.done && !failed) {
    if (progress.photosWaiting === 0) return onPlan;
    // The recipes are read and can be used. What still runs only concerns their photos.
    return (
      <>
        {onPlan}
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Die Fotos werden noch gedreht und zugeschnitten: {progress.photosWaiting}{" "}
          {progress.photosWaiting === 1 ? "Seite" : "Seiten"} offen.
        </p>
      </>
    );
  }

  return (
    <>
      {onPlan}
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
    </>
  );
}
