import type { Metadata } from "next";
import { sourceLabel } from "@/domain/library/source";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CookView } from "@/components/cook-view";
import { FavoriteHeart } from "@/components/favorite-heart";
import { PenIcon, TagIcon, TickIcon, WishIcon } from "@/components/icons";
import { RecipeBadge } from "@/components/recipe-card";
import { SubmitButton } from "@/components/submit-button";
import { TagEditor } from "@/components/tag-editor";
import type { ProteinType } from "@/domain/library/summary";
import { weekdayLong } from "@/domain/dates";
import { GAP, STEP_MAX_LENGTH, STEPS_MAX, typedSteps } from "@/domain/import/steps";
import { groupTags, TAG_GROUPS } from "@/domain/library/tags";
import {
  amountText,
  ingredientText,
  lastCookedText,
  servingsText,
  sourceText,
} from "@/lib/recipe-text";
import { loadIngredientNames, must } from "@/server/catalog";
import { viewUrls } from "@/server/import/storage";
import { readOrigin } from "@/lib/origin";
import { BackToList } from "@/components/list-return";
import { MEAL_NAME } from "@/lib/plan-text";
import { today } from "@/lib/today";
import { loadLastCooked, loadPlannedAt } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { saveSteps, setFavorite, setWanted } from "../actions";

export const metadata: Metadata = { title: "Rezept" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function RecipePage(props: PageProps<"/rezepte/[id]">) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const back = readOrigin(one(query.von), one(query.w), {
    recipeId: id,
    field: one(query.feld),
    day: one(query.tag),
  });
  const db = await createSessionClient();
  // Row level security decides whether this recipe exists for the person asking.
  const { data: recipe } = await db
    .from("recipe")
    .select(
      "id, title, source_title, source_book, source_edition, source_page, servings_min, servings_max, servings_unit, prep_minutes, protein_type, status, is_favorite, wanted_at, source_text, prep_steps, prep_steps_doubts",
    )
    .eq("id", id)
    .maybeSingle();
  if (!recipe) notFound();

  const now = today();
  const [lines, photos, ingredients, tagLinks, categories, planned, cooked] = await Promise.all([
    db
      .from("recipe_ingredient")
      .select(
        "id, position, ingredient_id, quantity, quantity_max, unit, is_optional, alternative_to, original_text, note",
      )
      .eq("recipe_id", id)
      .order("position"),
    db
      .from("recipe_photo")
      .select("storage_path, crop_path, sort_order")
      .eq("recipe_id", id)
      .order("sort_order"),
    loadIngredientNames(db),
    db.from("recipe_tag").select("tag_id").eq("recipe_id", id),
    db.from("tag").select("id, key, name, group_name").order("sort_order"),
    loadPlannedAt(db, id, now),
    loadLastCooked(db, id, now),
  ]);
  const ownIds = new Set(must(tagLinks, "load recipe tags").map((link) => link.tag_id));
  const allTags = must(categories, "load tags");
  const ownTags = allTags.filter((tag) => ownIds.has(tag.id));
  // Every tag a recipe can be described by, for changing them in place.
  const tagGroups = groupTags(
    allTags.map((tag) => ({ ref: tag.key ?? tag.id, name: tag.name, group: tag.group_name })),
  );
  const category = ownTags.find((tag) => tag.group_name === "Kategorie");
  // What else describes the recipe, in the order of the groups.
  const described = TAG_GROUPS.flatMap((group) =>
    ownTags.filter((tag) => tag.group_name === group),
  ).map((tag) => ({ ref: tag.key ?? tag.id, name: tag.name }));
  const wanted = recipe.wanted_at !== null;
  const catalog = new Map(ingredients.map((i) => [i.id, i]));
  const photoRows = must(photos, "load photos");
  const urls = await viewUrls(
    photoRows.flatMap((photo) => [
      photo.storage_path,
      ...(photo.crop_path ? [photo.crop_path] : []),
    ]),
  );
  const source = sourceText(
    sourceLabel(recipe.source_book, recipe.source_edition) || null,
    recipe.source_page,
  );
  const steps = recipe.prep_steps ?? [];
  const lineRows = must(lines, "load lines");
  // What a line says: the household's word for a known ingredient, or the printed text.
  const lineText = (line: (typeof lineRows)[number]) => {
    const known = line.ingredient_id ? catalog.get(line.ingredient_id) : undefined;
    return known
      ? ingredientText(known, line.quantity, line.quantity_max, line.unit)
      : line.original_text;
  };
  const facts = [
    servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit),
    recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // The address this page was opened with, so that changing the steps keeps the way back.
  const pageQuery = (extra: Record<string, string> = {}) => {
    const kept = Object.fromEntries(
      (["von", "w", "tag", "feld"] as const).flatMap((key) => {
        const value = one(query[key]);
        return value ? [[key, value]] : [];
      }),
    );
    const search = new URLSearchParams({ ...kept, ...extra }).toString();
    return search ? `?${search}` : "";
  };
  const canEditSteps = recipe.status === "approved";
  const editingSteps = canEditSteps && one(query.schritte) === "bearbeiten";
  const stepsFailed = one(query.fehler) === "schritte";
  const editStepsHref = `/rezepte/${recipe.id}${pageQuery({ schritte: "bearbeiten" })}#arbeitsschritte`;
  const editingTags = recipe.status === "approved" && one(query.stichworte) === "bearbeiten";
  const editTagsHref = `/rezepte/${recipe.id}${pageQuery({ stichworte: "bearbeiten" })}#stichworte`;

  return (
    // Wider on an iPad, where ingredients and steps stand side by side.
    <article className="mx-auto max-w-3xl tablet:max-w-5xl">
      <BackToList href={back.href} className="back-link">
        ← {back.label}
      </BackToList>
      <div className="mt-3 flex items-start gap-3.5">
        <RecipeBadge
          recipe={{
            title: recipe.title,
            category: category?.key ?? null,
            proteinType: recipe.protein_type as ProteinType | null,
            tags: described.map((tag) => tag.ref),
          }}
          className="mt-1 h-14 w-14 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          {category && <p className="eyebrow">{category.name}</p>}
          <h1 className="title mt-1">{recipe.title}</h1>
        </div>
        {recipe.status === "approved" && (
          // The same heart as in the corner of a recipe card.
          <form action={setFavorite} className="-mr-2 shrink-0">
            <input type="hidden" name="recipe" value={recipe.id} />
            <input type="hidden" name="favorite" value={recipe.is_favorite ? "0" : "1"} />
            <FavoriteHeart favorite={recipe.is_favorite} title={recipe.title} />
          </form>
        )}
      </div>
      <p className="mt-3 text-muted">
        {[
          servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit),
          recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
          source || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-1 text-sm text-muted">{lastCookedText(cooked, now)}</p>

      {editingTags ? (
        // Changed in place, like the steps: what the household reads is what it ticks.
        <div id="stichworte" className="card mt-4 scroll-mt-4 p-4">
          <TagEditor
            recipeId={recipe.id}
            chosen={described.map((tag) => tag.ref)}
            tagGroups={tagGroups}
            target="rezept"
            back={pageQuery()}
            cancel={`/rezepte/${recipe.id}${pageQuery()}`}
          />
        </div>
      ) : (
        <div id="stichworte" className="mt-3 flex scroll-mt-4 flex-wrap items-center gap-1.5">
          {described.length > 0 && (
            <ul aria-label="Stichworte" className="flex flex-wrap gap-1.5">
              {described.map((tag) => (
                <li key={tag.ref}>
                  {/* The pill stays small; the link around it is tall enough for a finger. */}
                  <Link
                    href={`/rezepte?tag=${tag.ref}`}
                    className="group inline-flex min-h-11 items-center"
                  >
                    <span className="tag min-h-7 px-2.5 group-hover:underline">{tag.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {recipe.status === "approved" && (
            <Link
              href={editTagsHref}
              className="link inline-flex min-h-11 items-center gap-1 px-1 text-sm"
              scroll={false}
            >
              <TagIcon />
              {described.length > 0 ? "Stichworte ändern" : "Stichworte vergeben"}
            </Link>
          )}
        </div>
      )}

      {recipe.status === "approved" && (
        // Einplanen, Kochen and the wish in one row, also on a phone: three equal parts.
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
          {planned ? (
            // On this week's plan already: the button says so and leads to where it stands.
            <Link
              href={
                planned.date
                  ? `/woche?w=${planned.week}#tag-${planned.date}`
                  : `/woche?w=${planned.week}&t=extra`
              }
              className="btn border-line bg-line px-2 text-accent sm:px-4"
              title={
                planned.date
                  ? `${weekdayLong(planned.date)}, ${MEAL_NAME[planned.meal]}`
                  : "Außerdem in dieser Woche"
              }
            >
              <TickIcon />
              Eingeplant
            </Link>
          ) : (
            <Link href={`/woche?rezept=${recipe.id}`} className="btn btn-primary px-2 sm:px-4">
              Einplanen
            </Link>
          )}
          <CookView
            title={recipe.title}
            facts={facts}
            ingredients={lineRows.map((line) => ({
              id: line.id,
              amount: amountText(line.quantity, line.quantity_max, line.unit),
              name: lineText(line),
              note:
                [
                  line.note,
                  line.alternative_to ? "Alternative" : null,
                  line.is_optional ? "nach Belieben" : null,
                ]
                  .filter(Boolean)
                  .join(", ") || null,
            }))}
            steps={steps}
          />
          <form action={setWanted} className="contents">
            <input type="hidden" name="recipe" value={recipe.id} />
            <input type="hidden" name="wanted" value={wanted ? "0" : "1"} />
            <SubmitButton
              className={`btn px-2 sm:px-4 ${wanted ? "border-accent text-accent" : ""}`}
              label={wanted ? "Steht auf der Wunschliste" : "Möchte ich kochen"}
            >
              <WishIcon filled={wanted} />
              {/* Short on a phone, so that the three share one row. */}
              <span className="sm:hidden">{wanted ? "Vorgemerkt" : "Vormerken"}</span>
              <span className="max-sm:hidden">
                {wanted ? "Steht auf der Wunschliste" : "Möchte ich kochen"}
              </span>
            </SubmitButton>
          </form>
        </div>
      )}

      {/* On an iPad the ingredients and the steps stand side by side, both at hand. */}
      <div className="tablet:grid tablet:grid-cols-2 tablet:items-start tablet:gap-6">
        <section aria-labelledby="zutaten">
          <div className="mt-6 mb-2 flex items-center gap-1">
            <h2 id="zutaten" className="text-xl font-bold tracking-tight">
              Zutaten
            </h2>
            {recipe.status === "approved" && (
              // Changing the recipe means above all its ingredients: the pen stands next to them.
              <Link
                href={`/rezepte/${recipe.id}/bearbeiten`}
                className="-my-1.5 flex size-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent"
                aria-label="Rezept ändern"
                title="Rezept ändern"
              >
                <PenIcon />
              </Link>
            )}
          </div>
          <ul className="card divide-y divide-line">
            {lineRows.map((line) => {
              return (
                <li key={line.id} className="flex gap-3 px-4 py-2">
                  <span className="w-24 shrink-0 text-right text-muted">
                    {amountText(line.quantity, line.quantity_max, line.unit)}
                  </span>
                  <span>
                    {lineText(line)}
                    {line.note && <span className="text-muted">, {line.note}</span>}
                    {line.alternative_to && <span className="text-muted"> (Alternative)</span>}
                    {line.is_optional && <span className="text-muted"> (nach Belieben)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="min-w-0">
          {editingSteps ? (
            // Changed in place, one step per line. An emptied field says the recipe has none.
            <form
              id="arbeitsschritte"
              action={saveSteps}
              className="card mt-6 flex scroll-mt-4 flex-col gap-3 p-4"
            >
              <input type="hidden" name="rezept" value={recipe.id} />
              <input type="hidden" name="zurueck" value={pageQuery()} />
              <label className="font-semibold" htmlFor="schritte">
                Arbeitsschritte, einer pro Zeile
              </label>
              {recipe.prep_steps_doubts.length > 0 && (
                <StepDoubts doubts={recipe.prep_steps_doubts} />
              )}
              <textarea
                id="schritte"
                name="schritte"
                className={`field leading-relaxed ${stepsFailed ? "field-problem" : ""}`}
                rows={Math.min(18, Math.max(5, steps.length * 3))}
                defaultValue={typedSteps(steps)}
                placeholder="Leer lassen, wenn das Rezept keine Arbeitsschritte hat."
              />
              {stepsFailed && (
                <p role="alert" className="text-sm font-semibold text-warn">
                  Höchstens {STEPS_MAX} Schritte und {STEP_MAX_LENGTH} Zeichen pro Schritt.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="btn btn-primary">Speichern</SubmitButton>
                <Link href={`/rezepte/${recipe.id}${pageQuery()}`} className="btn">
                  Abbrechen
                </Link>
              </div>
            </form>
          ) : steps.length > 0 || recipe.prep_steps_doubts.length > 0 ? (
            // Folded away like the photo: the household cooks from the book on the shelf. The
            // steps are there to look something up, and for a recipe that came in as text.
            // On an iPad they stand open beside the ingredients (`.steps-beside`).
            <details
              id="arbeitsschritte"
              className="steps-beside group card mt-6 scroll-mt-4"
              open={one(query.schritte) === "offen"}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  Arbeitsschritte
                  {steps.length > 0 && (
                    <span className="font-normal text-muted"> · {steps.length}</span>
                  )}
                  {recipe.prep_steps_doubts.length > 0 && (
                    <span className="font-normal text-warn"> · nicht ganz sicher gelesen</span>
                  )}
                </span>
                <span className="fold-toggle text-sm font-semibold text-accent">
                  <span className="group-open:hidden">Ansehen</span>
                  <span className="hidden group-open:inline">Ausblenden</span>
                </span>
              </summary>
              <div className="border-t border-line">
                {recipe.prep_steps_doubts.length > 0 && (
                  <div className="m-4">
                    <StepDoubts doubts={recipe.prep_steps_doubts} />
                  </div>
                )}
                {steps.length > 0 && (
                  <ol className="divide-y divide-line">
                    {steps.map((step, i) => (
                      <li key={i} className="flex gap-3 px-4 py-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
                          {i + 1}
                        </span>
                        <p className="min-w-0 leading-relaxed">
                          {step.split(GAP).map((part, at) => (
                            <span key={at}>
                              {at > 0 && (
                                <span className="rounded bg-warn-soft px-1 font-semibold text-warn">
                                  {GAP}
                                </span>
                              )}
                              {part}
                            </span>
                          ))}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                {canEditSteps && (
                  <div className="border-t border-line px-4 py-2">
                    <Link
                      href={editStepsHref}
                      className="link inline-flex min-h-11 items-center gap-1.5"
                    >
                      <PenIcon />
                      Arbeitsschritte ändern
                    </Link>
                  </div>
                )}
              </div>
            </details>
          ) : (
            !recipe.source_text && (
              // A pasted recipe from before steps were stored has them in its text below.
              <p
                id="arbeitsschritte"
                className="mt-6 flex flex-wrap items-center gap-x-3 text-muted"
              >
                Keine Arbeitsschritte vorhanden.
                {canEditSteps && (
                  <Link href={editStepsHref} className="link inline-flex min-h-11 items-center">
                    Eintragen
                  </Link>
                )}
              </p>
            )
          )}
        </div>
      </div>

      {recipe.source_text && (
        // A recipe that came in as text has no photo. Its text is kept as it was pasted.
        <details className="group card mt-6">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            {steps.length > 0 ? "Originaltext" : "Arbeitsschritte und Originaltext"}
            <span className="text-sm font-semibold text-accent">
              <span className="group-open:hidden">Ansehen</span>
              <span className="hidden group-open:inline">Ausblenden</span>
            </span>
          </summary>
          <p className="border-t border-line p-4 whitespace-pre-wrap">{recipe.source_text}</p>
        </details>
      )}

      {photoRows.length > 0 && (
        // Folded away: the ingredients above are what is cooked from. The page is there to
        // look something up, turned upright and cut to this recipe where it shares the page.
        <details className="group card mt-6">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            Originalfoto
            <span className="text-sm font-semibold text-accent">
              <span className="group-open:hidden">Ansehen</span>
              <span className="hidden group-open:inline">Ausblenden</span>
            </span>
          </summary>
          <div className="space-y-4 border-t border-line p-4">
            {photoRows.map((photo, i) => (
              <figure key={photo.storage_path}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img
                  src={urls[photo.crop_path ?? photo.storage_path]}
                  alt={`Seite ${i + 1} von ${recipe.title}`}
                  loading="lazy"
                  className="w-full rounded-lg border border-line"
                />
                <figcaption className="mt-2">
                  <a
                    href={urls[photo.storage_path]}
                    target="_blank"
                    rel="noreferrer"
                    className="link text-sm"
                  >
                    {photo.crop_path ? "Ganze Seite ansehen" : "In voller Größe ansehen"}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

/** What was not read with certainty in the steps, to compare with the photo. */
function StepDoubts({ doubts }: { doubts: string[] }) {
  return (
    <div role="note" className="rounded-lg bg-warn-soft px-4 py-3 text-warn">
      <p className="font-semibold">Bitte mit dem Originalfoto vergleichen.</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {doubts.map((doubt) => (
          <li key={doubt}>{doubt}</li>
        ))}
      </ul>
    </div>
  );
}
