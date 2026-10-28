"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FORWARD } from "@/lib/transitions";

/**
 * "Überrasch mich": opens one of a few recipes drawn on the server (`surprisePool`), another
 * with every tap. Drawn in the browser, so that the page fetched ahead and kept for minutes
 * still surprises.
 */
export function SurpriseLink({
  pool,
  className,
  children,
}: {
  pool: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  if (pool.length === 0) return null;
  return (
    // Without a script, the first of the draw.
    <a
      href={`/rezepte/${pool[0]}`}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        const at = Math.floor(Math.random() * pool.length);
        router.push(`/rezepte/${pool[at]}`, { transitionTypes: [FORWARD] });
      }}
    >
      {children}
    </a>
  );
}
