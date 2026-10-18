import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { typedSteps } from "@/domain/import/steps";
import { FROM_STEP_CHECKS } from "@/lib/origin";
import { sourceText } from "@/lib/recipe-text";
import { requireHousehold } from "@/server/auth";
import { countStepChecks, loadStepChecks, type StepCheck } from "@/server/step-checks";
import { createSessionClient } from "@/server/supabase/server";
import { confirmSteps } from "../actions";

export const metadata: Metadata = { title: "Arbeitsschritte prüfen" };

/** Recipes shown at once. A checked one makes room for the next. */
const SHOWN = 20;

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Recipes whose steps were read from their photo with a doubt: the doubt, the photo and the
 * steps side by side. The steps are corrected in place, or taken as they are.
 */
export default async function StepChecksPage(props: PageProps<"/import/pruefen/schritte">) {
  const params = await props.searchParams;
  await requireHousehold();
  const db = await createSessionClient();
  const [total, recipes] = await Promise.all([countStepChecks(db), loadStepChecks(db, SHOWN)]);
  const failed = one(params.fehler);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/import" className="link text-sm">
        ← Import
      </Link>
      <h1 className="title mt-2">Arbeitsschritte prüfen</h1>
      <p className="mt-1 text-muted">
        Diese Arbeitsschritte waren auf dem Foto nicht ganz sicher zu lesen. Vergleiche sie mit dem
        Foto, korrigiere, was nicht stimmt, und übernimm sie. Ein Schritt pro Zeile.
      </p>

      {recipes.length === 0 ? (
        <p className="card mt-6 p-4">Alle Arbeitsschritte sind geprüft.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {recipes.map((recipe) => (
            <StepCheckCard key={recipe.id} recipe={recipe} failed={failed === recipe.id} />
          ))}
        </ul>
      )}
      {total > recipes.length && (
        <p className="mt-4 text-muted">
          Noch {total - recipes.length} weitere Rezepte. Sie erscheinen hier, sobald diese geprüft
          sind.
        </p>
      )}
    </div>
  );
}

function StepCheckCard({ recipe, failed }: { recipe: StepCheck; failed: boolean }) {
  const source = sourceText(recipe.sourceBook, recipe.sourcePage);
  const text = typedSteps(recipe.steps);
  const lines = recipe.steps.length;
  return (
    <li id={`r-${recipe.id}`} className="card scroll-mt-4 p-4">
      <Link
        href={`/rezepte/${recipe.id}${FROM_STEP_CHECKS}`}
        className="text-lg font-semibold hover:underline"
      >
        {recipe.title}
      </Link>
      {source && <p className="text-sm text-muted">{source}</p>}
      <ul className="mt-3 list-disc space-y-0.5 rounded-lg bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">
        {recipe.doubts.map((doubt) => (
          <li key={doubt}>{doubt}</li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {recipe.photos.map((photo, i) => (
            <figure key={photo.page}>
              <a href={photo.page} target="_blank" rel="noreferrer" title="Ganze Seite öffnen">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img
                  src={photo.view}
                  alt={`Foto ${i + 1} von ${recipe.title}`}
                  loading="lazy"
                  className="w-full rounded-lg border border-line"
                />
              </a>
            </figure>
          ))}
          {recipe.photos.length === 0 && <p className="text-muted">Kein Foto gespeichert.</p>}
        </div>

        <form action={confirmSteps} className="flex flex-col gap-3">
          <input type="hidden" name="rezept" value={recipe.id} />
          <label className="label" htmlFor={`schritte-${recipe.id}`}>
            Arbeitsschritte, einer pro Zeile
          </label>
          <textarea
            id={`schritte-${recipe.id}`}
            name="schritte"
            className={`field leading-relaxed ${failed ? "field-problem" : ""}`}
            rows={Math.min(18, Math.max(5, lines * 3))}
            defaultValue={text}
          />
          {failed && (
            <p role="alert" className="text-sm font-semibold text-warn">
              Höchstens 40 Schritte und 2000 Zeichen pro Schritt.
            </p>
          )}
          <SubmitButton className="btn btn-primary self-start">Stimmt so, übernehmen</SubmitButton>
        </form>
      </div>
    </li>
  );
}
