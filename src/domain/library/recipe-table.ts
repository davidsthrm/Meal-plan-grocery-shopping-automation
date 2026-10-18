import type { IsoDate } from "../dates";
import { BY_KIND } from "./grouping";
import { filterParams, readFilter, type Params } from "./filter";
import type { RecipeSummary } from "./summary";
import { EFFORTS, effortOf, TAG_GROUPS } from "./tags";

/**
 * The library as a table to look after it: every recipe in one list, sorted by any of its
 * columns, narrowed to what lacks something, a page at a time. What is shown lives in the
 * address, like the filter, so the page works without a script and survives a reload.
 */

/** The columns the table sorts by, as the address names them. */
export const TABLE_SORTS = [
  "titel",
  "buch",
  "kategorie",
  "art",
  "aufwand",
  "portionen",
  "gekocht",
  "neu",
] as const;
export type TableSort = (typeof TABLE_SORTS)[number];

/** What a recipe can lack, to find the ones that still need looking after. */
export const LACKS = ["kategorie", "aufwand", "stichworte"] as const;
export type Lack = (typeof LACKS)[number];

export const LACK_NAME: Record<Lack, string> = {
  kategorie: "Ohne Kategorie",
  aufwand: "Ohne Aufwand",
  stichworte: "Ohne Stichworte",
};

/** Recipes per page: enough to scroll through, few enough for a phone to draw at once. */
export const PAGE_SIZE = 50;

export interface TableView {
  /** Null: by title, or with a search by how well a recipe fits. */
  sort: TableSort | null;
  descending: boolean;
  /** From 1. */
  page: number;
  lacks: Lack | null;
}

export const DEFAULT_VIEW: TableView = { sort: null, descending: false, page: 1, lacks: null };

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Reads the view from the address. Anything it does not understand is the default. */
export function readTableView(params: Params): TableView {
  const sort = one(params.sortierung);
  const lacks = one(params.ohne);
  const page = Number(one(params.seite));
  return {
    sort: (TABLE_SORTS as readonly string[]).includes(sort) ? (sort as TableSort) : null,
    descending: one(params.richtung) === "ab",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    lacks: (LACKS as readonly string[]).includes(lacks) ? (lacks as Lack) : null,
  };
}

/** The address parameters of a view, without what is the default. */
export function tableParams(view: TableView): Record<string, string> {
  const params: Record<string, string> = {};
  if (view.sort) params.sortierung = view.sort;
  if (view.sort && view.descending) params.richtung = "ab";
  if (view.lacks) params.ohne = view.lacks;
  if (view.page > 1) params.seite = String(view.page);
  return params;
}

/**
 * The address of the Regal as it was, its filter and its view, read again from parameters
 * that came from elsewhere (a form), so that nothing else of them is taken over.
 */
export function shelfParams(params: Params): Record<string, string> {
  return { ...filterParams(readFilter(params)), ...tableParams(readTableView(params)) };
}

/**
 * The view after a tap on a column's heading: sorted by it, and the other way round when it
 * is sorted by it already. Back on the first page.
 */
export function sortedBy(view: TableView, sort: TableSort): TableView {
  const current = view.sort ?? "titel";
  return {
    ...view,
    sort,
    descending: current === sort ? !view.descending : false,
    page: 1,
  };
}

/** Whether a recipe lacks what is asked for. */
export function lacks(recipe: RecipeSummary, lack: Lack): boolean {
  if (lack === "kategorie") return recipe.category === null;
  if (lack === "aufwand") return effortOf(recipe) === null;
  // Its effort alone says little about a recipe: "Stichworte" are the others.
  const described = new Set(EFFORTS as readonly string[]);
  return recipe.tags.every((tag) => described.has(tag));
}

/** A recipe and what the table says about it beyond the summary. */
export interface TableRow {
  recipe: RecipeSummary;
  /** The day it was last on a meal before today. Null if never. */
  lastCooked: IsoDate | null;
}

export interface SortContext {
  /** The categories in the household's order, by key. */
  categories: readonly string[];
}

type Value = string | number | null;

/** What a row is compared by in a column. Null sorts last, whichever way round. */
function valueOf(row: TableRow, sort: TableSort, context: SortContext): Value | Value[] {
  const { recipe } = row;
  switch (sort) {
    case "titel":
      return recipe.title;
    case "buch":
      // A magazine by its editions, each by its pages.
      return [recipe.sourceBook, recipe.sourceEdition, recipe.sourcePage];
    case "kategorie": {
      const at = recipe.category ? context.categories.indexOf(recipe.category) : -1;
      return at < 0 ? null : at;
    }
    case "art": {
      const kind = BY_KIND.keyOf(recipe);
      return kind === null ? null : BY_KIND.order.indexOf(kind);
    }
    case "aufwand": {
      const effort = effortOf(recipe);
      return [effort === null ? null : EFFORTS.indexOf(effort), recipe.prepMinutes];
    }
    case "portionen":
      // A tin or a tray is counted after persons.
      return recipe.servings ? [recipe.servings.unit === null ? 0 : 1, recipe.servings.max] : null;
    case "gekocht":
      return row.lastCooked;
    case "neu":
      return recipe.addedOn;
  }
}

function compareValue(a: Value, b: Value): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "de", { numeric: true });
}

/**
 * The rows in the order of a column. Within the same value they stay by title; a recipe
 * without a value stands last either way round, so "Ohne Kategorie" is not on top.
 */
export function sortRows(
  rows: readonly TableRow[],
  view: Pick<TableView, "sort" | "descending">,
  context: SortContext,
): TableRow[] {
  if (view.sort === null) return [...rows];
  const sort = view.sort;
  const turn = view.descending ? -1 : 1;
  const byTitle = (a: TableRow, b: TableRow) => a.recipe.title.localeCompare(b.recipe.title, "de");
  return [...rows].sort((a, b) => {
    const left = [valueOf(a, sort, context)].flat();
    const right = [valueOf(b, sort, context)].flat();
    for (let i = 0; i < left.length; i++) {
      const missing = (left[i] === null ? 1 : 0) - (right[i] === null ? 1 : 0);
      if (missing !== 0) return missing;
      const order = compareValue(left[i], right[i]) * turn;
      if (order !== 0) return order;
    }
    return sort === "titel" ? 0 : byTitle(a, b);
  });
}

export interface TablePage<T> {
  rows: T[];
  /** The page shown, from 1: the last one when more were asked for than there are. */
  page: number;
  pages: number;
  total: number;
}

/** One page of the rows. */
export function pageOf<T>(rows: readonly T[], page: number, size = PAGE_SIZE): TablePage<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const shown = Math.min(Math.max(1, page), pages);
  return {
    rows: rows.slice((shown - 1) * size, shown * size),
    page: shown,
    pages,
    total: rows.length,
  };
}

/**
 * The tags a recipe is shown with in the table: by the order of the groups, the effort left
 * out because it has a column of its own.
 */
export function shownTags<T extends { ref: string; group: string }>(
  recipe: Pick<RecipeSummary, "tags">,
  tags: readonly T[],
): T[] {
  const own = new Set(recipe.tags);
  return TAG_GROUPS.filter((group) => group !== "Aufwand").flatMap((group) =>
    tags.filter((tag) => tag.group === group && own.has(tag.ref)),
  );
}
