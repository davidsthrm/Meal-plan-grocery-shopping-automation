import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { must } from "@/server/catalog";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Prüfen" };

/** The review queue: goes straight to the first recipe that waits, if there is one. */
export default async function ReviewQueuePage() {
  const db = await createSessionClient();
  const waiting = must(
    await db
      .from("import_job")
      .select("id")
      .eq("status", "needs_review")
      .not("recipe_id", "is", null)
      .order("created_at")
      .order("position")
      .limit(1),
    "load review queue",
  );
  if (waiting[0]) redirect(`/import/pruefen/${waiting[0].id}`);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Alles geprüft</h1>
      <p className="mt-2 text-muted">Im Moment wartet kein eingelesenes Rezept auf dich.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/import/pruefen/angaben" className="btn">
          Angaben der Bibliothek prüfen
        </Link>
        <Link href="/import/pruefen/doppelt" className="btn">
          Doppelte Rezepte
        </Link>
        <Link href="/import" className="btn">
          Zurück zum Import
        </Link>
      </div>
    </div>
  );
}
