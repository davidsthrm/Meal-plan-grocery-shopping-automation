import Form from "next/form";
import Link from "next/link";
import {
  DIETS,
  filterParams,
  isNoFilter,
  NO_FILTER,
  TIME_LIMITS,
  type RecipeFilter,
} from "@/domain/library/filter";
import type { Category } from "@/domain/library/summary";
import { DIET_NAME } from "@/lib/plan-text";
import { HeartIcon, SearchIcon } from "./icons";

interface Props {
  /** The page the filter belongs to. */
  path: string;
  filter: RecipeFilter;
  categories: Category[];
  books: string[];
  /** Parameters of the page that are not part of the filter and have to survive it. */
  keep?: Record<string, string>;
}

/**
 * Search and filters of the recipe library. Everything is a link or a plain form that
 * changes the address of the page, so it works before any script has loaded.
 */
export function RecipeFilterBar({ path, filter, categories, books, keep = {} }: Props) {
  const href = (patch: Partial<RecipeFilter>) =>
    `${path}?${new URLSearchParams({ ...keep, ...filterParams({ ...filter, ...patch }) })}`;
  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;
  // The search field sends the text itself; everything else rides along hidden.
  const others = filterParams({ ...filter, text: "" });
  const narrowed = filter.category !== null || filter.book !== null;

  return (
    <div className="space-y-3">
      <Form action={path} className="flex gap-2">
        {Object.entries({ ...keep, ...others }).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="relative flex-1">
          <span className="sr-only">Rezepte durchsuchen</span>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
            <SearchIcon />
          </span>
          <input
            // The field follows the address: emptied there, it is empty here.
            key={filter.text}
            type="search"
            name="q"
            defaultValue={filter.text}
            placeholder="Titel oder Zutat"
            className="field pl-10"
            enterKeyHint="search"
          />
        </label>
        <button className="btn">Suchen</button>
      </Form>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        <Link
          href={href({ favorites: !filter.favorites })}
          className={chip(filter.favorites)}
          aria-pressed={filter.favorites}
        >
          <HeartIcon filled={filter.favorites} />
          Favoriten
        </Link>
        {TIME_LIMITS.slice(0, 2).map((minutes) => (
          <Link
            key={minutes}
            href={href({ maxMinutes: filter.maxMinutes === minutes ? null : minutes })}
            className={chip(filter.maxMinutes === minutes)}
            aria-pressed={filter.maxMinutes === minutes}
          >
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
            {DIET_NAME[diet]}
          </Link>
        ))}
      </div>

      <details open={narrowed} className="group">
        <summary className="link inline-flex min-h-10 items-center">
          <span className="group-open:hidden">Art und Kochbuch wählen</span>
          <span className="hidden group-open:inline">Art und Kochbuch</span>
        </summary>
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Art">
            {categories.map((category) => (
              <Link
                key={category.key}
                href={href({ category: filter.category === category.key ? null : category.key })}
                className={chip(filter.category === category.key)}
                aria-pressed={filter.category === category.key}
              >
                {category.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Kochbuch">
            {books.map((book) => (
              <Link
                key={book}
                href={href({ book: filter.book === book ? null : book })}
                className={chip(filter.book === book)}
                aria-pressed={filter.book === book}
              >
                {book}
              </Link>
            ))}
          </div>
        </div>
      </details>

      {!isNoFilter(filter) && (
        <Link href={href(NO_FILTER)} className="link inline-flex min-h-10 items-center">
          Alle Filter zurücksetzen
        </Link>
      )}
    </div>
  );
}
