"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isOn,
  pendingHref,
  tap,
  type ChoiceGroup,
  type Tapped,
} from "@/domain/library/pending-choices";

/** Where the panel stands beside the list (`.filter-aside` in globals.css). */
const BESIDE = "(min-width: 46rem) and (min-height: 30rem)";

const Pending = createContext<{
  /** The page as the server drew it: its path and search. */
  now: string;
  groups: readonly ChoiceGroup[];
  tapped: Tapped;
  record: (tapped: Tapped) => void;
} | null>(null);

/**
 * The panel of `FilterPanel` itself, the browser's popover, with the choices tapped while
 * the server has not answered yet.
 */
export function FilterFrame({
  id,
  layout,
  groups,
  children,
}: {
  id: string;
  layout: "aside" | "sheet";
  groups: readonly ChoiceGroup[];
  children: ReactNode;
}) {
  const search = useSearchParams().toString();
  const now = `${usePathname()}${search ? `?${search}` : ""}`;
  const [taps, setTaps] = useState<{ now: string; tapped: Tapped }>({ now, tapped: [] });
  // Once the server has answered, what was tapped is in the page it drew.
  const tapped = taps.now === now ? taps.tapped : [];
  const panel = useRef<HTMLDivElement>(null);

  // On an iPad the first choice on Entdecken puts the panel beside the list, but the sheet
  // it was stayed open in the browser's top layer: a panel across the screen that let the
  // page show through, with neither its cross nor "… anzeigen" (November 2026). On a phone
  // it stays a sheet, and open.
  useLayoutEffect(() => {
    const element = panel.current;
    if (layout === "aside" && element?.matches(":popover-open") && matchMedia(BESIDE).matches) {
      element.hidePopover();
    }
  }, [layout]);

  return (
    <Pending value={{ now, groups, tapped, record: (next) => setTaps({ now, tapped: next }) }}>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className={`filter-panel ${layout === "aside" ? "filter-aside" : ""}`}
        aria-label="Filter"
      >
        {children}
      </div>
    </Pending>
  );
}

/**
 * A choice to tap: on at once, and its link leads where the taps before it, still on their
 * way, lead too. Without a script it is a plain link from the page as it was drawn.
 */
export function ChoiceLink({
  group,
  choice,
  children,
}: {
  group: string;
  choice: string;
  children: ReactNode;
}) {
  const pending = useContext(Pending)!;
  const of = pending.groups.find((entry) => entry.key === group)!;
  const next = tap(pending.tapped, of, choice);
  const on = isOn(pending.tapped, of, choice);
  return (
    <Link
      href={pendingHref(pending.now, pending.groups, next)}
      scroll={false}
      className={`chip ${on ? "chip-on" : ""}`}
      aria-pressed={on}
      onClick={(event) => {
        // Opened elsewhere, it changes nothing here.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        pending.record(next);
      }}
    >
      {children}
    </Link>
  );
}
