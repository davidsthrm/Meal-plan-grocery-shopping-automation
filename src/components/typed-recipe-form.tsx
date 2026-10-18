"use client";

import { useActionState } from "react";
import type { Category } from "@/domain/library/summary";
import type { TypedRecipeInput } from "@/domain/library/typed-recipe";
import { saveTypedRecipe, type TypedRecipeState } from "@/app/(app)/rezepte/actions";

const PROTEINS = [
  { value: "", label: "keine Angabe" },
  { value: "vegetarian", label: "Vegetarisch" },
  { value: "vegan", label: "Vegan" },
  { value: "fish", label: "Fisch" },
  { value: "poultry", label: "Geflügel" },
  { value: "red_meat", label: "Fleisch" },
];

interface Props {
  /** What the form starts with. `lines` null leaves the ingredients out of the form. */
  initial: TypedRecipeInput;
  categories: Category[];
  /** Hidden fields that travel with the form, such as the meal a new recipe is for. */
  extra?: Record<string, string>;
  submitLabel: string;
}

const none: TypedRecipeState = { errors: {}, values: null };

/** The form for a new recipe typed in by hand: quick, one ingredient per line. */
export function TypedRecipeForm({ initial, categories, extra = {}, submitLabel }: Props) {
  const [state, action, pending] = useActionState(saveTypedRecipe, none);
  const values = state.values ?? initial;
  const { errors } = state;
  const field = (name: keyof TypedRecipeInput) => `field ${errors[name] ? "field-problem" : ""}`;
  const problem = (name: keyof TypedRecipeInput) =>
    errors[name] && (
      <p role="alert" className="mt-1 text-sm font-semibold text-warn">
        {errors[name]}
      </p>
    );

  return (
    <form action={action} className="space-y-4">
      {Object.entries(extra).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div>
        <label className="label" htmlFor="title">
          Titel
        </label>
        <input
          id="title"
          name="title"
          className={field("title")}
          defaultValue={values.title}
          placeholder="z. B. Pestonudeln"
          maxLength={120}
        />
        {problem("title")}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">
            Art
          </label>
          <select id="category" name="category" className="field" defaultValue={values.category}>
            <option value="">keine Angabe</option>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="protein">
            Zählt in der Woche als
          </label>
          <select id="protein" name="protein" className="field" defaultValue={values.protein}>
            {PROTEINS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="servings">
            Reicht für
          </label>
          <input
            id="servings"
            name="servings"
            className={field("servings")}
            inputMode="numeric"
            defaultValue={values.servings}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="servingsUnit">
            statt Personen
          </label>
          <input
            id="servingsUnit"
            name="servingsUnit"
            className={field("servingsUnit")}
            defaultValue={values.servingsUnit}
            placeholder="z. B. Springform, Blech, Stück"
          />
        </div>
        <div>
          <label className="label" htmlFor="minutes">
            Minuten
          </label>
          <input
            id="minutes"
            name="minutes"
            className={field("minutes")}
            inputMode="numeric"
            defaultValue={values.minutes}
          />
        </div>
      </div>
      {problem("servings")}
      {problem("servingsUnit")}
      {problem("minutes")}

      {values.lines !== null && (
        <div>
          <label className="label" htmlFor="lines">
            Zutaten, eine pro Zeile
          </label>
          <textarea
            id="lines"
            name="lines"
            rows={8}
            className={`${field("lines")} leading-relaxed`}
            defaultValue={values.lines}
            placeholder={"500 g Spaghetti\n1 Glas Pesto\nParmesan"}
          />
          {problem("lines")}
        </div>
      )}

      <div>
        <label className="label" htmlFor="steps">
          Arbeitsschritte, einer pro Zeile (optional)
        </label>
        <textarea
          id="steps"
          name="steps"
          rows={values.steps === "" ? 4 : 10}
          className={`${field("steps")} leading-relaxed`}
          defaultValue={values.steps}
          placeholder={"Nudeln in Salzwasser garen.\nMit dem Pesto mischen."}
        />
        {problem("steps")}
      </div>

      <details className="group" open={values.book !== "" || values.page !== ""}>
        <summary className="link inline-flex min-h-10 items-center">
          Aus einem Kochbuch oder Heft?
        </summary>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="book">
              Kochbuch oder Heft
            </label>
            {/* A magazine with its edition: the app keeps every edition in one stack. */}
            <input
              id="book"
              name="book"
              className="field"
              defaultValue={values.book}
              placeholder="z. B. Einfach Hausgemacht 06/2020"
            />
          </div>
          <div>
            <label className="label" htmlFor="page">
              Seite
            </label>
            <input
              id="page"
              name="page"
              className={field("page")}
              inputMode="numeric"
              defaultValue={values.page}
            />
          </div>
        </div>
        {problem("page")}
      </details>

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Speichert …" : submitLabel}
      </button>
    </form>
  );
}
