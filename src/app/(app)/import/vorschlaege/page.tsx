import type { Metadata } from "next";
import Link from "next/link";
import { UNITS } from "@/domain/units";
import { must } from "@/server/catalog";
import { loadOpenProposals } from "@/server/import/proposals";
import { createSessionClient } from "@/server/supabase/server";
import { ProposalCard } from "./proposal-card";

export const metadata: Metadata = { title: "Neue Zutaten" };

export default async function ProposalsPage() {
  const db = await createSessionClient();
  const [proposals, ingredients, aisles, shops] = await Promise.all([
    loadOpenProposals(db),
    db.from("ingredient").select("id, name").eq("status", "active").order("name"),
    db.from("aisle_group").select("id, name").order("sort_order"),
    db.from("shop").select("id, name").order("sort_order"),
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
            Diese Zutaten kommen in eingelesenen Rezepten vor und stehen noch nicht im Katalog. Die
            Angaben sind Vorschläge. Passe sie an, wenn sie nicht stimmen.
          </p>
          <ul className="mt-4 space-y-4">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                ingredients={must(ingredients, "load ingredients")}
                aisleGroups={must(aisles, "load aisle groups")}
                shops={must(shops, "load shops")}
                units={[...UNITS]}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
