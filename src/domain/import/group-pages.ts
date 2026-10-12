import type { PagePart } from "./survey";

/**
 * Groups the photographed pages of a batch into recipes.
 *
 * Cookbooks lay recipes out in three ways: everything on one page, title and photo on one
 * page with the ingredients on the facing page (in either order), or a recipe that runs on
 * to the next page. Pages without a recipe (cover, contents, chapter openers) are left out.
 *
 * The grouping is a best effort from what the first look at each page found. Whatever it
 * gets wrong shows up in review, where pages can be added to a recipe by hand.
 */

export interface SurveyedPage {
  id: string;
  /** Order in which the pages were photographed. */
  position: number;
  printedPage: number | null;
  parts: PagePart[];
}

export interface RecipeUnit {
  /** The pages this recipe is read from, in photographed order. */
  pageIds: string[];
  /** Set when one of its pages shows more than one recipe, to say which one to read. */
  focusTitle: string | null;
  /** The recipe's title as the first look saw it. Null when no page shows one. */
  title: string | null;
}

export interface Grouping {
  units: RecipeUnit[];
  /** Pages that belong to no recipe. */
  ignoredPageIds: string[];
}

interface Fragment {
  page: number;
  part: PagePart;
  used: boolean;
}

interface Unit {
  pages: number[];
  title: string | null;
  /** Whether the last part added says the text runs on. */
  open: boolean;
}

/** A left page has an even number and faces the odd page that follows it. */
function sameSpread(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.floor(a / 2) === Math.floor(b / 2);
}

export function groupPages(input: SurveyedPage[]): Grouping {
  const pages = [...input].sort((a, b) => a.position - b.position);
  const fragments: Fragment[] = pages.flatMap((page, index) =>
    page.parts.map((part) => ({ page: index, part, used: false })),
  );
  const units: Unit[] = [];
  const take = (fragment: Fragment) => {
    fragment.used = true;
    return fragment;
  };
  const freeBody = (page: number, needsIngredients: boolean) =>
    fragments.find(
      (f) =>
        !f.used &&
        f.page === page &&
        f.part.title === null &&
        (!needsIngredients || f.part.hasIngredientList),
    );

  // 1. A recipe with title and ingredient list on one page stands on its own.
  for (const fragment of fragments) {
    if (fragment.part.title !== null && fragment.part.hasIngredientList) {
      take(fragment);
      units.push({
        pages: [fragment.page],
        title: fragment.part.title,
        open: fragment.part.continuesOnNextPage,
      });
    }
  }

  // 2. A title without ingredients looks for the ingredients on a neighbouring page: on the
  //    same double page if the page numbers say so, otherwise the following page first.
  for (const fragment of fragments) {
    if (fragment.used || fragment.part.title === null) continue;
    const here = fragment.page;
    const neighbours = [here, here + 1, here - 1].filter((p) => p >= 0 && p < pages.length);
    const candidates = neighbours
      .map((page) => freeBody(page, true))
      .filter((f): f is Fragment => f !== undefined);
    const partner =
      candidates.find((f) => f.page === here) ??
      candidates.find((f) => sameSpread(pages[f.page].printedPage, pages[here].printedPage)) ??
      // Page numbers that put a neighbour on another double page rule it out.
      candidates.find(
        (f) => pages[f.page].printedPage === null || pages[here].printedPage === null,
      );
    if (!partner) continue;
    take(fragment);
    take(partner);
    units.push({
      pages: [...new Set([here, partner.page])].sort((a, b) => a - b),
      title: fragment.part.title,
      open: partner.part.continuesOnNextPage,
    });
  }

  // 3. A recipe whose text breaks off continues with the untitled text on the next page.
  for (const unit of units) {
    while (unit.open) {
      const next = unit.pages[unit.pages.length - 1] + 1;
      const continuation = next < pages.length ? freeBody(next, false) : undefined;
      if (!continuation) break;
      take(continuation);
      unit.pages.push(next);
      unit.open = continuation.part.continuesOnNextPage;
    }
  }

  // 4. An ingredient list that found no title is still a recipe. Its title is asked for in review.
  for (const fragment of fragments) {
    if (!fragment.used && fragment.part.title === null && fragment.part.hasIngredientList) {
      take(fragment);
      units.push({ pages: [fragment.page], title: null, open: false });
    }
  }

  units.sort((a, b) => a.pages[0] - b.pages[0]);
  const startsPerPage = new Map<number, number>();
  for (const unit of units) {
    for (const page of unit.pages) startsPerPage.set(page, (startsPerPage.get(page) ?? 0) + 1);
  }
  const inUnit = new Set(units.flatMap((unit) => unit.pages));
  return {
    units: units.map((unit) => ({
      pageIds: unit.pages.map((page) => pages[page].id),
      // Several recipes share one of this recipe's pages: the reader has to be told which.
      focusTitle: unit.pages.some((page) => (startsPerPage.get(page) ?? 0) > 1) ? unit.title : null,
      title: unit.title,
    })),
    ignoredPageIds: pages.filter((_, index) => !inUnit.has(index)).map((page) => page.id),
  };
}
