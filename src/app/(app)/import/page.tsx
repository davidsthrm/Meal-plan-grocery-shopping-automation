import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isIsoDate, mondayOf, weekdayLong } from "@/domain/dates";
import { MEAL_NAME } from "@/lib/plan-text";
import { allRows, must } from "@/server/catalog";
import { loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { CheckTiles, CheckTilesWithLibrary } from "./library-checks";
import { sourceLabel } from "@/domain/library/source";
import { loadSources } from "@/server/sources";
import { NewBatchForm } from "./new-batch-form";

export const metadata: Metadata = { title: "Import" };

const day = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function ImportPage(props: PageProps<"/import">) {
  const params = await props.searchParams;
  const db = await createSessionClient();
  // Opened from a meal of the week plan that is planned as text: the upload is for it.
  const date = one(params.d);
  const meal = (["lunch", "dinner", "coffee"] as const).find((name) => name === one(params.m));
  const planned =
    isIsoDate(date) && meal
      ? (await loadWeek(db, mondayOf(date))).find(
          (slot) => slot.date === date && slot.meal === meal,
        )
      : undefined;
  const forMeal =
    planned?.kind === "free_text" && meal ? { date, meal, label: planned.label } : null;
  const [batches, jobs, proposals] = await Promise.all([
    db
      .from("import_batch")
      .select("id, source_book, source_edition, created_at")
      .order("created_at", { ascending: false }),
    allRows(
      (from, to) => db.from("import_job").select("batch_id, status").order("id").range(from, to),
      "load recipes of batches",
    ),
    db.from("ingredient_proposal").select("id").eq("status", "open"),
  ]);
  const batchRows = must(batches, "load batches");
  const jobRows = jobs;
  const waiting = jobRows.filter((job) => job.status === "needs_review").length;
  const open = must(proposals, "load proposals").length;
  // Every cookbook and magazine of the library, with its editions, to offer and to place.
  const sources = await loadSources(db);

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

      <Suspense fallback={<CheckTiles waiting={waiting} proposals={open} />}>
        <CheckTilesWithLibrary waiting={waiting} proposals={open} />
      </Suspense>

      {forMeal ? (
        <div className="mt-6 mb-3 rounded-xl bg-accent-soft px-4 py-3">
          <h2 className="text-lg font-semibold">
            Rezept für {weekdayLong(forMeal.date)} {MEAL_NAME[forMeal.meal]}: {forMeal.label}
          </h2>
          <p className="mt-1 text-muted">
            Fotografiere die Seite aus dem Kochbuch. Das Rezept wird eingelesen und steht dann statt
            des Textes im Wochenplan.{" "}
            <Link href={`/woche?w=${mondayOf(forMeal.date)}#tag-${forMeal.date}`} className="link">
              Zurück zum Wochenplan
            </Link>
          </p>
        </div>
      ) : (
        <h2 className="mt-6 mb-2 text-lg font-semibold">Neuer Stapel</h2>
      )}
      <NewBatchForm
        sources={sources}
        forMeal={forMeal && { date: forMeal.date, meal: forMeal.meal }}
      />

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
                      {sourceLabel(batch.source_book, batch.source_edition) || "Ohne Kochbuch"}
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
