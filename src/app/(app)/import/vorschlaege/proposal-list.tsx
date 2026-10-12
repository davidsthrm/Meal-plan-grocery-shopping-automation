"use client";

import { useMemo, useState, useTransition } from "react";
import { normalizeName } from "@/domain/catalog";
import type { OpenProposal, ProposalDecision } from "@/server/import/proposals";
import { submitProposalDecisions } from "../actions";

interface Option {
  id: string;
  name: string;
}

interface Props {
  proposals: OpenProposal[];
  /** Names of all catalog ingredients, for choosing "same as". */
  ingredients: Option[];
  aisleGroups: Option[];
}

type Row = Omit<ProposalDecision, "id">;

const CHOICES: { value: Row["decision"]; label: string }[] = [
  { value: "new", label: "Neue Zutat" },
  { value: "same", label: "Dasselbe wie …" },
  { value: "reject", label: "Nicht in den Katalog" },
  { value: "later", label: "Später entscheiden" },
];

/**
 * All unknown ingredients in one list, each with the suggested decision already set. The
 * household scans it, changes what is wrong and confirms everything with one button.
 */
export function ProposalList({ proposals, ingredients, aisleGroups }: Props) {
  const nameOf = useMemo(() => new Map(ingredients.map((i) => [i.id, i.name])), [ingredients]);
  const known = useMemo(
    () => new Set(ingredients.map((i) => normalizeName(i.name))),
    [ingredients],
  );
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      proposals.map((p) => [
        p.id,
        {
          decision: p.sameAsIngredientId ? "same" : "new",
          sameAs: p.sameAsIngredientId ? (nameOf.get(p.sameAsIngredientId) ?? "") : "",
          aisleGroupId: p.aisleGroupId,
        },
      ]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const change = (id: string, patch: Partial<Row>) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const decided = proposals.filter((p) => rows[p.id]?.decision !== "later");
  const submit = () =>
    startTransition(async () => {
      const result = await submitProposalDecisions(
        decided.map((p) => ({ id: p.id, ...rows[p.id] })),
      );
      setErrors(result.errors);
    });

  // What was recognised as another name comes first: a wrong match there would quietly put
  // the wrong product on shopping lists, so it deserves the closer look.
  const sections = [
    {
      title: "Als vorhandene Zutat erkannt",
      hint: "Bitte kurz prüfen, ob wirklich dasselbe gemeint ist.",
      list: proposals.filter((p) => p.sameAsIngredientId),
    },
    {
      title: "Neu im Katalog",
      hint: "Das Regal ist ein Vorschlag. Alles Weitere lässt sich später ändern.",
      list: proposals.filter((p) => !p.sameAsIngredientId),
    },
  ].filter((section) => section.list.length > 0);

  return (
    <>
      <datalist id="catalog-ingredients">
        {ingredients.map((ingredient) => (
          <option key={ingredient.id} value={ingredient.name} />
        ))}
      </datalist>

      {sections.map((section) => (
        <section key={section.title} className="mt-6">
          <h2 className="text-lg font-semibold">
            {section.title} <span className="font-normal text-muted">({section.list.length})</span>
          </h2>
          <p className="mb-2 text-sm text-muted">{section.hint}</p>
          <ul className="card divide-y divide-line">
            {section.list.map((proposal) => {
              const row = rows[proposal.id];
              const unknownTarget =
                row.decision === "same" && !known.has(normalizeName(row.sameAs));
              return (
                <li key={proposal.id} className="p-3">
                  <div className="grid items-center gap-2 sm:grid-cols-[1fr_11rem_1fr]">
                    <div className="min-w-0">
                      <p className="font-semibold">{proposal.name}</p>
                      {proposal.recipeTitles.length > 0 && (
                        <p className="truncate text-sm text-muted">
                          {proposal.recipeTitles.slice(0, 2).join(", ")}
                          {proposal.recipeTitles.length > 2 &&
                            ` +${proposal.recipeTitles.length - 2}`}
                        </p>
                      )}
                    </div>
                    <select
                      aria-label={`Entscheidung für ${proposal.name}`}
                      className="field px-2"
                      value={row.decision}
                      onChange={(event) =>
                        change(proposal.id, { decision: event.target.value as Row["decision"] })
                      }
                    >
                      {CHOICES.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                    {row.decision === "same" && (
                      <input
                        aria-label={`${proposal.name} ist dasselbe wie`}
                        list="catalog-ingredients"
                        placeholder="Zutat aus dem Katalog"
                        className={`field ${unknownTarget ? "field-problem" : ""}`}
                        value={row.sameAs}
                        onChange={(event) => change(proposal.id, { sameAs: event.target.value })}
                      />
                    )}
                    {row.decision === "new" && (
                      <select
                        aria-label={`Regal für ${proposal.name}`}
                        className="field px-2"
                        value={row.aisleGroupId}
                        onChange={(event) =>
                          change(proposal.id, { aisleGroupId: event.target.value })
                        }
                      >
                        {aisleGroups.map((aisle) => (
                          <option key={aisle.id} value={aisle.id}>
                            {aisle.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {errors[proposal.id] && (
                    <p className="mt-2 text-sm font-semibold text-warn">{errors[proposal.id]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-16 z-10 mt-6 rounded-lg border border-line bg-surface p-3 sm:bottom-4">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={pending || decided.length === 0}
          onClick={submit}
        >
          {pending
            ? "Speichere …"
            : decided.length === 1
              ? "1 Entscheidung übernehmen"
              : `Alle ${decided.length} Entscheidungen übernehmen`}
        </button>
      </div>
    </>
  );
}
