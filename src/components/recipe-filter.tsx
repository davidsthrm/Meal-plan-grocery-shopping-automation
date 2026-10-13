import Link from "next/link";
import {
  DIETS,
  filterParams,
  isNoFilter,
  NO_FILTER,
  TIME_LIMITS,
  type RecipeFilter,
} from "@/domain/library/filter";
import { pictogramForFilter } from "@/domain/library/pictogram";
import type { Category } from "@/domain/library/summary";
import type { TagGroup } from "@/domain/library/tags";
import { DIET_NAME } from "@/lib/plan-text";
import { ClockIcon, HeartIcon } from "./icons";
import { LiveSearch } from "./live-search";
import { PictogramIcon } from "./pictogram";

interface Props {
  /** The page the filter belongs to. */
  path: string;
  filter: RecipeFilter;
  categories: Category[];
  books: string[];
  tagGroups: TagGroup[];
  /** Parameters of the page that are not part of the filter and have to survive it. */
  keep?: Record<string, string>;
  /** Set where a recipe is being chosen for a plan. See `LiveSearch`. */
  plan?: { action: (form: FormData) => Promise<void>; fields: Record<string, string> };
  /** Leave out the favourites chip, on a page that shows nothing else. */
  favoritesOnly?: boolean;
}

/**
 * Search and filters of the recipe library. Every filter is a link that changes the address
 * of the page, so it works before any script has loaded; the search field answers while
 * typing once it has.
 */
export function RecipeFilterBar({
  path,
  filter,
  categories,
  books,
  tagGroups,
  keep = {},
  plan,
  favoritesOnly = false,
}: Props) {
  const href = (patch: Partial<RecipeFilter>) =>
    `${path}?${new URLSearchParams({ ...keep, ...filterParams({ ...filter, ...patch }) })}`;
  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;
  // The search field sends the text itself; everything else rides along hidden.
  const others = filterParams({ ...filter, text: "" });
  const narrowed = filter.category !== null || filter.book !== null || filter.tags.length > 0;
  const toggled = (ref: string) =>
    filter.tags.includes(ref) ? filter.tags.filter((tag) => tag !== ref) : [...filter.tags, ref];
  // Every chip starts with the picture of what it narrows down to.
  const picture = (patch: Partial<RecipeFilter>) => (
    <PictogramIcon name={pictogramForFilter({ ...NO_FILTER, ...patch })} className="chip-picture" />
  );

  return (
    <div className="space-y-3">
      {/* The field follows the address: emptied there, it starts empty here. */}
      <LiveSearch
        key={filter.text}
        path={path}
        hidden={{ ...keep, ...others }}
        filter={filter}
        plan={plan}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {!favoritesOnly && (
          <Link
            href={href({ favorites: !filter.favorites })}
            className={chip(filter.favorites)}
            aria-pressed={filter.favorites}
          >
            <HeartIcon filled={filter.favorites} />
            Favoriten
          </Link>
        )}
        {TIME_LIMITS.slice(0, 2).map((minutes) => (
          <Link
            key={minutes}
            href={href({ maxMinutes: filter.maxMinutes === minutes ? null : minutes })}
            className={chip(filter.maxMinutes === minutes)}
            aria-pressed={filter.maxMinutes === minutes}
          >
            <ClockIcon />
            bis {minutes} Min.
          </Link>
        ))}
        {DIETS.map((diet) => (
          <Link
            key={diet}
            href={href({ diet: filter.diet === diet ? null : diet })}
            className={chip(filter.diet === diet)}
            aria-pressed={filter.diet === diet}
          >
            {picture({ diet })}
            {DIET_NAME[diet]}
          </Link>
        ))}
      </div>

      <details open={narrowed} className="group">
        <summary className="link inline-flex min-h-10 items-center">
          <span className="group-open:hidden">Mehr Filter: Art, Aufwand, Küche, Kochbuch</span>
          <span className="hidden group-open:inline">Mehr Filter</span>
        </summary>
        <div className="mt-2 space-y-4">
          <Chips label="Art">
            {categories.map((category) => (
              <Link
                key={category.key}
                href={href({ category: filter.category === category.key ? null : category.key })}
                className={chip(filter.category === category.key)}
                aria-pressed={filter.category === category.key}
              >
                {picture({ category: category.key })}
                {category.name}
              </Link>
            ))}
          </Chips>
          {tagGroups.map((group) => (
            <Chips key={group.name} label={group.name}>
              {group.tags.map((tag) => (
                <Link
                  key={tag.ref}
                  href={href({ tags: toggled(tag.ref) })}
                  className={chip(filter.tags.includes(tag.ref))}
                  aria-pressed={filter.tags.includes(tag.ref)}
                >
                  {picture({ tags: [tag.ref] })}
                  {tag.name}
                </Link>
              ))}
            </Chips>
          ))}
          <Chips label="Kochbuch">
            {books.map((book) => (
              <Link
                key={book}
                href={href({ book: filter.book === book ? null : book })}
                className={chip(filter.book === book)}
                aria-pressed={filter.book === book}
              >
                {picture({ book })}
                {book}
              </Link>
            ))}
          </Chips>
        </div>
      </details>

      {!isNoFilter(favoritesOnly ? { ...filter, favorites: false } : filter) && (
        <Link
          href={href({ ...NO_FILTER, favorites: favoritesOnly })}
          className="link inline-flex min-h-10 items-center"
        >
          Alle Filter zurücksetzen
        </Link>
      )}
    </div>
  );
}

/** One group of filter chips under its name. */
function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="eyebrow mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
