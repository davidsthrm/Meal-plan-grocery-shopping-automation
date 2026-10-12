import type { Metadata } from "next";
import Link from "next/link";
import { must } from "@/server/catalog";
import { createSessionClient } from "@/server/supabase/server";
import { NewBatchForm } from "./new-batch-form";

export const metadata: Metadata = { title: "Import" };

const day = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

export default async function ImportPage() {
  const db = await createSessionClient();
  const [batches, jobs, proposals] = await Promise.all([
    db
      .from("import_batch")
      .select("id, source_book, created_at")
      .order("created_at", { ascending: false }),
    db.from("import_job").select("batch_id, status"),
    db.from("ingredient_proposal").select("id").eq("status", "open"),
  ]);
  const batchRows = must(batches, "load batches");
  const jobRows = must(jobs, "load recipes of batches");
  const waiting = jobRows.filter((job) => job.status === "needs_review").length;
  const open = must(proposals, "load proposals").length;
  const books = [
    ...new Set(batchRows.map((b) => b.source_book).filter((b): b is string => Boolean(b))),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Rezepte einlesen</h1>
      <p className="mt-1 text-muted">
        Fotografiere ein Kochbuch Seite für Seite und lade die Fotos hier hoch. Was sicher gelesen
        wurde, landet direkt bei den Rezepten. Alles andere bekommst du zum Prüfen.
      </p>
      <p className="mt-2">
        <Link href="/rezepte/neu" className="link">
          Ohne Foto: Rezept eintippen
        </Link>
      </p>

      {(waiting > 0 || open > 0) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {waiting > 0 && (
            <Link
              href="/import/pruefen"
              className="rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn"
            >
              {waiting === 1 ? "1 Rezept prüfen" : `${waiting} Rezepte prüfen`}
            </Link>
          )}
          {open > 0 && (
            <Link
              href="/import/vorschlaege"
              className="rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn"
            >
              {open === 1 ? "1 neue Zutat zuordnen" : `${open} neue Zutaten zuordnen`}
            </Link>
          )}
        </div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-semibold">Neuer Stapel</h2>
      <NewBatchForm knownBooks={books} />

      {batchRows.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-lg font-semibold">Bisherige Stapel</h2>
          <ul className="card divide-y divide-line">
            {batchRows.map((batch) => {
              const own = jobRows.filter((job) => job.batch_id === batch.id);
              const review = own.filter((job) => job.status === "needs_review").length;
              return (
                <li key={batch.id}>
                  <Link
                    href={`/import/${batch.id}`}
                    className="block px-4 py-3 hover:bg-accent-soft"
                  >
                    <span className="block font-semibold">
                      {batch.source_book ?? "Ohne Kochbuch"}
                    </span>
                    <span className="block text-sm text-muted">
                      {day.format(new Date(batch.created_at))} · {own.length} Rezepte
                      {review > 0 && ` · ${review} zu prüfen`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
