import "server-only";
import { knownSources, splitSource, type KnownSource, type Source } from "@/domain/library/source";
import { allRows, must, type Db } from "./catalog";

/**
 * The cookbooks and magazines of the library, with the editions of each: from its recipes
 * and from its batches, so that an edition whose batch is still being read is known too.
 */
export async function loadSources(db: Db): Promise<KnownSource[]> {
  const [recipes, batches] = await Promise.all([
    allRows(
      (from, to) =>
        db
          .from("recipe")
          .select("id, source_book, source_edition")
          .not("source_book", "is", null)
          .order("id")
          .range(from, to),
      "load sources of recipes",
    ),
    db.from("import_batch").select("source_book, source_edition").not("source_book", "is", null),
  ]);
  return knownSources(
    [...recipes, ...must(batches, "load sources of batches")].map((row) => ({
      book: row.source_book,
      edition: row.source_edition,
    })),
  );
}

/** The stack and edition a typed source means, among those of the library. */
export async function resolveSource(db: Db, typed: string | null): Promise<Source> {
  if (!typed || typed.trim() === "") return { book: "", edition: null };
  return splitSource(typed, await loadSources(db));
}
