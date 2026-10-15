import Link from "next/link";
import { duplicatePairs, loadLibraryChecks, recipeChecks } from "@/server/quality";
import { createSessionClient } from "@/server/supabase/server";

interface Counts {
  /** Imported recipes waiting for review. */
  waiting: number;
  /** Ingredients the catalog does not know yet. */
  proposals: number;
  /** Recipes with assigned fields that do not fit. Undefined while they are worked out. */
  fields?: number;
  /** Pairs of recipes that are probably the same dish. */
  pairs?: number;
}

const tile = "rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn";

/** What there is to check, as tiles. Nothing when there is nothing. */
export function CheckTiles({ waiting, proposals, fields = 0, pairs = 0 }: Counts) {
  if (waiting + proposals + fields + pairs === 0) return null;
  return (
    <section className="mt-6" aria-labelledby="pruefen">
      <h2 id="pruefen" className="mb-2 text-lg font-semibold">
        Prüfen
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {waiting > 0 && (
          <Link href="/import/pruefen" className={tile}>
            {waiting === 1 ? "1 Rezept prüfen" : `${waiting} Rezepte prüfen`}
            <span className="block text-sm font-normal">Beim Einlesen unsicher</span>
          </Link>
        )}
        {proposals > 0 && (
          <Link href="/import/vorschlaege" className={tile}>
            {proposals === 1 ? "1 neue Zutat zuordnen" : `${proposals} neue Zutaten zuordnen`}
            <span className="block text-sm font-normal">Noch nicht im Katalog</span>
          </Link>
        )}
        {fields > 0 && (
          <Link href="/import/pruefen/angaben" className={tile}>
            {fields === 1
              ? "1 Rezept mit unpassenden Angaben"
              : `${fields} Rezepte mit unpassenden Angaben`}
            <span className="block text-sm font-normal">Art, Kategorie, Zeit, Portionen</span>
          </Link>
        )}
        {pairs > 0 && (
          <Link href="/import/pruefen/doppelt" className={tile}>
            {pairs === 1
              ? "1 Rezeptpaar vielleicht doppelt"
              : `${pairs} Rezeptpaare vielleicht doppelt`}
            <span className="block text-sm font-normal">Zusammenführen oder beide behalten</span>
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * The tiles with the checks of the whole library added: assigned fields that do not fit,
 * and recipes that are there twice. They are worked out from the library, which takes a
 * moment, so the page shows the other tiles meanwhile.
 */
export async function CheckTilesWithLibrary(counts: Counts) {
  const db = await createSessionClient();
  const library = await loadLibraryChecks(db);
  const pairs = await duplicatePairs(db, library);
  return <CheckTiles {...counts} fields={recipeChecks(library).length} pairs={pairs.length} />;
}
