import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ShelfRow } from "@/components/discover";
import { ListMemory } from "@/components/list-return";
import { RecipeViews } from "@/components/recipe-views";
import { dayAndMonth } from "@/domain/dates";
import { bookshelf, cookedShare, openBook, type ShelfBook } from "@/domain/library/bookshelf";
import { bookOfTheDay, type Shelf } from "@/domain/library/discover";
import { NO_FILTER } from "@/domain/library/filter";
import { filterHref } from "@/components/recipe-filters";
import { fromBookshelf } from "@/lib/origin";
import { today } from "@/lib/today";
import { SWAP } from "@/lib/transitions";
import { loadLibraryForLists } from "@/server/recipe-list";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Regal" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The colours of the spines: the app's pastels, each book always the same one. */
const SPINES: [string, string][] = [
  ["#dce9d9", "#3a6344"],
  ["#d7e5ee", "#2f5c77"],
  ["#f5e3c8", "#7f5318"],
  ["#f1d9d5", "#86423a"],
  ["#eadff0", "#6d4c80"],
  ["#efe5d3", "#7a5a2e"],
  ["#e2ebf2", "#3f5a70"],
  ["#f6e6da", "#80502f"],
];

function spineColour(name: string): [string, string] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPINES[hash % SPINES.length];
}

/** How a recipe's last day on a plan reads in a row: "Zuletzt am 1. Oktober". */
const lastText = (day: string) => `Zuletzt am ${dayAndMonth(day)}`;

/**
 * The Regal: the cookbooks and magazines as a shelf of spines, each as tall as it is thick
 * and with a bar for how much of it was cooked. One is taken out and lies open below: its
 * editions, what fits the season, what was never cooked from it, what was. The table of every
 * recipe, which was here before, is "Alle Rezepte" under Import (October 2026).
 */
export default async function BookshelfPage(props: PageProps<"/rezepte/regal">) {
  const params = await props.searchParams;
  const now = today();
  const db = await createSessionClient();
  const library = await loadLibraryForLists(db, now);
  const { recipes, categories, history } = library;
  const shelf = bookshelf(recipes, history, now);
  const asked = one(params.buch);
  const name =
    asked && shelf.some((book) => book.name === asked)
      ? asked
      : (bookOfTheDay(recipes, now) ?? shelf[0]?.name ?? null);
  const open = name
    ? openBook(recipes, shelf, name, { edition: one(params.ausgabe), today: now, history })
    : null;
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);
  const most = Math.max(1, ...shelf.map((book) => book.recipes));
  const bookHref = (book: string, edition?: string | null) =>
    `/rezepte/regal?${new URLSearchParams({ buch: book, ...(edition ? { ausgabe: edition } : {}) })}`;

  return (
    <div className="mx-auto max-w-5xl">
      <ListMemory />
      <h1 className="sr-only">Regal</h1>
      <RecipeViews current="regal" />

      {shelf.length === 0 ? (
        <p className="mt-8 text-muted">
          Noch keine Kochbücher. Unter{" "}
          <Link href="/import" className="link underline">
            Import
          </Link>{" "}
          werden Seiten fotografiert und eingelesen.
        </p>
      ) : (
        <>
          <nav aria-label="Kochbücher und Hefte" className="bookshelf mt-5">
            {shelf.map((book) => (
              <Spine
                key={book.name}
                book={book}
                href={bookHref(book.name)}
                open={open?.book.name === book.name}
                height={book.recipes / most}
              />
            ))}
          </nav>

          {open && (
            <section aria-label={open.book.name} className="mt-6">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className="title">{open.book.name}</h2>
                  <p className="mt-1 text-muted tabular-nums">
                    {open.cooked} von {open.total} gekocht
                  </p>
                  <span className="cooked-bar mt-1.5" aria-hidden>
                    <i style={{ width: `${cookedShare(open.cooked, open.total) * 100}%` }} />
                  </span>
                </div>
                <Link
                  href={filterHref("/rezepte", {
                    ...NO_FILTER,
                    book: open.book.name,
                    edition: open.edition,
                  })}
                  className="link min-h-11 text-sm"
                >
                  Alle {open.total} anzeigen
                </Link>
              </div>

              {open.book.editions.length > 0 && (
                // A magazine's editions, newest first, in one row that scrolls sideways.
                <nav aria-label="Ausgaben" className="tab-row mt-4">
                  <Link
                    href={bookHref(open.book.name)}
                    replace
                    scroll={false}
                    transitionTypes={[SWAP]}
                    className="chip"
                    aria-current={open.edition === null ? "page" : undefined}
                  >
                    Alle Ausgaben
                  </Link>
                  {open.book.editions.map((edition) => (
                    <Link
                      key={edition}
                      href={bookHref(open.book.name, edition)}
                      replace
                      scroll={false}
                      transitionTypes={[SWAP]}
                      className="chip"
                      aria-current={open.edition === edition ? "page" : undefined}
                    >
                      {edition}
                    </Link>
                  ))}
                </nav>
              )}

              {(
                [
                  {
                    key: "saison",
                    title: "Passt zur Saison",
                    look: "card",
                    recipes: open.season,
                    why: Object.fromEntries(
                      open.season.flatMap((recipe) =>
                        recipe.season?.foods.length
                          ? [[recipe.id, `Mit ${recipe.season.foods.slice(0, 3).join(", ")}`]]
                          : [],
                      ),
                    ),
                  },
                  { key: "nie", title: "Noch nie gekocht", look: "list", recipes: open.never },
                  {
                    key: "gekocht",
                    title: "Schon gekocht",
                    look: "list",
                    recipes: open.known.map(({ recipe }) => recipe),
                    why: Object.fromEntries(
                      open.known.map(({ recipe, last }) => [recipe.id, lastText(last)]),
                    ),
                  },
                ] as const
              ).map(
                (part) =>
                  part.recipes.length > 0 && (
                    <ShelfRow
                      key={part.key}
                      shelf={
                        {
                          key: part.key,
                          title: part.title,
                          look: part.look,
                          filter: null,
                          total: part.recipes.length,
                          recipes: [...part.recipes],
                          why: "why" in part ? part.why : undefined,
                        } satisfies Shelf
                      }
                      all={null}
                      nameOf={nameOf}
                      from={fromBookshelf(open.book.name, open.edition)}
                    />
                  ),
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A book on the shelf: its spine in the book's colour, its name along it, as tall as the book
 * has recipes, with a bar at its foot for how much of it was cooked.
 */
function Spine({
  book,
  href,
  open,
  height,
}: {
  book: ShelfBook;
  href: string;
  open: boolean;
  height: number;
}) {
  const [paper, ink] = spineColour(book.name);
  return (
    <Link
      href={href}
      replace
      scroll={false}
      transitionTypes={[SWAP]}
      className="spine"
      aria-current={open ? "true" : undefined}
      aria-label={`${book.name}, ${book.cooked} von ${book.recipes} gekocht`}
      style={
        {
          "--spine": paper,
          "--spine-ink": ink,
          // Thin books are still tall enough for their name; the thickest fills the shelf.
          "--spine-height": `${10.5 + 4 * Math.sqrt(height)}rem`,
        } as CSSProperties
      }
    >
      <span className="spine-name">{book.name}</span>
      <span className="spine-count tabular-nums">{book.recipes}</span>
      <span className="spine-bar" aria-hidden>
        <i style={{ height: `${cookedShare(book.cooked, book.recipes) * 100}%` }} />
      </span>
    </Link>
  );
}
