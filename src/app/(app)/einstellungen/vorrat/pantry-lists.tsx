import { CloseIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import type { Ingredient } from "@/domain/catalog";
import type { PantryGroup } from "@/domain/pantry";
import { addStaple, removeStaple } from "../actions";

/**
 * The Vorrat as a list: by kind of grocery, or, while searching, what fits the search in the
 * Vorrat and in the rest of the catalog side by side.
 */
export function PantryLists({
  query,
  groups,
  inPantry,
  notYet,
  found,
  aisleName,
}: {
  query: string;
  groups: PantryGroup[];
  /** What fits the search and is in the Vorrat, and what fits it and is not. */
  inPantry: Ingredient[];
  notYet: Ingredient[];
  /** How many ingredients fit the search at all. */
  found: number;
  aisleName: (ingredient: Ingredient) => string;
}) {
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <>
      {query !== "" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section aria-labelledby="treffer-vorrat" className="card p-4">
            <h2 id="treffer-vorrat" className="font-semibold">
              Im Vorrat
            </h2>
            {inPantry.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Nichts davon ist im Vorrat.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {inPantry.map((ingredient) => (
                  <Row
                    key={ingredient.id}
                    ingredient={ingredient}
                    query={query}
                    note={aisleName(ingredient)}
                    staple
                  />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="treffer-katalog" className="card p-4">
            <h2 id="treffer-katalog" className="font-semibold">
              Nicht im Vorrat
            </h2>
            {notYet.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                {found === 0
                  ? `„${query}“ kennt der Katalog nicht.`
                  : "Alles, was passt, ist schon im Vorrat."}
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {notYet.map((ingredient) => (
                  <Row
                    key={ingredient.id}
                    ingredient={ingredient}
                    query={query}
                    note={aisleName(ingredient)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : count === 0 ? (
        <p className="mt-6 text-muted">
          Noch nichts im Vorrat. Oben suchen und hinzufügen, zum Beispiel Salz, Öl oder Mehl.
        </p>
      ) : (
        <div className="mt-6 gap-4 sm:columns-2 lg:columns-3">
          {groups.map(({ aisleGroup, items }) => (
            <section
              key={aisleGroup.id}
              aria-label={aisleGroup.name}
              className="card mb-4 break-inside-avoid p-4"
            >
              <h2 className="flex items-baseline justify-between gap-3 font-semibold">
                {aisleGroup.name}
                <span className="text-sm font-normal text-muted tabular-nums">{items.length}</span>
              </h2>
              <ul className="mt-1 divide-y divide-line">
                {items.map((ingredient) => (
                  <Row key={ingredient.id} ingredient={ingredient} query="" staple />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** One ingredient: its name, and a tap to take it out of the Vorrat or to put it in. */
function Row({
  ingredient,
  query,
  note,
  staple = false,
}: {
  ingredient: Ingredient;
  /** The search that is open, kept when the page comes back. */
  query: string;
  /** Said after the name: the kind of grocery, in a list of search results. */
  note?: string;
  staple?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        {ingredient.name}
        {note && <span className="block text-sm text-muted">{note}</span>}
      </span>
      <form action={staple ? removeStaple : addStaple}>
        <input type="hidden" name="id" value={ingredient.id} />
        <input type="hidden" name="q" value={query} />
        {staple ? (
          <SubmitButton
            className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-danger"
            label={`${ingredient.name} aus dem Vorrat nehmen`}
          >
            <CloseIcon />
          </SubmitButton>
        ) : (
          <SubmitButton className="btn btn-small" label={`${ingredient.name} zum Vorrat`}>
            Hinzufügen
          </SubmitButton>
        )}
      </form>
    </li>
  );
}
