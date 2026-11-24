"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { splitByPlaced, type Settled } from "@/domain/shopping-list/ticked-last";
import { ShopLogo } from "./shop-logo";
import { useTickedLast, type NotePage, type PageLine } from "./ticks";

/** A line of a view with its name, and its row as the view draws it. */
export interface TickedRow extends PageLine {
  label: string;
  row: ReactNode;
}

/** The lines of a view by shop section and kind of grocery, in the order of a walk. */
export interface TickedSection {
  /** The supermarket, on a note taken to several; null for one walk through one shop. */
  shop: { id: string; name: string; logoUrl?: string | null } | null;
  groups: { name: string; lines: TickedRow[] }[];
}

interface Lines {
  sections: readonly TickedSection[];
  settled: Settled;
  /** How many lines "Gekauft" holds (`boughtCount`). */
  bought: number;
  hold: (key: string, opened: boolean) => void;
  /** The id of the heading of "Gekauft", where the focus goes when nothing open follows. */
  heading: string;
}

const LinesContext = createContext<Lines | null>(null);

/**
 * The lines of a note or of the view for the shop: what is still to buy, and what is bought
 * at the end under "Gekauft", both by shop section and kind of grocery (`settleTicked`). The
 * view puts each part where it belongs (`TickedPart`).
 */
export function TickedLast({
  page,
  sections,
  children,
}: {
  page: NotePage;
  sections: readonly TickedSection[];
  children: ReactNode;
}) {
  const lines = sections.flatMap((section) => section.groups.flatMap((group) => group.lines));
  const { settled, bought, hold, onMove } = useTickedLast(page, lines);
  const heading = useId();
  const toHeading = useRef(false);

  // The focus on a line that leaves goes to the next open line, or else to "Gekauft".
  useEffect(
    () =>
      onMove((keys) => {
        const row = document.activeElement?.closest<HTMLElement>("[data-line]");
        if (!row || !keys.includes(row.dataset.line ?? "")) return;
        const view = row.closest("dialog");
        const next = [...document.querySelectorAll<HTMLElement>("[data-line]")].find(
          (other) =>
            other.closest("dialog") === view &&
            !other.closest(".ticked-part") &&
            !other.hasAttribute("data-gone") &&
            !keys.includes(other.dataset.line ?? "") &&
            row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
        const button = next?.querySelector("button");
        // Without scrolling: the view jumping to the next line is what the delay avoids.
        if (button) button.focus({ preventScroll: true });
        else toHeading.current = true;
      }),
    [onMove],
  );
  useLayoutEffect(() => {
    const element = toHeading.current ? document.getElementById(heading) : null;
    if (!element) return;
    toHeading.current = false;
    element.focus({ preventScroll: true });
  });

  return (
    <LinesContext.Provider value={{ sections, settled, bought, hold, heading }}>
      {children}
    </LinesContext.Provider>
  );
}

/** What a row needs to know of where it stands: folding away, just arrived, opened. */
export function usePlace(key: string) {
  const lines = useContext(LinesContext);
  if (!lines) return null;
  return {
    folding: lines.settled.folding.has(key),
    arrived: lines.settled.arrived.includes(key),
    hold: lines.hold,
  };
}

/**
 * One part of the lines: those still to buy, or "Gekauft" with how many. A polite word says
 * where a line went ("Eier: unter Gekauft"). Not on paper: it shows what is still to buy.
 */
export function TickedPart({
  part,
  variant,
}: {
  part: "open" | "bought";
  variant: "note" | "store";
}) {
  const lines = useContext(LinesContext);
  if (!lines) throw new Error("A part of the lines needs TickedLast around it.");
  const { open, bought } = splitByPlaced(lines.sections, lines.settled.placed);
  if (part === "open") return <Sections sections={open} variant={variant} />;

  const label = new Map(
    lines.sections.flatMap((section) =>
      section.groups.flatMap((group) => group.lines.map((line) => [line.key, line.label])),
    ),
  );
  const arrived = lines.settled.arrived.flatMap((key) => label.get(key) ?? []);
  const title = (
    <>
      Gekauft <span className="font-normal text-muted tabular-nums">{lines.bought}</span>
    </>
  );
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {arrived.length > 0 ? `${arrived.join(", ")}: unter Gekauft` : ""}
      </p>
      {lines.bought > 0 && (
        <section
          aria-label="Gekauft"
          className={`ticked-part print:hidden ${variant === "store" ? "mt-8" : "mt-6"}`}
        >
          {variant === "store" ? (
            <h3 id={lines.heading} tabIndex={-1} className="mx-2 text-lg font-bold tracking-tight">
              {title}
            </h3>
          ) : (
            <h2 id={lines.heading} tabIndex={-1} className="text-base font-bold tracking-tight">
              {title}
            </h2>
          )}
          <Sections sections={bought} variant={variant} bought />
        </section>
      )}
    </>
  );
}

/**
 * Sections and kinds of grocery as each view draws them. Under "Gekauft" their names say so
 * ("Obst & Gemüse, gekauft"): the same name twice on a page is two regions of one name.
 */
function Sections({
  sections,
  variant,
  bought = false,
}: {
  sections: readonly TickedSection[];
  variant: "note" | "store";
  bought?: boolean;
}) {
  const named = (name: string) => (bought ? `${name}, gekauft` : name);
  const rows = (group: TickedSection["groups"][number]) =>
    group.lines.map((line) => <Fragment key={line.key}>{line.row}</Fragment>);

  if (variant === "store") {
    return sections.map((section) => (
      <section
        key={section.shop?.id ?? "alle"}
        aria-label={section.shop ? named(section.shop.name) : undefined}
      >
        {section.shop && (
          <h3 className="mx-2 mt-5 flex items-center gap-2.5 border-b border-line pb-2 text-lg font-bold tracking-tight">
            <ShopLogo shop={section.shop} size={32} />
            {section.shop.name}
          </h3>
        )}
        {section.groups.map((group) => (
          <section key={group.name} aria-label={named(group.name)} className="mt-4">
            <h4 className="eyebrow mx-2">{group.name}</h4>
            <ul className="mt-1">{rows(group)}</ul>
          </section>
        ))}
      </section>
    ));
  }
  return sections.map((section) => (
    <section
      key={section.shop?.id ?? "alle"}
      aria-label={section.shop ? named(section.shop.name) : undefined}
      className="mt-4"
    >
      {section.shop && (
        <h2 className="mb-2 flex items-center gap-2 border-b border-line pb-1.5 text-base font-bold tracking-tight print:text-black">
          <span className="print:hidden">
            <ShopLogo shop={section.shop} size={32} />
          </span>
          {section.shop.name}
        </h2>
      )}
      {/* One column on screen, so that an opened line has the sheet's whole width; on paper
          the columns of `printRules`. */}
      <div className="note-columns gap-x-10">
        {section.groups.map((group) => (
          <section
            key={group.name}
            aria-label={named(group.name)}
            className="mb-5 break-inside-avoid-column"
          >
            <h3 className="eyebrow print:font-bold print:text-black">{group.name}</h3>
            <ul className="ruled mt-1">{rows(group)}</ul>
          </section>
        ))}
      </div>
    </section>
  ));
}
