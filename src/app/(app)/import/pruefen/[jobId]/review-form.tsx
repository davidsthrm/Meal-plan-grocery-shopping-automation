"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { IngredientRows, rowsToLines, toRows } from "@/components/ingredient-rows";
import { StepsField } from "@/components/steps-field";
import { typedSteps } from "@/domain/import/steps";
import type { ReviewErrors, ReviewInput } from "@/domain/import/review-input";
import { issueText } from "@/lib/issue-text";
import type { Review } from "@/server/import/review";
import { discardRecipe, rereadWithPage, submitReview } from "../../actions";

/** Suggestions for what a recipe makes when it does not count persons. Any text is allowed. */
const SERVINGS_UNITS = [
  "Springform",
  "Blech",
  "Kastenform",
  "Tarteform",
  "Quicheform",
  "Stück",
  "Muffins",
  "Brot",
  "Gläser",
];

interface Props {
  review: Review;
  /** How many recipes wait for review, this one included. */
  waiting: number;
  ingredientNames: string[];
  /** Normalised names and synonyms of the catalog, to tell at once whether a name is known. */
  knownNames: string[];
  units: string[];
}

export function ReviewForm({ review, waiting, ingredientNames, knownNames, units }: Props) {
  const [title, setTitle] = useState(review.hasTitle ? review.title : "");
  const [sourceBook, setSourceBook] = useState(review.sourceBook);
  const [sourcePage, setSourcePage] = useState(review.sourcePage?.toString() ?? "");
  const [servingsMin, setServingsMin] = useState(review.servingsMin?.toString() ?? "");
  const [servingsMax, setServingsMax] = useState(
    review.servingsMax !== null && review.servingsMax !== review.servingsMin
      ? review.servingsMax.toString()
      : "",
  );
  const [servingsUnit, setServingsUnit] = useState(review.servingsUnit);
  const [prepMinutes, setPrepMinutes] = useState(review.prepMinutes?.toString() ?? "");
  const [rows, setRows] = useState(() => toRows(review.lines));
  const [steps, setSteps] = useState(() => typedSteps(review.steps));
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const general = review.issues.filter((issue) => issue.ingredientIndex === null);
  const issuesAt = (readAt: number | null) =>
    readAt === null ? [] : review.issues.filter((issue) => issue.ingredientIndex === readAt);

  function submit() {
    const input: ReviewInput = {
      title,
      sourceBook,
      sourcePage,
      servingsMin,
      servingsMax,
      servingsUnit,
      prepMinutes,
      lines: rowsToLines(rows),
      steps,
    };
    setMessage(null);
    startTransition(async () => {
      const result = await submitReview(review.jobId, review.batchId, input);
      setErrors(result.errors);
      setMessage("Bitte sieh dir die markierten Felder noch einmal an.");
    });
  }

  function reread(side: "before" | "after") {
    setMessage(null);
    startTransition(async () => {
      const result = await rereadWithPage(review.jobId, review.batchId, side);
      setMessage(result.error);
    });
  }

  function discard() {
    if (!window.confirm("Dieses Foto ist kein Rezept und soll nicht übernommen werden?")) return;
    startTransition(() => discardRecipe(review.jobId, review.batchId));
  }

  const field = (name: string) => `field ${errors[name] ? "field-problem" : ""}`;
  const problem = (name: string) =>
    errors[name] && <p className="mt-1 text-sm font-semibold text-warn">{errors[name]}</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Rezept prüfen</h1>
        <p className="text-muted">
          {waiting === 1 ? "Das letzte in der Liste" : `Noch ${waiting} in der Liste`} ·{" "}
          <Link href={`/import/${review.batchId}`} className="font-semibold text-accent">
            zum Stapel
          </Link>
        </p>
      </div>

      {general.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-warn-soft px-4 py-3 text-warn">
          {general.map((issue, i) => (
            <li key={i} className="font-semibold">
              {issueText(issue)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section
          aria-label="Fotos"
          className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
        >
          {review.photoUrls.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block"
              title="In voller Größe öffnen"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
              <img
                src={url}
                alt={`Foto ${i + 1} des Rezepts`}
                className="w-full rounded-lg border border-line"
              />
            </a>
          ))}
          <div className="flex flex-wrap gap-2">
            {review.neighbours.before && (
              <button
                type="button"
                className="btn min-h-11 px-3 text-sm"
                disabled={pending}
                onClick={() => reread("before")}
              >
                Seite davor gehört dazu
              </button>
            )}
            {review.neighbours.after && (
              <button
                type="button"
                className="btn min-h-11 px-3 text-sm"
                disabled={pending}
                onClick={() => reread("after")}
              >
                Seite danach gehört dazu
              </button>
            )}
          </div>
        </section>

        <section aria-label="Angaben" className="space-y-4">
          <div>
            <label className="label" htmlFor="title">
              Titel
            </label>
            <input
              id="title"
              className={`${field("title")} ${!review.hasTitle && title === "" ? "field-problem" : ""}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Wie heißt das Rezept?"
            />
            {problem("title")}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label" htmlFor="book">
                Kochbuch
              </label>
              <input
                id="book"
                className="field"
                value={sourceBook}
                onChange={(event) => setSourceBook(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="page">
                Seite
              </label>
              <input
                id="page"
                className={field("sourcePage")}
                inputMode="numeric"
                value={sourcePage}
                onChange={(event) => setSourcePage(event.target.value)}
              />
            </div>
          </div>
          {problem("sourcePage")}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className="label" htmlFor="servings-min">
                Reicht für
              </label>
              <input
                id="servings-min"
                className={field("servingsMin")}
                inputMode="decimal"
                value={servingsMin}
                onChange={(event) => setServingsMin(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="servings-max">
                bis (optional)
              </label>
              <input
                id="servings-max"
                className={field("servingsMax")}
                inputMode="decimal"
                value={servingsMax}
                onChange={(event) => setServingsMax(event.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="servings-unit">
                statt Personen
              </label>
              <input
                id="servings-unit"
                className={field("servingsUnit")}
                list="servings-units"
                value={servingsUnit}
                onChange={(event) => setServingsUnit(event.target.value)}
                placeholder="z. B. Springform"
              />
              <datalist id="servings-units">
                {SERVINGS_UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="prep">
                Minuten
              </label>
              <input
                id="prep"
                className={field("prepMinutes")}
                inputMode="numeric"
                value={prepMinutes}
                onChange={(event) => setPrepMinutes(event.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-muted">
            „statt Personen“ bleibt leer, wenn das Rezept für Personen gedacht ist. Bei Kuchen,
            Quiche oder Pizza steht dort, was das Rezept ergibt: 1 Springform, 1 Blech, 12 Stück.
            Bei Getränken die Menge in Liter: 2,25 und Liter.
          </p>
          {problem("servingsMin")}
          {problem("servingsMax")}
          {problem("servingsUnit")}
          {problem("prepMinutes")}

          <h2 className="pt-2 text-lg font-semibold">Zutaten</h2>
          <IngredientRows
            rows={rows}
            setRows={setRows}
            units={units}
            ingredientNames={ingredientNames}
            knownNames={knownNames}
            errors={errors}
            issuesAt={issuesAt}
          />

          <h2 className="pt-2 text-lg font-semibold">Arbeitsschritte</h2>
          <StepsField value={steps} onChange={setSteps} error={errors.steps} />

          {review.notes.length > 0 && (
            <details className="card p-3">
              <summary className="cursor-pointer font-semibold">
                Hinweise vom Einlesen ({review.notes.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {review.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </details>
          )}

          {message && (
            <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 font-semibold text-warn">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={pending}
              onClick={submit}
            >
              {pending ? "Speichere …" : "Stimmt so, übernehmen"}
            </button>
            <button type="button" className="btn btn-danger" disabled={pending} onClick={discard}>
              Kein Rezept
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
