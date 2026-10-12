"use client";

import { useTransition } from "react";
import { removeBatch } from "../actions";

/** Removes a batch after asking, because the recipes read from it go with it. */
export function DeleteBatchButton({ batchId, recipes }: { batchId: string; recipes: number }) {
  const [pending, startTransition] = useTransition();
  const ask = () => {
    const what =
      recipes > 0
        ? `Diesen Stapel mit seinen ${recipes} Rezepten und allen Fotos löschen?`
        : "Diesen Stapel mit allen Fotos löschen?";
    if (window.confirm(`${what} Das lässt sich nicht rückgängig machen.`)) {
      startTransition(() => removeBatch(batchId));
    }
  };
  return (
    <button type="button" className="btn btn-danger" disabled={pending} onClick={ask}>
      {pending ? "Lösche …" : "Stapel löschen"}
    </button>
  );
}
