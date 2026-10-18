import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isIsoDate, mondayOf, weekdayLong } from "@/domain/dates";
import { MEAL_NAME } from "@/lib/plan-text";
import { allRows, must } from "@/server/catalog";
import { loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { FolderIcon } from "@/components/icons";
import { batchShelf, type BatchEntry } from "@/domain/import/batch-shelf";
import { sourceLabel } from "@/domain/library/source";
import { loadSources } from "@/server/sources";
import { CheckTiles, CheckTilesWithLibrary } from "./library-checks";
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
      (from, to) =>
        db.from("import_job").select("id, batch_id, status, recipe_id").order("id").range(from, to),
      "load recipes of batches",
    ),
    db.from("ingredient_proposal").select("id").eq("status", "open"),
  ]);
  const batchRows = must(batches, "load batches");
  const jobRows = jobs;
  const waiting = jobRows.filter((job) => job.status === "needs_review").length;
  const open = must(proposals, "load proposals").length;
  // Every cookbook and magazine of the library, with its editions, to offer and to place.
  const [sources, recipeSources] = await Promise.all([
    loadSources(db),
    allRows(
      (from, to) =>
        db.from("recipe").select("id, source_book, source_edition").order("id").range(from, to),
      "load sources of recipes",
    ),
  ]);
  const sourceOfRecipe = new Map(
    recipeSources.map((recipe) => [
      recipe.id,
      { book: recipe.source_book, edition: recipe.source_edition },
    ]),
  );
  const shelf = batchShelf(
    batchRows.map((batch) => {
      const own = jobRows.filter((job) => job.batch_id === batch.id);
      return {
        id: batch.id,
        createdAt: batch.created_at,
        book: batch.source_book,
        edition: batch.source_edition,
        recipes: own.length,
        review: own.filter((job) => job.status === "needs_review").length,
        recipeSources: own.flatMap((job) => {
          const source = job.recipe_id ? sourceOfRecipe.get(job.recipe_id) : undefined;
          return source ? [source] : [];
        }),
      };
    }),
  );

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
            {shelf.map((entry) =>
              entry.kind === "batch" ? (
                <li key={entry.batch.id}>
                  <BatchLink
                    batch={entry.batch}
                    name={
                      entry.source
                        ? sourceLabel(entry.source.book, entry.source.edition)
                        : "Ohne Kochbuch"
                    }
                  />
                </li>
              ) : (
                // A magazine is a folder with an edition per row; so is a cookbook
                // photographed in several sittings.
                <li key={entry.book}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-accent-soft [&::-webkit-details-marker]:hidden">
                      <span className="text-accent">
                        <FolderIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{entry.book}</span>
                        <span className="block text-sm text-muted">
                          {entry.editions.some((edition) => edition.edition)
                            ? `${countText(entry.editions.length, "Ausgabe", "Ausgaben")} · `
                            : ""}
                          {countText(entry.recipes, "Rezept", "Rezepte")}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-accent">
                        <span className="group-open:hidden">Öffnen</span>
                        <span className="hidden group-open:inline">Schließen</span>
                      </span>
                    </summary>
                    <ul className="divide-y divide-line border-t border-line bg-paper">
                      {entry.editions.map((edition) => {
                        const name = edition.edition ?? entry.book;
                        // One upload is the edition itself; several are listed under it once.
                        if (edition.batches.length === 1) {
                          return (
                            <li key={edition.batches[0].id} className="pl-8">
                              <BatchLink batch={edition.batches[0]} name={name} />
                            </li>
                          );
                        }
                        const recipes = edition.batches.reduce((sum, b) => sum + b.recipes, 0);
                        return (
                          <li key={name} className="pl-8">
                            <p className="px-4 pt-3 font-semibold">
                              {name}
                              <span className="block text-sm font-normal text-muted">
                                {edition.batches.length} Stapel ·{" "}
                                {countText(recipes, "Rezept", "Rezepte")}
                              </span>
                            </p>
                            <ul className="pl-4">
                              {edition.batches.map((batch) => (
                                <li key={batch.id}>
                                  <BatchLink batch={batch} name="Stapel" />
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function countText(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One batch: its name, when it was started, and what came of it. */
function BatchLink({ batch, name }: { batch: BatchEntry; name: string }) {
  return (
    <Link href={`/import/${batch.id}`} className="block px-4 py-3 hover:bg-accent-soft">
      <span className="block font-semibold">{name}</span>
      <span className="block text-sm text-muted">
        {day.format(new Date(batch.createdAt))} · {countText(batch.recipes, "Rezept", "Rezepte")}
        {batch.review > 0 && ` · ${batch.review} zu prüfen`}
      </span>
    </Link>
  );
}
