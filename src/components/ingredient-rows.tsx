"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { normalizeName } from "@/domain/catalog";
import type { ImportIssue } from "@/domain/import/checks";
import type { ReviewErrors, ReviewLineInput } from "@/domain/import/review-input";
import { quantityText } from "@/domain/quantity";
import { issueText } from "@/lib/issue-text";
import type { ReviewLine } from "@/server/import/review";

/**
 * The ingredient lines of a recipe as a form: one row per line, to correct, remove or add.
 * Used where an imported recipe is reviewed and where any recipe is changed by hand.
 */

export interface IngredientRow {
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

export function toRows(lines: ReviewLine[]): IngredientRow[] {
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

/** The rows as they are sent: everything as typed, and "alternative to" as a position. */
export function rowsToLines(all: IngredientRow[]): ReviewLineInput[] {
  // A row that was added and left empty is no line.
  const rows = all.filter((row) =>
    [row.quantity, row.quantityMax, row.ingredient, row.note].some((v) => v.trim() !== ""),
  );
  return rows.map((row) => {
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
  });
}

interface Props {
  rows: IngredientRow[];
  setRows: Dispatch<SetStateAction<IngredientRow[]>>;
  units: string[];
  ingredientNames: string[];
  /** Normalised names and synonyms of the catalog, to tell at once whether a name is known. */
  knownNames: string[];
  /** Messages from the server, by "line <position>" and "lines". */
  errors: ReviewErrors;
  /** What the import found doubtful about a line as it was read. */
  issuesAt?: (readAt: number | null) => ImportIssue[];
}

export function IngredientRows({
  rows,
  setRows,
  units,
  ingredientNames,
  knownNames,
  errors,
  issuesAt,
}: Props) {
  const known = useMemo(() => new Set(knownNames), [knownNames]);
  const change = (key: string, patch: Partial<IngredientRow>) =>
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

  return (
    <>
      {errors.lines && <p className="mt-1 text-sm font-semibold text-warn">{errors.lines}</p>}
      <datalist id="catalog-ingredients">
        {ingredientNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <ol className="space-y-3">
        {rows.map((row, at) => {
          const lineIssues = (issuesAt?.(row.readAt) ?? []).filter(
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
                <label className="flex min-h-11 items-center gap-2">
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
                  className="btn btn-danger min-h-11 px-3 text-sm"
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
                  Steht noch nicht im Katalog. Wird als neue Zutat vorgeschlagen, oder wähle eine
                  vorhandene aus der Liste.
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
    </>
  );
}
