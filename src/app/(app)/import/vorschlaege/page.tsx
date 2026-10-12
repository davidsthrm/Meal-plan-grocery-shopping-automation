import type { Metadata } from "next";
import Link from "next/link";
import { loadCatalogIndex, loadIngredientNames, must } from "@/server/catalog";
import { loadOpenProposals, settleKnownProposals } from "@/server/import/proposals";
import { createSessionClient } from "@/server/supabase/server";
import { ProposalList } from "./proposal-list";

export const metadata: Metadata = { title: "Neue Zutaten" };

export default async function ProposalsPage() {
  const db = await createSessionClient();
  // What the catalog can answer by itself by now is closed before anything is shown.
  await settleKnownProposals(db, await loadCatalogIndex(db));
  const [proposals, ingredients, aisles] = await Promise.all([
    loadOpenProposals(db),
    loadIngredientNames(db),
    db.from("aisle_group").select("id, name").order("sort_order"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/import" className="text-sm font-semibold text-accent">
        ← Import
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Neue Zutaten</h1>
      {proposals.length === 0 ? (
        <p className="mt-2 text-muted">
          Keine offenen Vorschläge. Der Katalog kennt alle Zutaten deiner Rezepte.
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            Diese Zutaten kommen in eingelesenen Rezepten vor und stehen noch nicht im Katalog. Jede
            Zeile hat schon einen Vorschlag. Ändere, was nicht stimmt, und übernimm dann alles auf
            einmal. Die Rezepte selbst sind davon unabhängig schon übernommen.
          </p>
          <ProposalList
            // After saving, the remaining proposals start from their own suggestions again.
            key={proposals.map((proposal) => proposal.id).join()}
            proposals={proposals}
            ingredients={ingredients}
            aisleGroups={must(aisles, "load aisle groups")}
          />
        </>
      )}
    </div>
  );
}
