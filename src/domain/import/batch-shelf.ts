import { byEdition, splitSource, type Source } from "../library/source";

/**
 * The batches of the import page as folders: a cookbook photographed in one sitting is one
 * row, a magazine is one folder with a subfolder per edition, and the batches of each
 * edition in it. The household found every edition of "Einfach Hausgemacht" on a line of
 * its own hard to find its way in.
 */

export interface BatchRow {
  id: string;
  /** When it was started, as stored. */
  createdAt: string;
  book: string | null;
  edition: string | null;
  recipes: number;
  /** Recipes of it that wait for review. */
  review: number;
  /** Where the recipes read from it come from: entered at review when the batch named none. */
  recipeSources: readonly { book: string | null; edition: string | null }[];
}

export interface BatchEntry {
  id: string;
  createdAt: string;
  recipes: number;
  review: number;
}

export type ShelfEntry =
  /** A batch of its own: a cookbook with one batch, or one without any. */
  | { kind: "batch"; source: Source | null; batch: BatchEntry }
  /** A magazine, or a cookbook photographed in several sittings. */
  | {
      kind: "stack";
      book: string;
      recipes: number;
      editions: { edition: string | null; batches: BatchEntry[] }[];
    };

/**
 * Where a batch's photos come from: what the batch names, or else what all of its recipes
 * name. A name stored before editions were kept apart ("Einfach Hausgemacht 06/2020") is
 * split by its shape.
 */
export function batchSource(
  row: Pick<BatchRow, "book" | "edition" | "recipeSources">,
): Source | null {
  let source: Source | null = row.book ? { book: row.book, edition: row.edition } : null;
  if (!source) {
    const named = row.recipeSources.filter((entry) => entry.book);
    const first = named[0];
    const shared =
      first &&
      named.length === row.recipeSources.length &&
      named.every((entry) => entry.book === first.book && entry.edition === first.edition);
    if (shared) source = { book: first.book as string, edition: first.edition };
  }
  if (source && source.edition === null) {
    const split = splitSource(source.book, []);
    if (split.edition) source = split;
  }
  return source;
}

/** The batches, newest first, as rows and folders; a folder stands where its newest batch does. */
export function batchShelf(rows: readonly BatchRow[]): ShelfEntry[] {
  const newestFirst = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sourceOf = new Map(newestFirst.map((row) => [row.id, batchSource(row)]));
  const byBook = new Map<string, BatchRow[]>();
  for (const row of newestFirst) {
    const book = sourceOf.get(row.id)?.book;
    if (book) byBook.set(book, [...(byBook.get(book) ?? []), row]);
  }
  const entry = (row: BatchRow): BatchEntry => ({
    id: row.id,
    createdAt: row.createdAt,
    recipes: row.recipes,
    review: row.review,
  });

  const shelf: ShelfEntry[] = [];
  const placed = new Set<string>();
  for (const row of newestFirst) {
    const source = sourceOf.get(row.id) ?? null;
    if (!source) {
      shelf.push({ kind: "batch", source: null, batch: entry(row) });
      continue;
    }
    if (placed.has(source.book)) continue;
    placed.add(source.book);
    const own = byBook.get(source.book) ?? [];
    const hasEditions = own.some((other) => sourceOf.get(other.id)?.edition);
    if (!hasEditions && own.length === 1) {
      shelf.push({ kind: "batch", source, batch: entry(row) });
      continue;
    }
    const editions = new Map<string | null, BatchEntry[]>();
    for (const other of own) {
      const edition = sourceOf.get(other.id)?.edition ?? null;
      editions.set(edition, [...(editions.get(edition) ?? []), entry(other)]);
    }
    shelf.push({
      kind: "stack",
      book: source.book,
      recipes: own.reduce((sum, other) => sum + other.recipes, 0),
      // The newest edition on top, batches without one at the end.
      editions: [...editions]
        .map(([edition, batches]) => ({ edition, batches }))
        .sort((a, b) =>
          a.edition === null ? 1 : b.edition === null ? -1 : byEdition(b.edition, a.edition),
        ),
    });
  }
  return shelf;
}
