import Link from "next/link";
import type { ReactNode } from "react";
import { BACK } from "@/lib/transitions";

/**
 * The way back to where a page was opened from: "← Wochenplan". A pill like every other
 * button, and the page it leads to comes in from the left, the mirror of going in.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    // The arrow is part of its words: "← Wochenplan" is what a screen reader names it.
    <Link href={href} prefetch transitionTypes={[BACK]} className="back-link">
      ← {children}
    </Link>
  );
}
