import Link from "next/link";
import { duplicatePairs, loadLibraryChecks, recipeChecks } from "@/server/quality";
import { createSessionClient } from "@/server/supabase/server";

/**
 * The checks of the whole library: assigned fields that do not fit, and recipes that are
 * there twice. Undefined while they are worked out, which reads the whole library and takes
 * a moment; null when that failed (a migration not applied yet, an outage).
 */
type LibraryCounts = { fields: number; pairs: number } | null | undefined;

interface Counts {
  /** Imported recipes waiting for review. */
  waiting: number;
  /** Ingredients the catalog does not know yet. */
  proposals: number;
  library?: LibraryCounts;
}

const open = "rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn";
const quiet = "rounded-lg border border-line bg-surface px-4 py-3 font-semibold";

/**
 * What there is to check, as tiles. The two checks of the library are always there, so that
 * the section stands at once and does not move when their numbers arrive.
 */
export function CheckTiles({ waiting, proposals, library }: Counts) {
  return (
    <section className="mt-6" aria-labelledby="pruefen">
      <h2 id="pruefen" className="mb-2 text-lg font-semibold">
        Prüfen
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {waiting > 0 && (
          <Link href="/import/pruefen" className={open}>
            {waiting === 1 ? "1 Rezept prüfen" : `${waiting} Rezepte prüfen`}
            <span className="block text-sm font-normal">Beim Einlesen unsicher</span>
          </Link>
        )}
        {proposals > 0 && (
          <Link href="/import/vorschlaege" className={open}>
            {proposals === 1 ? "1 neue Zutat zuordnen" : `${proposals} neue Zutaten zuordnen`}
            <span className="block text-sm font-normal">Noch nicht im Katalog</span>
          </Link>
        )}
        <LibraryTile
          href="/import/pruefen/angaben"
          count={library === undefined ? undefined : library && library.fields}
          name="Angaben prüfen"
          found={(n) =>
            n === 1 ? "1 Rezept mit unpassenden Angaben" : `${n} Rezepte mit unpassenden Angaben`
          }
          none="Alle passen zu Zutaten und Titel"
          about="Art, Kategorie, Zeit, Portionen"
        />
        <LibraryTile
          href="/import/pruefen/doppelt"
          count={library === undefined ? undefined : library && library.pairs}
          name="Doppelte Rezepte"
          found={(n) =>
            n === 1 ? "1 Rezeptpaar vielleicht doppelt" : `${n} Rezeptpaare vielleicht doppelt`
          }
          none="Keine gefunden"
          about="Zusammenführen oder beide behalten"
        />
      </div>
    </section>
  );
}

/** A check of the library: its number once it is known, its name meanwhile. */
function LibraryTile({
  href,
  count,
  name,
  found,
  none,
  about,
}: {
  href: string;
  /** Undefined while counting, null when the count failed. */
  count: number | null | undefined;
  name: string;
  found: (count: number) => string;
  none: string;
  about: string;
}) {
  if (count !== undefined && count !== null && count > 0) {
    return (
      <Link href={href} className={open}>
        {found(count)}
        <span className="block text-sm font-normal">{about}</span>
      </Link>
    );
  }
  return (
    <Link href={href} className={quiet} aria-busy={count === undefined}>
      {name}
      <span className="block text-sm font-normal text-muted">
        {count === undefined ? "Wird gezählt …" : count === 0 ? none : about}
      </span>
    </Link>
  );
}

/** The tiles with the numbers of the library's checks, once they are worked out. */
export async function CheckTilesWithLibrary(counts: Counts) {
  return <CheckTiles {...counts} library={await countLibraryChecks()} />;
}

async function countLibraryChecks(): Promise<LibraryCounts> {
  try {
    const db = await createSessionClient();
    const library = await loadLibraryChecks(db);
    const pairs = await duplicatePairs(db, library);
    return { fields: recipeChecks(library).length, pairs: pairs.length };
  } catch (error) {
    console.error("library checks on the import page:", error);
    return null;
  }
}
