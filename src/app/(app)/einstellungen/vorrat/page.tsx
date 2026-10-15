import type { Metadata } from "next";
import Link from "next/link";
import { pantryByAisle, searchCatalog } from "@/domain/pantry";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex } from "@/server/catalog";
import { createSessionClient } from "@/server/supabase/server";
import { PantryLists } from "./pantry-lists";
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

      <PantryLists
        query={query}
        groups={groups}
        inPantry={inPantry}
        notYet={notYet}
        found={found.length}
        aisleName={(ingredient) => index.aisleGroupById.get(ingredient.aisleGroupId)?.name ?? ""}
      />
    </div>
  );
}
