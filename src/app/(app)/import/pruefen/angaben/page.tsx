import type { Metadata } from "next";
import { sourceLabel } from "@/domain/library/source";
import Link from "next/link";
import { RecipeBadge, RecipeFacts } from "@/components/recipe-card";
import {
  CHECKED_FIELDS,
  commonServingsUnits,
  PROTEIN_NAME,
  servingsChoices,
  servingsChoiceText,
  suggestionText,
  type CheckedField,
  type Finding,
  type RecipeCheck,
} from "@/domain/library/quality";
import type { Category, ProteinType, RecipeSummary } from "@/domain/library/summary";
import { EFFORT_NAME, EFFORTS } from "@/domain/library/tags";
import { fromFieldChecks } from "@/lib/origin";
import { sourceText } from "@/lib/recipe-text";
import { requireHousehold } from "@/server/auth";
import { categoryNamer, loadLibraryChecks, recipeChecks } from "@/server/quality";
import { createSessionClient } from "@/server/supabase/server";
import { confirmField, correctField, correctSeveral } from "../actions";

export const metadata: Metadata = { title: "Angaben prüfen" };

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const FIELD_NAME: Record<CheckedField, string> = {
  protein: "Art",
  category: "Kategorie",
  time: "Zeit",
  servings: "Portionen",
};

/** How many recipes are shown at first, and how many more each time. */
const PAGE = 30;

const PROTEIN_CHOICES = (Object.keys(PROTEIN_NAME) as ProteinType[]).filter(
  (type) => type !== "none",
);

/**
 * The fields the import assigned that do not fit the rest of a recipe: its kind, category,
 * time and servings. The least trustworthy recipes come first. Each finding can be taken as
 * suggested, set by hand or confirmed; several recipes can be changed at once.
 */
export default async function FieldChecksPage(props: PageProps<"/import/pruefen/angaben">) {
  const params = await props.searchParams;
  const filter = CHECKED_FIELDS.find((field) => field === one(params.feld)) ?? null;
  const limit = Math.max(PAGE, Math.min(1000, Number(one(params.anzahl)) || PAGE));
  const failed = one(params.fehler);
  await requireHousehold();
  const library = await loadLibraryChecks(await createSessionClient());
  const all = recipeChecks(library);
  const categoryName = categoryNamer(library.categories);
  const servingsUnits = commonServingsUnits(
    [...library.recipes.values()].map((recipe) => recipe.summary.servings),
  );
  const counts = new Map(
    CHECKED_FIELDS.map((field) => [
      field,
      all.filter((check) => check.findings.some((finding) => finding.field === field)).length,
    ]),
  );
  const matching = filter
    ? all
        .filter((check) => check.findings.some((finding) => finding.field === filter))
        .map((check) => ({
          ...check,
          findings: check.findings.filter((finding) => finding.field === filter),
        }))
    : all;
  const shown = matching.slice(0, limit);
  const hrefFor = (field: CheckedField | null, more = 0) => {
    const query = new URLSearchParams({
      ...(field ? { feld: field } : {}),
      ...(more > 0 ? { anzahl: String(more) } : {}),
    }).toString();
    return `/import/pruefen/angaben${query ? `?${query}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/import" className="link text-sm">
        ← Import
      </Link>
      <h1 className="title mt-2">Angaben prüfen</h1>
      <p className="mt-1 text-muted">
        Art, Kategorie, Zeit und Portionen hat beim Einlesen das Modell eingetragen. Wie sicher es
        war, ist nicht gespeichert. Darum wird verglichen, was eingetragen ist, mit Zutaten und
        Titel: ein Fischrezept ohne Fisch, eine Suppe als Hauptgericht. Was am wenigsten passt,
        steht oben.
      </p>
      <p className="mt-2 text-muted">
        „Übernehmen“ und eine Auswahl ändern das Rezept. „Stimmt so“ ändert nichts: Der Hinweis
        verschwindet und kommt für diese Angabe nicht wieder.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Nach Angabe">
        <Link href={hrefFor(null)} className={`chip ${filter === null ? "chip-on" : ""}`}>
          Alle · {all.length}
        </Link>
        {CHECKED_FIELDS.map((field) => (
          <Link
            key={field}
            href={hrefFor(field)}
            className={`chip ${filter === field ? "chip-on" : ""}`}
          >
            {FIELD_NAME[field]} · {counts.get(field)}
          </Link>
        ))}
      </nav>

      {failed === "auswahl" && (
        <p className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-warn">
          Bitte zuerst Rezepte ankreuzen.
        </p>
      )}
      {failed !== "" && failed !== "auswahl" && (
        <p className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-warn">
          Das ließ sich nicht speichern. Portionen brauchen eine Zahl ab 1, „bis“ nicht kleiner als
          „von“; Minuten eine ganze Zahl.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="card mt-6 p-4">
          {filter
            ? `Bei „${FIELD_NAME[filter]}“ passt alles zusammen.`
            : "Alle Angaben passen zu Zutaten und Titel."}
        </p>
      ) : (
        <>
          <BulkForm
            filter={filter}
            shown={shown}
            categories={library.categories}
            total={matching.length}
          />
          <ul className="mt-4 space-y-3">
            {shown.map((check) => (
              <RecipeRow
                key={check.recipe.id}
                check={check}
                summary={library.recipes.get(check.recipe.id)?.summary}
                filter={filter}
                categories={library.categories}
                categoryName={categoryName}
                servingsUnits={servingsUnits}
              />
            ))}
          </ul>
          {matching.length > shown.length && (
            <Link href={hrefFor(filter, limit + PAGE)} className="btn mt-4 w-full">
              Weitere {Math.min(PAGE, matching.length - shown.length)} von{" "}
              {matching.length - shown.length} zeigen
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** One decision for the ticked recipes, or for all that are shown. */
function BulkForm({
  filter,
  shown,
  categories,
  total,
}: {
  filter: CheckedField | null;
  shown: RecipeCheck[];
  categories: Category[];
  total: number;
}) {
  return (
    <form id="sammel" action={correctSeveral} className="card mt-4 p-4">
      <input type="hidden" name="zurueck" value={filter ?? ""} />
      {shown.map((check) => (
        <input key={check.recipe.id} type="hidden" name="angezeigt" value={check.recipe.id} />
      ))}
      <label className="label" htmlFor="aktion">
        Mehrere auf einmal: ankreuzen, dann
      </label>
      <select id="aktion" name="aktion" className="field" defaultValue="vorschlag">
        <option value="vorschlag">Vorschläge übernehmen</option>
        <option value="geprueft">Stimmt so, nicht mehr zeigen</option>
        <optgroup label="Art setzen auf">
          {PROTEIN_CHOICES.map((type) => (
            <option key={type} value={`art:${type}`}>
              {PROTEIN_NAME[type]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Kategorie setzen auf">
          {categories.map((category) => (
            <option key={category.key} value={`kategorie:${category.key}`}>
              {category.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Aufwand setzen auf">
          {EFFORTS.map((effort) => (
            <option key={effort} value={`aufwand:${effort}`}>
              {EFFORT_NAME[effort]}
            </option>
          ))}
        </optgroup>
      </select>
      <div className="mt-3 flex flex-wrap gap-2">
        <button name="wen" value="ausgewaehlt" className="btn btn-primary">
          Für angekreuzte
        </button>
        <button name="wen" value="alle" className="btn">
          Für alle {shown.length} hier
          {total > shown.length ? ` (von ${total})` : ""}
        </button>
      </div>
    </form>
  );
}

function RecipeRow({
  check,
  summary,
  filter,
  categories,
  categoryName,
  servingsUnits,
}: {
  check: RecipeCheck;
  summary: RecipeSummary | undefined;
  filter: CheckedField | null;
  categories: Category[];
  categoryName: (key: string) => string;
  servingsUnits: string[];
}) {
  const { recipe } = check;
  const facts = [
    summary
      ? sourceText(sourceLabel(summary.sourceBook, summary.sourceEdition), summary.sourcePage)
      : "",
    recipe.proteinType ? PROTEIN_NAME[recipe.proteinType] : "",
    recipe.category ? categoryName(recipe.category) : "",
  ].filter(Boolean);
  return (
    <li id={`r-${recipe.id}`} className="card p-4">
      <div className="flex items-start gap-3">
        <SelectBox recipeId={recipe.id} title={recipe.title} />
        {summary && <RecipeBadge recipe={summary} />}
        <div className="min-w-0 flex-1">
          <Link href={`/rezepte/${recipe.id}${fromFieldChecks(filter)}`} className="font-semibold">
            {recipe.title}
          </Link>
          <p className="text-sm text-muted">{facts.join(" · ")}</p>
          {summary && <RecipeFacts recipe={summary} />}
          <ul className="mt-3 space-y-2">
            {check.findings.map((finding) => (
              <FindingRow
                key={finding.field}
                check={check}
                finding={finding}
                filter={filter}
                categories={categories}
                categoryName={categoryName}
                servingsUnits={servingsUnits}
              />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/** The hidden fields every form of a finding sends. */
function FindingFields({
  recipeId,
  field,
  filter,
}: {
  recipeId: string;
  field: CheckedField;
  filter: CheckedField | null;
}) {
  return (
    <>
      <input type="hidden" name="rezept" value={recipeId} />
      <input type="hidden" name="feld" value={field} />
      <input type="hidden" name="zurueck" value={filter ?? ""} />
    </>
  );
}

function FindingRow({
  check,
  finding,
  filter,
  categories,
  categoryName,
  servingsUnits,
}: {
  check: RecipeCheck;
  finding: Finding;
  filter: CheckedField | null;
  categories: Category[];
  categoryName: (key: string) => string;
  servingsUnits: string[];
}) {
  const { recipe } = check;
  const suggested = suggestionText(finding, categoryName);
  const hidden = <FindingFields recipeId={recipe.id} field={finding.field} filter={filter} />;
  return (
    <li className="rounded-lg bg-warn-soft px-3 py-2">
      <p>
        <span className="eyebrow mr-1.5">{FIELD_NAME[finding.field]}</span>
        {finding.text}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggested && finding.suggestion && (
          <form action={correctField}>
            {hidden}
            <input
              type="hidden"
              name={finding.field === "time" ? "aufwand" : "wert"}
              value={finding.suggestion}
            />
            <button className="btn btn-small btn-primary">Übernehmen: {suggested}</button>
          </form>
        )}
        {finding.field === "servings" &&
          servingsChoices(recipe.servings, servingsUnits).map((choice) => (
            <form key={choice.unit} action={correctField}>
              {hidden}
              <input type="hidden" name="von" value={choice.min} />
              <input type="hidden" name="bis" value={choice.max} />
              <input type="hidden" name="einheit" value={choice.unit} />
              <button className="btn btn-small">{servingsChoiceText(choice)}</button>
            </form>
          ))}
        <form action={confirmField}>
          {hidden}
          <button className="btn btn-small">Stimmt so</button>
        </form>
      </div>
      <details className="mt-2">
        <summary className="link cursor-pointer text-sm">Selbst ändern</summary>
        <form action={correctField} className="mt-2 flex flex-wrap items-end gap-2">
          {hidden}
          <FieldEditor check={check} field={finding.field} categories={categories} />
          <button className="btn btn-small">Speichern</button>
        </form>
      </details>
    </li>
  );
}

/** The inputs that set one field by hand, filled with what is there now. */
function FieldEditor({
  check,
  field,
  categories,
}: {
  check: RecipeCheck;
  field: CheckedField;
  categories: Category[];
}) {
  const { recipe } = check;
  const id = (name: string) => `${name}-${recipe.id}`;
  if (field === "protein") {
    return (
      <select
        name="wert"
        className="field w-auto"
        defaultValue={recipe.proteinType ?? ""}
        aria-label="Art"
      >
        <option value="">keine Angabe</option>
        {PROTEIN_CHOICES.map((type) => (
          <option key={type} value={type}>
            {PROTEIN_NAME[type]}
          </option>
        ))}
      </select>
    );
  }
  if (field === "category") {
    return (
      <select
        name="wert"
        className="field w-auto"
        defaultValue={recipe.category ?? ""}
        aria-label="Kategorie"
      >
        <option value="">keine</option>
        {categories.map((category) => (
          <option key={category.key} value={category.key}>
            {category.name}
          </option>
        ))}
      </select>
    );
  }
  if (field === "time") {
    const effort = EFFORTS.find((key) => recipe.tags.includes(key)) ?? "";
    return (
      <>
        <span>
          <label className="label" htmlFor={id("minuten")}>
            Minuten
          </label>
          <input
            id={id("minuten")}
            name="minuten"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            defaultValue={recipe.prepMinutes ?? ""}
            className="field w-24"
          />
        </span>
        <span>
          <label className="label" htmlFor={id("aufwand")}>
            Aufwand
          </label>
          <select id={id("aufwand")} name="aufwand" className="field w-auto" defaultValue={effort}>
            <option value="">nicht bekannt</option>
            {EFFORTS.map((key) => (
              <option key={key} value={key}>
                {EFFORT_NAME[key]}
              </option>
            ))}
          </select>
        </span>
      </>
    );
  }
  return (
    <>
      <span>
        <label className="label" htmlFor={id("von")}>
          Von
        </label>
        <input
          id={id("von")}
          name="von"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          required
          defaultValue={recipe.servings?.min ?? ""}
          className="field w-20"
        />
      </span>
      <span>
        <label className="label" htmlFor={id("bis")}>
          Bis
        </label>
        <input
          id={id("bis")}
          name="bis"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          defaultValue={recipe.servings?.max ?? ""}
          className="field w-20"
        />
      </span>
      <span className="min-w-40 flex-1">
        <label className="label" htmlFor={id("einheit")}>
          Einheit, leer für Personen
        </label>
        <input
          id={id("einheit")}
          name="einheit"
          maxLength={60}
          placeholder="Springform (Ø 26 cm)"
          defaultValue={recipe.servings?.unit ?? ""}
          className="field"
        />
      </span>
    </>
  );
}

/**
 * The box to tick a recipe for a change of several at once. It belongs to the form above the
 * list (`form="sammel"`) and is drawn by the stylesheet, at the size of a thumb.
 */
function SelectBox({ recipeId, title }: { recipeId: string; title: string }) {
  return (
    <label className="relative -mt-1 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        form="sammel"
        name="rezept"
        value={recipeId}
        aria-label={`${title} ankreuzen`}
        className="peer h-6 w-6 cursor-pointer appearance-none rounded-md border-2 border-muted bg-surface checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute hidden h-4 w-4 text-accent-ink peer-checked:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </label>
  );
}
