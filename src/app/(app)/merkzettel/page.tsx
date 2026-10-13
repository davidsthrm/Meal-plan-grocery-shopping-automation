import type { Metadata } from "next";
import Link from "next/link";
import { RestockNote } from "@/components/restock-note";
import { isIsoDate, mondayOf, planningWeek } from "@/domain/dates";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadCatalogIndex } from "@/server/catalog";
import { loadRestock, placeRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Merkzettel" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The note for what ran out at home, one tap away from every page. What is written here is
 * not on a shopping list yet: "Auf den Einkaufszettel" puts it on the next one.
 */
export default async function RestockPage(props: PageProps<"/merkzettel">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [items, index] = await Promise.all([loadRestock(db), loadCatalogIndex(db)]);
  const now = today();
  const moved = (one(params.auf) ?? "").split(".").filter(isIsoDate);

  return (
    <div className="mx-auto max-w-xl pt-4">
      <RestockNote
        items={placeRestock(items, index, household, now)}
        back="/merkzettel"
        moved={moved}
        suggestions={index.catalog.ingredients.map((ingredient) => ingredient.name)}
        asPage
      />
      <p className="mt-8 text-sm text-muted">
        Was hier steht, ist noch auf keinem Einkaufszettel. Mit dem Knopf daneben kommt es auf den
        Zettel des nächsten Einkaufs; der Tag steht dabei.
      </p>
      <Link
        href={`/einkauf?w=${mondayOf(moved[0] ?? planningWeek(now))}`}
        className="btn btn-small mt-4"
      >
        Zu den Einkaufszetteln
      </Link>
    </div>
  );
}
