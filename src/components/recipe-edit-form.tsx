"use client";

import { useState, useTransition } from "react";
import { saveRecipeEdit } from "@/app/(app)/rezepte/actions";
import type { ReviewErrors } from "@/domain/import/review-input";
import type { Category } from "@/domain/library/summary";
import { suggestTags } from "@/domain/library/tag-admin";
import { toggleTag, type TagGroup } from "@/domain/library/tags";
import type { RecipeFormData } from "@/server/recipes";
import { typedSteps } from "@/domain/import/steps";
import { IngredientRows, rowsToLines, toRows } from "./ingredient-rows";
import { StepsField } from "./steps-field";

const PROTEINS = [
  { value: "", label: "keine Angabe" },
  { value: "vegetarian", label: "Vegetarisch" },
  { value: "vegan", label: "Vegan" },
  { value: "fish", label: "Fisch" },
  { value: "poultry", label: "Geflügel" },
  { value: "red_meat", label: "Fleisch" },
];

interface Props {
  recipeId: string;
  recipe: RecipeFormData;
  categories: Category[];
  /** The tags a recipe can be described by, in their groups. */
  tagGroups: TagGroup[];
  units: string[];
  ingredientNames: string[];
  /** Normalised names and synonyms of the catalog, to tell at once whether a name is known. */
  knownNames: string[];
}

/** Changes a recipe: what stands above its ingredients, and every ingredient line. */
export function RecipeEditForm({
  recipeId,
  recipe,
  categories,
  tagGroups,
  units,
  ingredientNames,
  knownNames,
}: Props) {
  const allTags = tagGroups.flatMap((group) => group.tags);
  const [tags, setTags] = useState(recipe.tags);
  const [ownTags, setOwnTags] = useState("");
  // Several new tags are separated by commas; the last one is the one being typed.
  const offered = suggestTags(ownTags.split(",").at(-1) ?? "", allTags);
  const [title, setTitle] = useState(recipe.title);
  const [category, setCategory] = useState(recipe.category);
  const [protein, setProtein] = useState(recipe.protein);
  const [sourceBook, setSourceBook] = useState(recipe.sourceBook);
  const [sourcePage, setSourcePage] = useState(recipe.sourcePage?.toString() ?? "");
  const [servingsMin, setServingsMin] = useState(recipe.servingsMin?.toString() ?? "");
  const [servingsMax, setServingsMax] = useState(
    recipe.servingsMax !== null && recipe.servingsMax !== recipe.servingsMin
      ? recipe.servingsMax.toString()
      : "",
  );
  const [servingsUnit, setServingsUnit] = useState(recipe.servingsUnit);
  const [prepMinutes, setPrepMinutes] = useState(recipe.prepMinutes?.toString() ?? "");
  const [rows, setRows] = useState(() => toRows(recipe.lines));
  const [steps, setSteps] = useState(() => typedSteps(recipe.steps));
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveRecipeEdit(
        recipeId,
        {
          title,
          sourceBook,
          sourcePage,
          servingsMin,
          servingsMax,
          servingsUnit,
          prepMinutes,
          lines: rowsToLines(rows),
          steps,
        },
        { category, protein, tags, ownTags },
      );
      setErrors(result.errors);
    });
  }

  const field = (name: string) => `field ${errors[name] ? "field-problem" : ""}`;
  const problem = (name: string) =>
    errors[name] && <p className="mt-1 text-sm font-semibold text-warn">{errors[name]}</p>;
  const failed = Object.keys(errors).length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="title">
          Titel
        </label>
        <input
          id="title"
          className={field("title")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
        />
        {problem("title")}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">
            Art
          </label>
          <select
            id="category"
            className="field"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">keine Angabe</option>
            {categories.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="protein">
            Zählt in der Woche als
          </label>
          <select
            id="protein"
            className="field"
            value={protein}
            onChange={(event) => setProtein(event.target.value)}
          >
            {PROTEINS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
            value={servingsUnit}
            onChange={(event) => setServingsUnit(event.target.value)}
            placeholder="z. B. Springform, Blech, Stück"
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
      {problem("servingsUnit")}
      {problem("prepMinutes")}

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

      <section aria-label="Stichworte" className="card space-y-3 p-4">
        <h2 className="text-xl font-bold tracking-tight">Stichworte</h2>
        <p className="text-sm text-muted">
          Danach lässt sich das Kochbuch durchstöbern, und der Wochenplan schlägt unter der Woche
          nichts vor, das Zeit braucht.
        </p>
        {tagGroups.map((group) => (
          <div key={group.name} role="group" aria-label={group.name}>
            <p className="eyebrow mb-1.5">{group.name}</p>
            <div className="flex flex-wrap gap-2">
              {group.tags.map((tag) => {
                const on = tags.includes(tag.ref);
                return (
                  <button
                    key={tag.ref}
                    type="button"
                    className={`chip ${on ? "chip-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => setTags(toggleTag(tags, tag, allTags))}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <label className="label" htmlFor="own-tags">
            Eigenes Stichwort
          </label>
          <input
            id="own-tags"
            className="field"
            value={ownTags}
            onChange={(event) => setOwnTags(event.target.value)}
            maxLength={120}
            placeholder="z. B. Omas Rezept, Kindergeburtstag"
            autoComplete="off"
          />
          {/* The tags there are come first: "Oma Rezept" next to "Omas Rezept" helps nobody. */}
          {offered.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
              <span className="text-sm text-muted">Gibt es schon:</span>
              {offered.map((tag) => (
                <button
                  key={tag.ref}
                  type="button"
                  className="chip min-h-11 px-3 text-sm"
                  onClick={() => {
                    if (!tags.includes(tag.ref)) setTags(toggleTag(tags, tag, allTags));
                    setOwnTags(ownTags.split(",").slice(0, -1).join(","));
                  }}
                >
                  {tag.name}
                  <span className="font-normal text-muted">{tag.group}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      {problem("sourcePage")}

      <h2 className="pt-2 text-xl font-bold tracking-tight">Zutaten</h2>
      <IngredientRows
        rows={rows}
        setRows={setRows}
        units={units}
        ingredientNames={ingredientNames}
        knownNames={knownNames}
        errors={errors}
      />

      <h2 className="pt-2 text-xl font-bold tracking-tight">Arbeitsschritte</h2>
      <StepsField
        value={steps}
        onChange={setSteps}
        error={errors.steps}
        doubts={recipe.stepDoubts}
      />

      {failed && (
        <p role="status" className="rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn">
          Noch nicht gespeichert. Bitte sieh dir die markierten Felder an.
        </p>
      )}
      <div className="sticky bottom-20 flex gap-2 sm:bottom-4">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </div>
  );
}
