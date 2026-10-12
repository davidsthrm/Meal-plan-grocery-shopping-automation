import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ImportIssue } from "@/domain/import/checks";
import type { PageSurvey } from "@/domain/import/survey";
import { issueText } from "@/lib/issue-text";
import { must } from "@/server/catalog";
import { batchProgress } from "@/server/import/batch";
import { viewUrls } from "@/server/import/storage";
import { createSessionClient } from "@/server/supabase/server";
import { readIgnoredPage } from "../actions";
import { BatchRunner } from "./batch-runner";
import { DeleteBatchButton } from "./delete-batch-button";

export const metadata: Metadata = { title: "Stapel" };

const STATUS: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "wartet", tone: "text-muted" },
  processing: { label: "wird gelesen", tone: "text-muted" },
  approved: { label: "übernommen", tone: "text-accent" },
  needs_review: { label: "bitte prüfen", tone: "text-warn" },
  failed: { label: "nicht lesbar", tone: "text-danger" },
  discarded: { label: "verworfen", tone: "text-muted" },
};

export default async function BatchPage(props: PageProps<"/import/[batchId]">) {
  const { batchId } = await props.params;
  const db = await createSessionClient();
  const { data: batch } = await db
    .from("import_batch")
    .select("id, source_book")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();

  const [progress, jobs, pages, proposals] = await Promise.all([
    batchProgress(db, batchId),
    db
      .from("import_job")
      .select("id, position, status, recipe_id, issues, page_ids")
      .eq("batch_id", batchId)
      .order("position"),
    db
      .from("import_page")
      .select("id, position, file_name, status, photo_path, printed_page, survey, error")
      .eq("batch_id", batchId)
      .order("position"),
    db.from("ingredient_proposal").select("id").eq("status", "open"),
  ]);
  const openProposals = must(proposals, "load proposals").length;
  const jobRows = must(jobs, "load recipes of batch");
  const pageRows = must(pages, "load pages");
  const recipeIds = jobRows.flatMap((job) => (job.recipe_id ? [job.recipe_id] : []));
  const recipes = recipeIds.length
    ? must(
        await db.from("recipe").select("id, title, source_page").in("id", recipeIds),
        "load recipes",
      )
    : [];
  const recipeOf = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const leftOut = pageRows.filter((page) => page.status === "ignored" || page.status === "failed");
  const thumbs = await viewUrls(
    leftOut.flatMap((page) => (page.photo_path ? [page.photo_path] : [])),
  );
  const { recipes: count } = progress;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/import" className="text-sm font-semibold text-accent">
        ← Alle Stapel
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{batch.source_book ?? "Stapel ohne Kochbuch"}</h1>
      <p className="mt-1 text-muted">
        {pageRows.length} {pageRows.length === 1 ? "Foto" : "Fotos"}
        {count.total > 0 &&
          ` · ${count.approved} übernommen · ${count.needsReview} zu prüfen` +
            (count.failed > 0 ? ` · ${count.failed} nicht lesbar` : "")}
      </p>

      <BatchRunner batchId={batchId} initial={progress} />

      {progress.done && openProposals > 0 && (
        <div className="card mt-4 p-4">
          <Link href="/import/vorschlaege" className="btn btn-primary w-full">
            {openProposals === 1
              ? "1 neue Zutat bestätigen"
              : `${openProposals} neue Zutaten bestätigen`}
          </Link>
          <p className="mt-2 text-sm text-muted">
            Am besten zuerst. Rezepte, die nur auf eine unbekannte Zutat warten, werden danach von
            selbst übernommen und müssen nicht einzeln geprüft werden.
          </p>
        </div>
      )}
      {progress.done && count.needsReview > 0 && (
        <Link
          href="/import/pruefen"
          className={`btn mt-4 w-full ${openProposals > 0 ? "" : "btn-primary"}`}
        >
          {count.needsReview === 1 ? "1 Rezept prüfen" : `${count.needsReview} Rezepte prüfen`}
        </Link>
      )}

      {jobRows.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Rezepte</h2>
          <ul className="card divide-y divide-line">
            {jobRows.map((job) => {
              const recipe = job.recipe_id ? recipeOf.get(job.recipe_id) : undefined;
              const status = STATUS[job.status];
              const issues = job.issues as unknown as ImportIssue[];
              const href =
                job.status === "needs_review" && recipe
                  ? `/import/pruefen/${job.id}`
                  : job.status === "approved" && recipe
                    ? `/rezepte/${recipe.id}`
                    : null;
              const row = (
                <>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{recipe?.title ?? "Noch nicht gelesen"}</span>
                    <span className={`shrink-0 text-sm font-semibold ${status.tone}`}>
                      {status.label}
                    </span>
                  </span>
                  <span className="block text-sm text-muted">
                    {job.page_ids.length === 1 ? "1 Foto" : `${job.page_ids.length} Fotos`}
                    {recipe?.source_page != null && ` · S. ${recipe.source_page}`}
                    {issues.length > 0 && ` · ${issueText(issues[0])}`}
                    {issues.length > 1 && ` (+${issues.length - 1})`}
                  </span>
                </>
              );
              return (
                <li key={job.id}>
                  {href ? (
                    <Link href={href} className="block px-4 py-3 hover:bg-accent-soft">
                      {row}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {leftOut.length > 0 && (
        <>
          <h2 className="mt-6 mb-1 text-lg font-semibold">Seiten ohne Rezept</h2>
          <p className="mb-2 text-sm text-muted">
            Auf diesen Fotos wurde kein Rezept gefunden. Stimmt das nicht, lass die Seite trotzdem
            einlesen.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {leftOut.map((page) => {
              const survey = page.survey as unknown as PageSurvey | null;
              const url = page.photo_path ? thumbs[page.photo_path] : undefined;
              return (
                <li key={page.id} className="card flex gap-3 p-3">
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                      <img
                        src={url}
                        alt={`Foto ${page.file_name}`}
                        className="h-24 w-[4.5rem] rounded border border-line object-cover"
                      />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{page.file_name}</p>
                    <p className="text-sm text-muted">
                      {page.status === "failed"
                        ? (page.error ?? "Konnte nicht gelesen werden.")
                        : survey?.otherContent || "Kein Rezept erkannt."}
                    </p>
                    {page.photo_path && (
                      <form action={readIgnoredPage.bind(null, page.id)} className="mt-2">
                        <button className="btn min-h-10 px-3 text-sm">Trotzdem einlesen</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-10 border-t border-line pt-4">
        <DeleteBatchButton batchId={batchId} recipes={recipeIds.length} />
      </div>
    </div>
  );
}
