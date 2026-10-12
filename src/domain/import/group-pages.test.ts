import { describe, expect, it } from "vitest";
import { groupPages, type SurveyedPage } from "./group-pages";
import type { PagePart } from "./survey";

const part = (title: string | null, patch: Partial<PagePart> = {}): PagePart => ({
  title,
  page: null,
  hasIngredientList: true,
  hasSteps: true,
  continuesOnNextPage: false,
  ...patch,
});
const titleOnly = (title: string) => part(title, { hasIngredientList: false, hasSteps: false });
const body = (patch: Partial<PagePart> = {}) => part(null, patch);

/** Pages in photographed order: [printed page number or null, ...parts]. */
function pages(...rows: [number | null, ...PagePart[]][]): SurveyedPage[] {
  return rows.map(([printedPage, ...parts], position) => ({
    id: `p${position + 1}`,
    position,
    printedPage,
    parts,
  }));
}

const grouped = (input: SurveyedPage[]) => {
  const { units, ignoredPageIds } = groupPages(input);
  return { units: units.map((u) => [u.title, ...u.pageIds]), ignored: ignoredPageIds };
};

describe("groupPages", () => {
  it("keeps a recipe that is complete on one page on its own", () => {
    expect(grouped(pages([82, part("Kartoffelsuppe")], [84, part("Linsen-Eintopf")]))).toEqual({
      units: [
        ["Kartoffelsuppe", "p1"],
        ["Linsen-Eintopf", "p2"],
      ],
      ignored: [],
    });
  });

  it("joins a title page with the ingredients on the page that follows", () => {
    expect(grouped(pages([96, titleOnly("Avocado-Spaghetti")], [97, body()]))).toEqual({
      units: [["Avocado-Spaghetti", "p1", "p2"]],
      ignored: [],
    });
  });

  it("joins them on the same double page when the ingredients come first", () => {
    // 88 faces 89, 90 faces 91. Without the page numbers, 89 would grab the page after it.
    const input = pages(
      [88, body()],
      [89, titleOnly("Rustikaler Linsensalat")],
      [90, body()],
      [91, titleOnly("Tomatensalat")],
    );
    expect(grouped(input).units).toEqual([
      ["Rustikaler Linsensalat", "p1", "p2"],
      ["Tomatensalat", "p3", "p4"],
    ]);
  });

  it("prefers the following page when there are no page numbers", () => {
    const input = pages([null, titleOnly("Risotto")], [null, body()], [null, part("Salat")]);
    expect(grouped(input).units).toEqual([
      ["Risotto", "p1", "p2"],
      ["Salat", "p3"],
    ]);
  });

  it("does not pair a title with ingredients across two double pages", () => {
    // 89 is a right page. 90 starts the next double page and belongs to another recipe.
    const input = pages([89, titleOnly("Kapiteltitel")], [90, body()]);
    expect(grouped(input)).toEqual({ units: [[null, "p2"]], ignored: ["p1"] });
  });

  it("adds the next page when a recipe's text breaks off", () => {
    const input = pages(
      [10, part("Gulasch", { continuesOnNextPage: true })],
      [11, body({ hasIngredientList: false })],
      [12, part("Spätzle")],
    );
    expect(grouped(input).units).toEqual([
      ["Gulasch", "p1", "p2"],
      ["Spätzle", "p3"],
    ]);
  });

  it("keeps an ingredient list without any title as a recipe to be named in review", () => {
    expect(grouped(pages([97, body()]))).toEqual({ units: [[null, "p1"]], ignored: [] });
  });

  it("leaves out pages without a recipe", () => {
    const input = pages([null], [3], [12, part("Pfannkuchen")], [13, titleOnly("Salat & Gemüse")]);
    expect(grouped(input)).toEqual({ units: [["Pfannkuchen", "p3"]], ignored: ["p1", "p2", "p4"] });
  });

  it("reads two recipes from one page separately and says which is which", () => {
    const { units } = groupPages(
      pages([40, part("Rührei"), part("Spiegelei")], [41, part("Omelett")]),
    );
    expect(units).toEqual([
      { pageIds: ["p1"], focusTitle: "Rührei", focus: { position: 1, count: 2 }, title: "Rührei" },
      {
        pageIds: ["p1"],
        focusTitle: "Spiegelei",
        focus: { position: 2, count: 2 },
        title: "Spiegelei",
      },
      { pageIds: ["p2"], focusTitle: null, focus: null, title: "Omelett" },
    ]);
  });

  it("points at a recipe without a title on a shared photo by its position", () => {
    // A double page with four recipes, one of which has its title cut off.
    const { units } = groupPages(
      pages([82, part("Steak"), part("Suppe"), part("Eintopf"), body()]),
    );
    expect(units.map((u) => [u.title, u.focus])).toEqual([
      ["Steak", { position: 1, count: 4 }],
      ["Suppe", { position: 2, count: 4 }],
      ["Eintopf", { position: 3, count: 4 }],
      [null, { position: 4, count: 4 }],
    ]);
  });

  it("orders the pages by when they were photographed, whatever order they arrive in", () => {
    const input = pages([96, titleOnly("Avocado-Spaghetti")], [97, body()]).reverse();
    expect(grouped(input).units).toEqual([["Avocado-Spaghetti", "p1", "p2"]]);
  });
});
