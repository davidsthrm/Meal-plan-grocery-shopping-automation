"use client";

import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons";

/**
 * What the supermarket search says while it runs: asking the map can take up to a minute,
 * and a button that only greys out looked as if nothing happened. Stands inside the form
 * that starts the search.
 */
export function SearchPending() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p
      role="status"
      className="flex basis-full items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm font-semibold text-accent"
    >
      <SpinnerIcon />
      Supermärkte in der Nähe werden gesucht … das kann bis zu einer Minute dauern.
    </p>
  );
}
