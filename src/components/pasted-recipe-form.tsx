"use client";

import Link from "next/link";
import { useActionState } from "react";
import { readPastedRecipe, type PastedState } from "@/app/(app)/rezepte/actions";
import type { Category } from "@/domain/library/summary";
import { TypedRecipeForm } from "./typed-recipe-form";

interface Props {
  categories: Category[];
  /** Hidden fields that travel with the recipe form, such as the meal the recipe is for. */
  extra: Record<string, string>;
  submitLabel: string;
  /** The address of this page, to start over with another text. */
  again: string;
}

const none: PastedState = { read: null, text: "", error: null };

/**
 * A recipe from pasted text, in two steps: the text is read, then the form for a new recipe
 * shows what was read, to be checked and saved.
 */
export function PastedRecipeForm({ categories, extra, submitLabel, again }: Props) {
  const [state, action, pending] = useActionState(readPastedRecipe, none);

  if (state.read) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-accent-soft px-4 py-3">
          <p className="font-semibold">Eingelesen. Stimmt alles?</p>
          {state.read.check.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {state.read.check.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <Link href={again} className="link mt-1 inline-flex min-h-11 items-center text-sm">
            Anderen Text einfügen
          </Link>
        </div>
        <TypedRecipeForm
          initial={state.read.values}
          categories={categories}
          extra={{ ...extra, sourceText: state.text }}
          submitLabel={submitLabel}
        />
        <details className="group card">
          <summary className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 font-semibold">
            Eingefügter Text
            <span className="text-sm font-semibold text-accent">
              <span className="group-open:hidden">Ansehen</span>
              <span className="hidden group-open:inline">Ausblenden</span>
            </span>
          </summary>
          <p className="border-t border-line p-4 text-sm whitespace-pre-wrap">{state.text}</p>
        </details>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="text">
        Text des Rezepts
      </label>
      <textarea
        id="text"
        name="text"
        rows={14}
        defaultValue={state.text}
        className={`field ${state.error ? "field-problem" : ""}`}
        placeholder="Hier einfügen: Titel, Zutaten und Zubereitung, so wie sie auf der Webseite oder in der Nachricht stehen."
      />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-warn">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary" disabled={pending} aria-busy={pending}>
        {pending ? "Wird eingelesen …" : "Einlesen"}
      </button>
      <p className="text-sm text-muted">
        Gespeichert wird erst im nächsten Schritt. Der Text bleibt beim Rezept, damit die
        Zubereitung nicht verloren geht.
      </p>
    </form>
  );
}
