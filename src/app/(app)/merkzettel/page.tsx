import type { Metadata } from "next";
import Link from "next/link";
import { RestockNote } from "@/components/restock-note";
import { planningWeek } from "@/domain/dates";
import { today } from "@/lib/today";
import { loadOwnRestock } from "@/server/shopping/restock";

export const metadata: Metadata = { title: "Merkzettel" };

/**
 * The note for what ran out at home, as a page. The header pulls the same note down over
 * whatever page is open; this is where its sign leads before any script has loaded.
 */
export default async function RestockPage() {
  const now = today();
  const items = await loadOwnRestock(now);

  return (
    <div className="mx-auto max-w-xl pt-4">
      <RestockNote items={items} asPage />
      <p className="mt-8 text-sm text-muted">
        Was hier steht, ist noch auf keinem Einkaufszettel. Mit dem Knopf daneben kommt es auf den
        Zettel des nächsten Einkaufs; welcher das ist, steht dabei.
      </p>
      <Link href={`/einkauf?w=${planningWeek(now)}`} className="btn btn-small mt-4">
        Zu den Einkaufszetteln
      </Link>
    </div>
  );
}
