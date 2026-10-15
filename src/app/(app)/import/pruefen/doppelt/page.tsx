import type { Metadata } from "next";
import Link from "next/link";
import { RecipeBadge, RecipeFacts } from "@/components/recipe-card";
import { HeartIcon, WishIcon } from "@/components/icons";
import { keepReason, pairKey, type DuplicatePair } from "@/domain/library/duplicates";
import { PROTEIN_NAME } from "@/domain/library/quality";
import { FROM_DUPLICATES } from "@/lib/origin";
import { sourceText } from "@/lib/recipe-text";
import { requireHousehold } from "@/server/auth";
import {
  categoryNamer,
  duplicatePairs,
  loadLibraryChecks,
  timesPlanned,
  type CheckedRecipe,
} from "@/server/quality";
import { createSessionClient } from "@/server/supabase/server";
import { keepBothRecipes, mergeDuplicate } from "../actions";

export const metadata: Metadata = { title: "Doppelte Rezepte" };

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Pairs shown at once. A decided pair makes room for the next. */
const SHOWN = 20;

const percent = (share: number) => `${Math.round(share * 100)} %`;

/**
 * Recipes that are probably the same dish twice, side by side: one is kept and the other
 * merged into it, or both are kept. Merging deletes a recipe, so it is asked once more.
 */
export default async function DuplicatesPage(props: PageProps<"/import/pruefen/doppelt">) {
  const params = await props.searchParams;
  await requireHousehold();
  const db = await createSessionClient();
  const library = await loadLibraryChecks(db);
  const pairs = await duplicatePairs(db, library);
  const shown = pairs.slice(0, SHOWN);
  const planned = await timesPlanned(
    db,
    shown.flatMap((pair) => [pair.a, pair.b]),
  );
  const categoryName = categoryNamer(library.categories);
  // The confirmation of a merge: which recipe stays and which goes.
  const keep = one(params.behalten);
  const drop = one(params.weg);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/import" className="link text-sm">
        ← Import
      </Link>
      <h1 className="title mt-2">Doppelte Rezepte</h1>
      <p className="mt-1 text-muted">
        Rezepte mit ähnlichem Titel und ähnlichen Zutaten, aus verschiedenen Kochbüchern oder
        zweimal eingelesen. Beim Zusammenführen bleibt eines, das andere wird gelöscht. Was am
        gelöschten hängt, geht auf das bleibende über: Mahlzeiten im Plan, Favorit, „Möchte ich
        kochen“ und eigene Schlagwörter.
      </p>

      {shown.length === 0 ? (
        <p className="card mt-6 p-4">Keine doppelten Rezepte gefunden.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {shown.map((pair) => {
            const a = library.recipes.get(pair.a);
            const b = library.recipes.get(pair.b);
            if (!a || !b) return null;
            const confirming =
              (keep === pair.a && drop === pair.b) || (keep === pair.b && drop === pair.a);
            return (
              <PairCard
                key={pairKey(pair.a, pair.b)}
                pair={pair}
                sides={[a, b]}
                planned={planned}
                confirm={confirming ? { keep, drop } : null}
                categoryName={categoryName}
              />
            );
          })}
        </ul>
      )}
      {pairs.length > shown.length && (
        <p className="mt-4 text-muted">
          Noch {pairs.length - shown.length} weitere Paare. Sie erscheinen hier, sobald über diese
          entschieden ist.
        </p>
      )}
    </div>
  );
}

function PairCard({
  pair,
  sides,
  planned,
  confirm,
  categoryName,
}: {
  pair: DuplicatePair;
  sides: [CheckedRecipe, CheckedRecipe];
  planned: Map<string, number>;
  confirm: { keep: string; drop: string } | null;
  categoryName: (key: string) => string;
}) {
  const [a, b] = sides;
  const id = `paar-${pair.a}-${pair.b}`;
  const sideOf = (side: CheckedRecipe) => ({
    id: side.summary.id,
    isFavorite: side.summary.isFavorite,
    planned: planned.get(side.summary.id) ?? 0,
  });
  // Marked only where something speaks for one: planned more often, or a favourite.
  const suggested = keepReason(sideOf(a), sideOf(b));
  const keysA = new Set(a.lines.map((line) => line.key));
  const keysB = new Set(b.lines.map((line) => line.key));
  const why =
    `Titel ${percent(pair.title)} ähnlich` +
    (pair.ingredients === null
      ? ", zu wenige Zutaten zum Vergleichen"
      : `, ${percent(pair.ingredients)} gleiche Zutaten`) +
    (pair.samePage ? ", gleiche Seite im selben Buch." : ".");
  const kept = confirm && sides.find((side) => side.summary.id === confirm.keep);
  const dropped = confirm && sides.find((side) => side.summary.id === confirm.drop);

  return (
    <li id={id} className="card p-4">
      <p className="eyebrow">{why}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {sides.map((side) => {
          const other = side === a ? b : a;
          const shared = side === a ? keysB : keysA;
          const times = planned.get(side.summary.id) ?? 0;
          return (
            <section key={side.summary.id} className="flex min-w-0 flex-col">
              <div className="flex items-start gap-3">
                <RecipeBadge recipe={side.summary} />
                <div className="min-w-0">
                  <Link
                    href={`/rezepte/${side.summary.id}${FROM_DUPLICATES}`}
                    className="font-semibold"
                  >
                    {side.summary.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {[
                      sourceText(side.summary.sourceBook, side.summary.sourcePage),
                      side.summary.proteinType ? PROTEIN_NAME[side.summary.proteinType] : "",
                      side.summary.category ? categoryName(side.summary.category) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <RecipeFacts recipe={side.summary} />
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                    <span>{times === 0 ? "Nie geplant" : `${times}× geplant`}</span>
                    {side.summary.isFavorite && (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <HeartIcon filled /> Favorit
                      </span>
                    )}
                    {side.summary.wanted && (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <WishIcon filled /> Möchte ich kochen
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <ul className="mt-3 text-sm">
                {side.lines.map((line, at) => (
                  <li
                    key={at}
                    className={shared.has(line.key) ? "" : "font-semibold text-warn"}
                    title={shared.has(line.key) ? undefined : "Nur in diesem Rezept"}
                  >
                    {line.name}
                  </li>
                ))}
                {side.lines.length === 0 && <li className="text-muted">Keine Zutaten</li>}
              </ul>
              {!confirm && (
                <div className="mt-auto pt-3">
                  <Link
                    href={`/import/pruefen/doppelt?behalten=${side.summary.id}&weg=${other.summary.id}#${id}`}
                    className={`btn btn-small w-full ${suggested?.id === side.summary.id ? "btn-primary" : ""}`}
                  >
                    Dieses behalten
                    {suggested?.id === side.summary.id && (
                      <span className="font-normal">· {suggested.reason}</span>
                    )}
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">Hervorgehoben: Zutaten, die nur in einem stehen.</p>

      {kept && dropped ? (
        <form action={mergeDuplicate} className="mt-4 rounded-lg bg-danger-soft px-4 py-3">
          <input type="hidden" name="behalten" value={kept.summary.id} />
          <input type="hidden" name="weg" value={dropped.summary.id} />
          <input type="hidden" name="bestaetigt" value="ja" />
          <p>
            „{dropped.summary.title}“
            {dropped.summary.sourceBook ? ` aus ${dropped.summary.sourceBook}` : ""} wird gelöscht,
            „{kept.summary.title}“ bleibt. {carried(dropped, planned.get(dropped.summary.id) ?? 0)}{" "}
            Das lässt sich nicht rückgängig machen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-danger">Zusammenführen und eins löschen</button>
            <Link href={`/import/pruefen/doppelt#${id}`} className="btn">
              Abbrechen
            </Link>
          </div>
        </form>
      ) : (
        <form action={keepBothRecipes} className="mt-3">
          <input type="hidden" name="a" value={pair.a} />
          <input type="hidden" name="b" value={pair.b} />
          <button className="btn btn-small w-full sm:w-auto">Beide behalten</button>
        </form>
      )}
    </li>
  );
}

/** What the kept recipe takes over from the one that goes, as a sentence. */
function carried(dropped: CheckedRecipe, times: number): string {
  const things = [
    times > 0 ? (times === 1 ? "seine Mahlzeit im Plan" : `seine ${times} Mahlzeiten im Plan`) : "",
    dropped.summary.isFavorite ? "den Favoriten" : "",
    dropped.summary.wanted ? "„Möchte ich kochen“" : "",
  ].filter(Boolean);
  if (things.length === 0) return "Es stand in keinem Plan.";
  const listed =
    things.length === 1 ? things[0] : `${things.slice(0, -1).join(", ")} und ${things.at(-1)}`;
  return `Es übernimmt ${listed}.`;
}
