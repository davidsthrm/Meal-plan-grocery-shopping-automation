"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { normalizeName } from "@/domain/catalog";
import type { ReviewErrors, ReviewInput } from "@/domain/import/review-input";
import { quantityText } from "@/domain/quantity";
import { issueText } from "@/lib/issue-text";
import type { Review, ReviewLine } from "@/server/import/review";
import { discardRecipe, rereadWithPage, submitReview } from "../../actions";

interface Row {
  /** Stable while the form is open, so rows keep their identity when one is removed. */
  key: string;
  quantity: string;
  quantityMax: string;
  unit: string;
  ingredient: string;
  note: string;
  optional: boolean;
  approximate: boolean;
  alternativeToKey: string | null;
  originalText: string;
  secondary: ReviewLine["secondary"];
  /** Position in the recipe as it was read, to show that line's issues. Null for new rows. */
  readAt: number | null;
}

let counter = 0;
const newKey = () => `row-${++counter}`;

function toRows(lines: ReviewLine[]): Row[] {
  const keys = lines.map(() => newKey());
  return lines.map((line, at) => ({
    key: keys[at],
    quantity: quantityText(line.quantity),
    quantityMax: quantityText(line.quantityMax),
    unit: line.unit ?? "",
    ingredient: line.ingredient,
    note: line.note,
    optional: line.optional,
    approximate: line.approximate,
    alternativeToKey: line.alternativeTo !== null ? (keys[line.alternativeTo] ?? null) : null,
    originalText: line.originalText,
    secondary: line.secondary,
    readAt: at,
  }));
}

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
  const [prepMinutes, setPrepMinutes] = useState(review.prepMinutes?.toString() ?? "");
  const [rows, setRows] = useState(() => toRows(review.lines));
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const known = useMemo(() => new Set(knownNames), [knownNames]);

  const general = review.issues.filter((issue) => issue.ingredientIndex === null);
  const issuesAt = (readAt: number | null) =>
    readAt === null ? [] : review.issues.filter((issue) => issue.ingredientIndex === readAt);

  const change = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: string) =>
    setRows((current) =>
      current
        .filter((row) => row.key !== key)
        .map((row) => (row.alternativeToKey === key ? { ...row, alternativeToKey: null } : row)),
    );
  const add = () =>
    setRows((current) => [
      ...current,
      {
        key: newKey(),
        quantity: "",
        quantityMax: "",
        unit: "",
        ingredient: "",
        note: "",
        optional: false,
        approximate: false,
        alternativeToKey: null,
        originalText: "",
        secondary: null,
        readAt: null,
      },
    ]);

  function submit() {
    const input: ReviewInput = {
      title,
      sourceBook,
      sourcePage,
      servingsMin,
      servingsMax,
      prepMinutes,
      lines: rows.map((row) => {
        const target = rows.findIndex((other) => other.key === row.alternativeToKey);
        return {
          quantity: row.quantity,
          quantityMax: row.quantityMax,
          unit: row.unit,
          ingredient: row.ingredient,
          note: row.note,
          optional: row.optional,
          approximate: row.approximate,
          alternativeTo: target === -1 ? null : target,
          originalText: row.originalText,
          secondary: row.secondary,
        };
      }),
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
                className="btn min-h-10 px-3 text-sm"
                disabled={pending}
                onClick={() => reread("before")}
              >
                Seite davor gehört dazu
              </button>
            )}
            {review.neighbours.after && (
              <button
                type="button"
                className="btn min-h-10 px-3 text-sm"
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="servings-min">
                Portionen
              </label>
              <input
                id="servings-min"
                className={field("servingsMin")}
                inputMode="numeric"
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
                inputMode="numeric"
                value={servingsMax}
                onChange={(event) => setServingsMax(event.target.value)}
              />
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
          {problem("servingsMin")}
          {problem("servingsMax")}
          {problem("prepMinutes")}

          <h2 className="pt-2 text-lg font-semibold">Zutaten</h2>
          {problem("lines")}
          <datalist id="catalog-ingredients">
            {ingredientNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <ol className="space-y-3">
            {rows.map((row, at) => {
              const lineIssues = issuesAt(row.readAt).filter(
                (issue) => issue.code !== "unmapped_ingredient",
              );
              const error = errors[`line ${at}`];
              const isKnown = known.has(normalizeName(row.ingredient));
              const flagged = Boolean(error) || lineIssues.length > 0;
              return (
                <li key={row.key} className={`card p-3 ${flagged ? "border-warn" : ""}`}>
                  {row.originalText && (
                    <p className="mb-2 text-sm text-muted">
                      Gedruckt: <span className="text-ink">{row.originalText}</span>
                    </p>
                  )}
                  <div className="grid grid-cols-[4.5rem_4rem_1fr] gap-2 sm:grid-cols-[4.5rem_4rem_6.5rem_1fr]">
                    <input
                      aria-label="Menge"
                      placeholder="Menge"
                      className="field px-2"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(event) => change(row.key, { quantity: event.target.value })}
                    />
                    <input
                      aria-label="Menge bis"
                      placeholder="bis"
                      className="field px-2"
                      inputMode="decimal"
                      value={row.quantityMax}
                      onChange={(event) => change(row.key, { quantityMax: event.target.value })}
                    />
                    <select
                      aria-label="Einheit"
                      className="field px-2"
                      value={row.unit}
                      onChange={(event) => change(row.key, { unit: event.target.value })}
                    >
                      <option value="">ohne</option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Zutat"
                      placeholder="Zutat"
                      list="catalog-ingredients"
                      className="field col-span-3 sm:col-span-1"
                      value={row.ingredient}
                      onChange={(event) => change(row.key, { ingredient: event.target.value })}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <input
                      aria-label="Notiz"
                      placeholder="Notiz, z. B. gehackt"
                      className="field min-w-40 flex-1 text-base"
                      value={row.note}
                      onChange={(event) => change(row.key, { note: event.target.value })}
                    />
                    <label className="flex min-h-10 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-accent"
                        checked={row.optional}
                        onChange={(event) => change(row.key, { optional: event.target.checked })}
                      />
                      kann man weglassen
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger min-h-10 px-3 text-sm"
                      aria-label={`Zeile ${row.ingredient || at + 1} entfernen`}
                      onClick={() => remove(row.key)}
                    >
                      Entfernen
                    </button>
                  </div>
                  {row.alternativeToKey && (
                    <p className="mt-2 text-sm text-muted">
                      Alternative zu einer anderen Zutat dieses Rezepts.
                    </p>
                  )}
                  {row.ingredient.trim() !== "" && !isKnown && (
                    <p className="mt-2 text-sm text-muted">
                      Steht noch nicht im Katalog. Wird als neue Zutat vorgeschlagen, oder wähle
                      eine vorhandene aus der Liste.
                    </p>
                  )}
                  {lineIssues.map((issue, i) => (
                    <p key={i} className="mt-2 text-sm font-semibold text-warn">
                      {issueText(issue)}
                    </p>
                  ))}
                  {error && <p className="mt-2 text-sm font-semibold text-warn">{error}</p>}
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn" onClick={add}>
            Zutat hinzufügen
          </button>

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
