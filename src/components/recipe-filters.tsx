import Link from "next/link";
import type { ReactNode } from "react";
import { activeFilters, type FacetGroup, type FacetPicture } from "@/domain/library/facets";
import { filterParams, type RecipeFilter } from "@/domain/library/filter";
import { pictogramForFilter } from "@/domain/library/pictogram";
import { monthOf, seasonTagOf } from "@/domain/season/calendar";
import { today } from "@/lib/today";
import { ClockIcon, CloseIcon, FilterIcon, HeartIcon } from "./icons";
import { LiveSearch } from "./live-search";
import { PictogramIcon } from "./pictogram";

/**
 * The filters of every list of recipes, the same on Entdecken, Favoriten, the Regal and the
 * chooser of a meal. One panel: beside the list from an iPad's width on (`aside`), a sheet
 * from the foot of the screen on a phone, opened by "Filter" next to the search field. Each
 * choice says how many recipes it leaves; what is on stands above the list, each to take
 * away with a tap.
 *
 * Every choice is a link that changes the address, so it works before any script has
 * loaded; the sheet is a popover of the browser's own and opens without one too. It stays
 * open while choices are tapped, and "… anzeigen" closes it.
 */

/** A choice of the panel, with where it leads. */
export interface PanelOption {
  key: string;
  label: string;
  count: number;
  on: boolean;
  href: string;
  picture: FacetPicture;
}

export interface PanelGroup {
  key: string;
  title: string;
  options: PanelOption[];
}

/** The groups that are open at first; the others open with a tap, or when one of theirs is on. */
const OPEN = new Set([
  "ohne",
  "auswahl",
  "zeit",
  "kost",
  "art",
  "gruppe-Aufwand",
  "gruppe-Hauptzutat",
  // Offered once a magazine is chosen: the next thing to choose.
  "ausgabe",
]);

/** The address of a filter on a page, with what else the page keeps in it. */
export function filterHref(path: string, filter: RecipeFilter, keep: Record<string, string> = {}) {
  const query = new URLSearchParams({ ...keep, ...filterParams(filter) }).toString();
  return query ? `${path}?${query}` : path;
}

/** The groups of `facets` as the panel shows them. */
export function panelGroups(
  groups: readonly FacetGroup[],
  href: (filter: RecipeFilter) => string,
): PanelGroup[] {
  return groups.map((group) => ({
    key: group.key,
    title: group.title,
    options: group.options.map((option) => ({
      key: option.key,
      label: option.label,
      count: option.count,
      on: option.on,
      href: href(option.filter),
      picture: option.picture,
    })),
  }));
}

/** The chips above the list for what is on. */
export function activeChips(
  groups: readonly FacetGroup[],
  href: (filter: RecipeFilter) => string,
): { key: string; label: string; href: string }[] {
  return activeFilters(groups).map((entry) => ({
    key: entry.key,
    label: entry.label,
    href: href(entry.without),
  }));
}

function Picture({ picture }: { picture: FacetPicture }) {
  switch (picture.kind) {
    case "clock":
      return (
        <span className="chip-picture grid place-items-center">
          <ClockIcon />
        </span>
      );
    case "heart":
      return (
        <span className="chip-picture grid place-items-center">
          <HeartIcon />
        </span>
      );
    case "season":
      return (
        <PictogramIcon
          name={pictogramForFilter({
            category: null,
            diet: null,
            book: null,
            tags: [seasonTagOf(monthOf(today()))],
          })}
          className="chip-picture"
        />
      );
    case "long-ago":
      return <PictogramIcon name="sanduhr" className="chip-picture" />;
    case "filter":
      return <PictogramIcon name={pictogramForFilter(picture.filter)} className="chip-picture" />;
    default:
      return null;
  }
}

/** One choice: a link while something is behind it or it is on, otherwise a pale word. */
function Choice({ option }: { option: PanelOption }) {
  const content = (
    <>
      <Picture picture={option.picture} />
      <span className="truncate">{option.label}</span>
      <span className="chip-count">{option.count}</span>
    </>
  );
  if (!option.on && option.count === 0) {
    return (
      <span className="chip chip-empty" aria-disabled="true">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={option.href}
      scroll={false}
      className={`chip ${option.on ? "chip-on" : ""}`}
      aria-pressed={option.on}
    >
      {content}
    </Link>
  );
}

interface PanelProps {
  /** The popover's id, which "Filter" opens. One panel per page. */
  id?: string;
  groups: readonly PanelGroup[];
  /** Beside the list on a large screen, or a sheet at every size (the chooser of a meal). */
  layout: "aside" | "sheet";
  /** How many recipes the list shows with the filter as it is. */
  total: number;
  /** "Rezept" and "Rezepte", or "Favorit" and "Favoriten". */
  noun?: [string, string];
  /** The address without any filter, while one is on. */
  reset: string | null;
}

/** The panel of choices: a sidebar or a sheet, the same content. */
export function FilterPanel({
  id = "filter",
  groups,
  layout,
  total,
  noun = ["Rezept", "Rezepte"],
  reset,
}: PanelProps) {
  return (
    <div
      id={id}
      popover="auto"
      className={`filter-panel ${layout === "aside" ? "filter-aside" : ""}`}
      aria-label="Filter"
    >
      <div className="filter-head">
        <span aria-hidden className="action-sheet-grip filter-only-sheet" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight">Filter</h2>
          <div className="flex items-center gap-1">
            {reset && (
              <Link
                href={reset}
                scroll={false}
                className="link link-quiet inline-flex min-h-11 items-center px-2 text-sm"
              >
                Zurücksetzen
              </Link>
            )}
            <button
              type="button"
              popoverTarget={id}
              popoverTargetAction="hide"
              className="icon-button filter-only-sheet"
              aria-label="Filter schließen"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>
      <div className="filter-body">
        {groups.map((group) => {
          const on = group.options.filter((option) => option.on).length;
          return (
            <details key={group.key} className="filter-group" open={OPEN.has(group.key) || on > 0}>
              <summary className="filter-group-head">
                <span>{group.title}</span>
                {on > 0 && <span className="filter-on-count">{on}</span>}
                <span aria-hidden className="filter-chevron" />
              </summary>
              <div role="group" aria-label={group.title} className="flex flex-wrap gap-2 pb-3">
                {group.options.map((option) => (
                  <Choice key={option.key} option={option} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <div className="filter-foot filter-only-sheet">
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="btn btn-primary w-full"
        >
          {total === 1 ? `1 ${noun[0]} anzeigen` : `${total} ${noun[1]} anzeigen`}
        </button>
      </div>
    </div>
  );
}

interface BarProps {
  id?: string;
  path: string;
  filter: RecipeFilter;
  /** What rides along in the search form: the filter and what the page keeps. */
  hidden: Record<string, string>;
  layout: "aside" | "sheet";
  chips: readonly { key: string; label: string; href: string }[];
  reset: string | null;
  plan?: { action: (form: FormData) => Promise<void>; fields: Record<string, string> };
  placeholder?: string;
}

/**
 * Above the list: the search field with "Filter" beside it (on a phone, or wherever the
 * panel is a sheet), and what is on as chips to take away.
 */
export function FilterBar({
  id = "filter",
  path,
  filter,
  hidden,
  layout,
  chips,
  reset,
  plan,
  placeholder,
}: BarProps) {
  const count = chips.length;
  return (
    <div className="space-y-2.5">
      {/* The field follows the address: emptied there, it starts empty here. */}
      <LiveSearch
        key={filter.text}
        path={path}
        hidden={hidden}
        filter={filter}
        plan={plan}
        placeholder={placeholder}
        extra={
          <button
            type="button"
            popoverTarget={id}
            className={`btn filter-open ${layout === "aside" ? "tablet:hidden" : ""} ${count > 0 ? "filter-open-on" : ""}`}
            aria-label={count > 0 ? `Filter, ${count} an` : "Filter"}
          >
            <FilterIcon />
            <span className="max-[22rem]:sr-only">Filter</span>
            {count > 0 && <span className="filter-on-count">{count}</span>}
          </button>
        }
      />
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Aktive Filter">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              scroll={false}
              className="chip chip-on"
              aria-label={`${chip.label} entfernen`}
            >
              {chip.label}
              <CloseIcon />
            </Link>
          ))}
          {reset && count > 1 && (
            <Link
              href={reset}
              scroll={false}
              className="link link-quiet inline-flex min-h-11 items-center px-1 text-sm"
            >
              Alle entfernen
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** The list and, from an iPad's width on, the panel beside it. */
export function FilterLayout({
  panel,
  layout,
  children,
}: {
  panel: ReactNode;
  layout: "aside" | "sheet";
  children: ReactNode;
}) {
  return (
    <div
      className={
        layout === "aside"
          ? "tablet:grid tablet:grid-cols-[15.5rem_minmax(0,1fr)] tablet:items-start tablet:gap-7 lg:grid-cols-[17.5rem_minmax(0,1fr)]"
          : ""
      }
    >
      {panel}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * An empty list says what would bring recipes back: each filter that is on, left out, with
 * how many recipes there are then.
 */
export function WaysOut({
  relax,
  href,
  noun = ["Rezept", "Rezepte"],
}: {
  relax: readonly { key: string; label: string; count: number; without: RecipeFilter }[];
  href: (filter: RecipeFilter) => string;
  noun?: [string, string];
}) {
  if (relax.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Ohne einen Filter">
      {relax.map((entry) => (
        <li key={entry.key}>
          <Link href={href(entry.without)} scroll={false} className="chip">
            Ohne „{entry.label}“: {entry.count === 1 ? `1 ${noun[0]}` : `${entry.count} ${noun[1]}`}
          </Link>
        </li>
      ))}
    </ul>
  );
}
