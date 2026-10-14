import type { Metadata } from "next";
import Link from "next/link";
import { CloseIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import type { Ingredient } from "@/domain/catalog";
import { pantryByAisle, searchCatalog } from "@/domain/pantry";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex } from "@/server/catalog";
import { createSessionClient } from "@/server/supabase/server";
import { addStaple, removeStaple } from "../actions";
import { SearchField } from "./search-field";

export const metadata: Metadata = { title: "Vorrat" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * What is usually at home, by kind of grocery: to look through, to search, and to change.
 * A search looks through the whole catalog, so that what is not in the Vorrat yet can be
 * added from the same list.
 */
export default async function PantryPage(props: PageProps<"/einstellungen/vorrat">) {
  const params = await props.searchParams;
  const query = (one(params.q) ?? "").trim().slice(0, 80);
  await requireHousehold();
  const index = await loadCatalogIndex(await createSessionClient());
  const groups = pantryByAisle(index);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const found = query === "" ? [] : searchCatalog(index.catalog.ingredients, query);
  const inPantry = found.filter((ingredient) => ingredient.isPantryStaple);
  const notYet = found.filter((ingredient) => !ingredient.isPantryStaple);
  const aisleName = (ingredient: Ingredient) =>
    index.aisleGroupById.get(ingredient.aisleGroupId)?.name ?? "";

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/einstellungen#vorrat" className="link text-sm">
        ← Einstellungen
      </Link>
      <h1 className="title mt-2">Vorrat</h1>
      <p className="mt-1 text-muted">
        {count === 1 ? "1 Zutat" : `${count} Zutaten`}, die meistens da sind. Brauchen Rezepte sie,
        stehen sie unter „Haben wir schon“ statt auf einem Zettel.
      </p>

      <div className="mt-5 max-w-xl">
        <SearchField query={query} />
      </div>

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
                {found.length === 0
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
    </div>
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
            className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-danger"
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
