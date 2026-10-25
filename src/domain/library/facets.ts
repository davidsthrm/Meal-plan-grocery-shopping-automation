import { DIET_LABEL } from "./discover";
import {
  DIETS,
  isNoFilter,
  matchesFilter,
  NO_FILTER,
  TIME_LIMITS,
  type RecipeFilter,
} from "./filter";
import type { Category, RecipeSummary } from "./summary";
import { SINGLE_GROUPS, type TagGroup } from "./tags";

/**
 * The filters of the library as the panel shows them: every way to narrow it down, in
 * groups, each with the number of recipes it would leave. Tapping one gives the filter of
 * its link. The same on every page that lists recipes: Entdecken, Favoriten, the Regal and
 * the chooser of a meal.
 */

export type FacetPicture =
  | { kind: "filter"; filter: Pick<RecipeFilter, "category" | "tags" | "diet" | "book"> }
  | { kind: "clock" }
  | { kind: "heart" }
  | { kind: "season" }
  | { kind: "long-ago" }
  | { kind: "none" };

export interface FacetOption {
  key: string;
  label: string;
  /** How many recipes there are with it switched on: with it alone in its group of one. */
  count: number;
  on: boolean;
  /** The filter after a tap: on, or off again. */
  filter: RecipeFilter;
  picture: FacetPicture;
}

export interface FacetGroup {
  key: string;
  title: string;
  options: FacetOption[];
  /** At most one of its options is on; another replaces it. */
  single: boolean;
}

export interface FacetOptions {
  categories: readonly Category[];
  tagGroups: readonly TagGroup[];
  books: readonly string[];
  /** A magazine's editions, offered once it is chosen. */
  editions?: readonly string[];
  /** Offer "Favoriten" (the chooser and the Regal do; Entdecken and Favoriten do not). */
  favorites?: boolean;
  /** The pages that know the season and the plans offer them. */
  season?: boolean;
  longAgo?: boolean;
}

/**
 * The groups of the panel, for the recipes a page offers (`pool`, already narrowed to what
 * fits the words searched). Options nothing is behind stay, without a link, while they are
 * off: a group does not change its shape with every tap.
 */
export function facets(
  pool: readonly RecipeSummary[],
  filter: RecipeFilter,
  options: FacetOptions,
): FacetGroup[] {
  const count = (next: RecipeFilter) =>
    pool.reduce((sum, recipe) => sum + (matchesFilter(recipe, next) ? 1 : 0), 0);
  const option = (
    key: string,
    label: string,
    on: boolean,
    next: RecipeFilter,
    picture: FacetPicture,
  ): FacetOption => ({ key, label, on, filter: next, picture, count: count(on ? filter : next) });

  const groups: FacetGroup[] = [];
  const special: FacetOption[] = [];
  if (options.season) {
    special.push(
      option(
        "saison",
        "Passt zur Saison",
        filter.season,
        { ...filter, season: !filter.season },
        {
          kind: "season",
        },
      ),
    );
  }
  if (options.longAgo) {
    special.push(
      option(
        "lange",
        "Lange nicht gekocht",
        filter.longAgo,
        { ...filter, longAgo: !filter.longAgo },
        { kind: "long-ago" },
      ),
    );
  }
  if (options.favorites) {
    special.push(
      option(
        "favoriten",
        "Favoriten",
        filter.favorites,
        { ...filter, favorites: !filter.favorites },
        { kind: "heart" },
      ),
    );
  }
  if (special.length > 0) {
    groups.push({ key: "auswahl", title: "Auswahl", options: special, single: false });
  }

  groups.push({
    key: "zeit",
    title: "Zeit",
    single: true,
    options: TIME_LIMITS.map((minutes) => {
      const on = filter.maxMinutes === minutes;
      return option(
        `zeit-${minutes}`,
        `bis ${minutes} Min.`,
        on,
        { ...filter, maxMinutes: on ? null : minutes },
        { kind: "clock" },
      );
    }),
  });

  groups.push({
    key: "kost",
    title: "Ernährung",
    single: true,
    options: DIETS.map((diet) => {
      const on = filter.diet === diet;
      return option(
        `kost-${diet}`,
        DIET_LABEL[diet],
        on,
        { ...filter, diet: on ? null : diet },
        {
          kind: "filter",
          filter: { ...NO_FILTER, diet },
        },
      );
    }),
  });

  groups.push({
    key: "art",
    title: "Art",
    single: true,
    options: options.categories.map((category) => {
      const on = filter.category === category.key;
      return option(
        `kategorie-${category.key}`,
        category.name,
        on,
        { ...filter, category: on ? null : category.key },
        { kind: "filter", filter: { ...NO_FILTER, category: category.key } },
      );
    }),
  });

  for (const group of options.tagGroups) {
    const single = SINGLE_GROUPS.has(group.name);
    const refs = new Set(group.tags.map((tag) => tag.ref));
    groups.push({
      key: `gruppe-${group.name}`,
      title: group.name,
      single,
      options: group.tags.map((tag) => {
        const on = filter.tags.includes(tag.ref);
        // In a group of one, another tag of it replaces the one that is on.
        const others = single ? filter.tags.filter((ref) => !refs.has(ref)) : filter.tags;
        const tags = on ? filter.tags.filter((ref) => ref !== tag.ref) : [...others, tag.ref];
        return option(
          `tag-${tag.ref}`,
          tag.name,
          on,
          { ...filter, tags },
          {
            kind: "filter",
            filter: { ...NO_FILTER, tags: [tag.ref] },
          },
        );
      }),
    });
  }

  groups.push({
    key: "buch",
    title: "Kochbuch",
    single: true,
    options: options.books.map((book) => {
      const on = filter.book === book;
      return option(
        `buch-${book}`,
        book,
        on,
        { ...filter, book: on ? null : book, edition: null },
        { kind: "filter", filter: { ...NO_FILTER, book } },
      );
    }),
  });
  if (filter.book && options.editions && options.editions.length > 0) {
    groups.push({
      key: "ausgabe",
      title: "Ausgabe",
      single: true,
      options: options.editions.map((edition) => {
        const on = filter.edition === edition;
        return option(
          `ausgabe-${edition}`,
          edition,
          on,
          { ...filter, edition: on ? null : edition },
          { kind: "none" },
        );
      }),
    });
  }
  return groups.filter((group) => group.options.length > 0);
}

/** A filter that is on, as a chip to take it away again. */
export interface ActiveFilter {
  key: string;
  label: string;
  /** The filter without it. */
  without: RecipeFilter;
}

/**
 * What is on, in the order of the panel, each to take away on its own; the words searched
 * are the search field's. An edition goes with its book.
 */
export function activeFilters(groups: readonly FacetGroup[]): ActiveFilter[] {
  return groups.flatMap((group) =>
    group.options
      .filter((option) => option.on)
      .map((option) => ({ key: option.key, label: option.label, without: option.filter })),
  );
}

/** How many filters are on, without the words searched: what the button says. */
export function activeCount(filter: RecipeFilter, keep: Partial<RecipeFilter> = {}): number {
  const own = { ...filter, ...keep, text: "" };
  if (isNoFilter(own)) return 0;
  return (
    Number(own.category !== null) +
    Number(own.diet !== null) +
    Number(own.maxMinutes !== null) +
    Number(own.book !== null) +
    Number(own.edition !== null) +
    Number(own.favorites) +
    Number(own.season) +
    Number(own.longAgo) +
    own.tags.length
  );
}
