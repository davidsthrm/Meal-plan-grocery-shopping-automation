import { aisleSortOrder, type AisleGroup, type CatalogIndex, type Shop } from "../catalog";
import { formatLine } from "./format";
import type { LineState, ShoppingLine } from "./types";

/** A line with the household's changes applied. */
export interface ViewLine {
  line: ShoppingLine;
  /** The line as it reads on the list. */
  text: string;
  shopId: string;
  note: string | null;
  atHome: boolean;
  checked: boolean;
}

export interface ListView {
  /** To buy on the shopping day: by shop, then aisle group, in the configured order. */
  shops: { shop: Shop; groups: { aisleGroup: AisleGroup; lines: ViewLine[] }[] }[];
  /** To buy fresh later in the week, ordered by the day they are needed. */
  later: ViewLine[];
  /** Already at home. Not on the list, but listed in the "Haben wir schon?" step. */
  atHome: ViewLine[];
}

/** Applies what the household changed on a line. Their changes win over the defaults. */
export function resolveLine(line: ShoppingLine, state: LineState = {}): ViewLine {
  const note = state.note !== undefined ? state.note : line.note;
  return {
    line,
    text: formatLine(line.label, line.purchase, note),
    shopId: state.shopId ?? line.shopId,
    note,
    atHome: state.atHome ?? line.defaultAtHome,
    checked: state.checked ?? false,
  };
}

const byLabel = (a: ViewLine, b: ViewLine) => a.line.label.localeCompare(b.line.label, "de");

/**
 * Turns the generated lines and the household's changes into the list as it is shown and
 * printed. Lines keep no order of their own: grouping and order come from the catalog.
 */
export function presentList(
  lines: ShoppingLine[],
  states: Record<string, LineState>,
  index: CatalogIndex,
): ListView {
  const resolved = lines.map((line) => resolveLine(line, states[line.key]));
  const toBuy = resolved.filter((v) => !v.atHome);
  const shopOrder = (shopId: string) =>
    index.shopById.get(shopId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;

  const shops = [...index.catalog.shops]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((shop) => {
      const inShop = toBuy.filter((v) => v.line.trip === "main" && v.shopId === shop.id);
      const groups = [...index.catalog.aisleGroups]
        .sort((a, b) => aisleSortOrder(index, shop.id, a.id) - aisleSortOrder(index, shop.id, b.id))
        .map((aisleGroup) => ({
          aisleGroup,
          lines: inShop.filter((v) => v.line.aisleGroupId === aisleGroup.id).sort(byLabel),
        }))
        .filter((group) => group.lines.length > 0);
      return { shop, groups };
    })
    .filter((section) => section.groups.length > 0);

  const later = toBuy
    .filter((v) => v.line.trip === "later")
    .sort(
      (a, b) =>
        (a.line.neededBy ?? "").localeCompare(b.line.neededBy ?? "") ||
        shopOrder(a.shopId) - shopOrder(b.shopId) ||
        byLabel(a, b),
    );

  return { shops, later, atHome: resolved.filter((v) => v.atHome).sort(byLabel) };
}

export interface AisleView {
  /** To buy on the shopping day, by kind of grocery, in the household's order. */
  groups: { aisleGroup: AisleGroup; lines: ViewLine[] }[];
  /** To buy fresh later in the week, ordered by the day they are needed. */
  later: ViewLine[];
  /** Already at home. Not on the list, but listed in the "Haben wir schon?" step. */
  atHome: ViewLine[];
}

/**
 * The list as one walk through a shop: grouped by kind of grocery only, whichever shop each
 * thing comes from. This is the list the household uses while it does not plan by shop.
 */
export function presentByAisle(
  lines: ShoppingLine[],
  states: Record<string, LineState>,
  index: CatalogIndex,
): AisleView {
  const resolved = lines.map((line) => resolveLine(line, states[line.key]));
  const toBuy = resolved.filter((view) => !view.atHome);
  const main = toBuy.filter((view) => view.line.trip === "main");
  return {
    groups: [...index.catalog.aisleGroups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((aisleGroup) => ({
        aisleGroup,
        lines: main.filter((view) => view.line.aisleGroupId === aisleGroup.id).sort(byLabel),
      }))
      .filter((group) => group.lines.length > 0),
    later: toBuy
      .filter((view) => view.line.trip === "later")
      .sort(
        (a, b) => (a.line.neededBy ?? "").localeCompare(b.line.neededBy ?? "") || byLabel(a, b),
      ),
    atHome: resolved.filter((view) => view.atHome).sort(byLabel),
  };
}
