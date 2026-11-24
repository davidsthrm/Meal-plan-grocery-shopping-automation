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
      {/* A way to another page is a plain link, not a pill. */}
      <Link
        href={`/einkauf?w=${planningWeek(now)}`}
        className="link mt-8 inline-flex min-h-11 items-center"
      >
        Zu den Einkaufszetteln
      </Link>
    </div>
  );
}
