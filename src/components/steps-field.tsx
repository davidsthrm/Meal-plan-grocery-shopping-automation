"use client";

interface Props {
  /** The steps, one per line. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** What was not read with certainty, shown above the field so it can be corrected. */
  doubts?: string[];
}

/**
 * The preparation steps ("Arbeitsschritte") as one field: a step per line, as on the recipe page. Shared by the
 * review of an import and the form that changes a recipe.
 */
export function StepsField({ value, onChange, error, doubts = [] }: Props) {
  const lines = value === "" ? 0 : value.split("\n").length;
  return (
    <div>
      <label className="label" htmlFor="steps">
        Arbeitsschritte, einer pro Zeile
      </label>
      {doubts.length > 0 && (
        <ul className="mb-2 list-disc space-y-0.5 rounded-lg bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">
          {doubts.map((doubt) => (
            <li key={doubt}>{doubt}</li>
          ))}
        </ul>
      )}
      <textarea
        id="steps"
        className={`field leading-relaxed ${error ? "field-problem" : ""}`}
        rows={Math.min(16, Math.max(5, lines * 2 + 1))}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={"Nudeln in Salzwasser garen.\nSoße anrühren und abschmecken."}
      />
      {error && <p className="mt-1 text-sm font-semibold text-warn">{error}</p>}
    </div>
  );
}
