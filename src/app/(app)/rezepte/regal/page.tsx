import type { Metadata } from "next";
import { sourceLabel } from "@/domain/library/source";
import Link from "next/link";
import type { ReactNode } from "react";
import { FavoriteHeart } from "@/components/favorite-heart";
import { PenIcon, TagIcon, TrashIcon, WishIcon } from "@/components/icons";
import { RecipeBadge } from "@/components/recipe-card";
import {
  activeChips,
  FilterBar,
  FilterLayout,
  FilterPanel,
  filterHref,
  panelGroups,
  WaysOut,
  type PanelGroup,
} from "@/components/recipe-filters";
import { RecipeViews } from "@/components/recipe-views";
import { SubmitButton } from "@/components/submit-button";
import { TagEditor } from "@/components/tag-editor";
import { TagNameField } from "@/components/tag-name-field";
import { dayAndMonth, weekdayLong, type IsoDate } from "@/domain/dates";
import {
  filterParams,
  isNoFilter,
  NO_FILTER,
  readFilter,
  type RecipeFilter,
} from "@/domain/library/filter";
import {
  LACK_NAME,
  LACKS,
  lacks,
  pageOf,
  readTableView,
  shelfParams,
  shownTags,
  sortedBy,
  sortRows,
  tableParams,
  type TableRow,
  type TableSort,
  type TableView,
} from "@/domain/library/recipe-table";
import type { RecipeSummary } from "@/domain/library/summary";
import { EFFORT_NAME, EFFORTS, effortOf, type Tag } from "@/domain/library/tags";
import { FROM_SHELF } from "@/lib/origin";
import { MEAL_NAME, recipeTone } from "@/lib/plan-text";
import { servingsText } from "@/lib/recipe-text";
import { today } from "@/lib/today";
import type { Library } from "@/server/library";
import { listRecipes, loadLibraryForLists } from "@/server/recipe-list";
import { loadLastCookedAll, loadRecipePlaces, type PlanPlace } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { setFavorite, setWanted } from "../actions";
import { changeSeveral, deleteFromShelf } from "./actions";
import { SelectionBar } from "./selection-bar";

export const metadata: Metadata = { title: "Regal" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The form the ticked boxes of the rows belong to. */
const SELECTION = "auswahl";

/**
 * The Regal: every recipe of the library in one table, to look after it. Sorted by any
 * column, narrowed like "Entdecken" and to what still lacks something, a page at a time.
 * Ticked recipes are changed together; each row has its marks, its tags, the form to change
 * it and a way to delete it. On a phone a row shows title and effort and opens for the rest.
 */
export default async function ShelfPage(props: PageProps<"/rezepte/regal">) {
  const params = await props.searchParams;
  const filter = readFilter(params);
  const view = readTableView(params);
  const now = today();
  const db = await createSessionClient();
  const [library, cooked] = await Promise.all([
    loadLibraryForLists(db, now),
    loadLastCookedAll(db, now),
  ]);
  const { recipes, categories, tagGroups } = library;
  const tags = tagGroups.flatMap((group) => group.tags);

  // With words to search for, the best fit comes first unless a column is chosen.
  const list = await listRecipes(db, library, recipes, filter, {
    season: true,
    longAgo: true,
    favorites: true,
  });
  const found =
    filter.text.trim() === ""
      ? [...list.results].sort((a, b) => a.title.localeCompare(b.title, "de"))
      : list.results;
  const rows = sortRows(
    found
      .filter((recipe) => !view.lacks || lacks(recipe, view.lacks))
      .map((recipe) => ({ recipe, lastCooked: cooked.get(recipe.id) ?? null })),
    view,
    { categories: categories.map((category) => category.key) },
  );
  const shown = pageOf(rows, view.page);

  const shelf = shelfParams(params);
  const query = new URLSearchParams(shelf).toString();
  const href = (extra: Record<string, string>, anchor = "") =>
    `/rezepte/regal?${new URLSearchParams({ ...shelf, ...extra })}${anchor}`;
  const withView = (next: TableView) =>
    `/rezepte/regal?${new URLSearchParams({ ...filterParams(filter), ...tableParams(next) })}`;

  // The filter's links keep the table's order and what is lacking, from the first page.
  const keep = tableParams({ ...view, page: 1 });
  const filterLink = (next: RecipeFilter) => filterHref("/rezepte/regal", next, keep);
  const lacking: PanelGroup = {
    key: "ohne",
    title: "Was fehlt",
    options: LACKS.map((lack) => {
      const on = view.lacks === lack;
      return {
        key: `ohne-${lack}`,
        label: LACK_NAME[lack],
        count: found.filter((recipe) => lacks(recipe, lack)).length,
        on,
        href: withView({ ...view, lacks: on ? null : lack, page: 1 }),
        picture: { kind: "none" },
      };
    }),
  };
  const groups = [lacking, ...panelGroups(list.groups, filterLink)];
  const chips = [
    ...(view.lacks
      ? [
          {
            key: "ohne",
            label: LACK_NAME[view.lacks],
            href: withView({ ...view, lacks: null, page: 1 }),
          },
        ]
      : []),
    ...activeChips(list.groups, filterLink),
  ];
  const reset =
    isNoFilter({ ...filter, text: "" }) && !view.lacks
      ? null
      : filterHref(
          "/rezepte/regal",
          { ...NO_FILTER, text: filter.text },
          tableParams({ ...view, lacks: null, page: 1 }),
        );

  const recipeOf = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const deleting = recipeOf.get(one(params.loeschen) ?? "");
  const places = deleting ? await loadRecipePlaces(db, deleting.id) : [];
  const tagging = recipeOf.get(one(params.stichworte) ?? "");

  return (
    <div className="mx-auto max-w-5xl pb-20 xl:max-w-7xl">
      <p className="eyebrow">
        {recipes.length === 1 ? "1 Rezept" : `${recipes.length} Rezepte`} im Kochbuch
      </p>
      <h1 className="title mt-1">Regal</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <RecipeViews current="regal" />
        <Link href="/rezepte/stichworte" className="btn btn-small">
          <TagIcon />
          Stichworte verwalten
        </Link>
      </div>

      <Said params={params} tags={tags} library={library} />

      {deleting && (
        <DeleteQuestion
          recipe={deleting}
          places={places}
          back={query}
          cancel={href({}, `#r-${deleting.id}`)}
        />
      )}

      <div className="mt-5">
        <FilterLayout
          layout="aside"
          panel={<FilterPanel layout="aside" groups={groups} total={shown.total} reset={reset} />}
        >
          <FilterBar
            path="/rezepte/regal"
            filter={filter}
            hidden={{ ...keep, ...filterParams({ ...filter, text: "" }) }}
            layout="aside"
            chips={chips}
            reset={reset}
          />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted" role="status">
              {shown.total === 1 ? "1 Rezept" : `${shown.total} Rezepte`}
              {shown.pages > 1 && ` · Seite ${shown.page} von ${shown.pages}`}
            </p>
            {shown.rows.length > 0 && (
              <label className="chip cursor-pointer">
                <input type="checkbox" form={SELECTION} name="alle" value="1" className="sr-only" />
                Alle auf dieser Seite
              </label>
            )}
          </div>

          {/* On a phone the columns' headings are not shown: it is sorted here instead. */}
          <nav
            aria-label="Sortieren"
            className="mt-3 flex flex-wrap items-center gap-1.5 sm:hidden"
          >
            <span className="text-sm text-muted">Sortiert nach</span>
            {(["titel", "aufwand", "gekocht", "neu"] as const).map((sort) => (
              <SortLink key={sort} sort={sort} view={view} href={withView} chip>
                {SORT_NAME[sort]}
              </SortLink>
            ))}
          </nav>

          {shown.rows.length === 0 ? (
            <p className="mt-6 text-muted">
              {recipes.length === 0 ? "Noch keine Rezepte." : "Kein Rezept passt dazu."}
            </p>
          ) : null}
          {shown.rows.length === 0 && !view.lacks ? (
            <WaysOut relax={list.relax} href={filterLink} />
          ) : null}
          {shown.rows.length > 0 && (
            <div className="card mt-3 overflow-hidden">
              <table className="w-full border-collapse text-left">
                <thead className="hidden border-b border-line bg-paper sm:table-header-group">
                  <tr className="text-sm text-muted">
                    <th className="w-11">
                      <span className="sr-only">Auswählen</span>
                    </th>
                    <Th>
                      <SortLink sort="titel" view={view} href={withView}>
                        Rezept
                      </SortLink>
                    </Th>
                    <Th className="hidden xl:table-cell">
                      <SortLink sort="buch" view={view} href={withView}>
                        Kochbuch
                      </SortLink>
                    </Th>
                    <Th className="hidden xl:table-cell">S.</Th>
                    <Th className="hidden lg:table-cell">
                      <SortLink sort="kategorie" view={view} href={withView}>
                        Kategorie
                      </SortLink>
                    </Th>
                    <Th className="hidden md:table-cell">
                      <SortLink sort="art" view={view} href={withView}>
                        Art
                      </SortLink>
                    </Th>
                    <Th>
                      <SortLink sort="aufwand" view={view} href={withView}>
                        Aufwand
                      </SortLink>
                    </Th>
                    <Th className="hidden xl:table-cell">
                      <SortLink sort="portionen" view={view} href={withView}>
                        Portionen
                      </SortLink>
                    </Th>
                    <Th className="hidden xl:table-cell">Stichworte</Th>
                    <Th className="hidden lg:table-cell">
                      <SortLink sort="gekocht" view={view} href={withView}>
                        Gekocht
                      </SortLink>
                    </Th>
                    <Th>
                      <span className="sr-only">Aktionen</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.rows.map((row) => (
                    <ShelfRow
                      key={row.recipe.id}
                      row={row}
                      now={now}
                      tags={tags}
                      category={
                        categories.find((category) => category.key === row.recipe.category)?.name ??
                        null
                      }
                      href={href}
                      editor={
                        tagging?.id === row.recipe.id ? (
                          <TagEditor
                            recipeId={row.recipe.id}
                            chosen={row.recipe.tags}
                            tagGroups={tagGroups}
                            target="regal"
                            back={query}
                            cancel={href({}, `#r-${row.recipe.id}`)}
                          />
                        ) : null
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shown.pages > 1 && (
            <nav aria-label="Seiten" className="mt-4 flex items-center justify-between gap-3">
              {shown.page > 1 ? (
                <Link href={withView({ ...view, page: shown.page - 1 })} className="btn btn-small">
                  ← Zurück
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">
                Seite {shown.page} von {shown.pages}
              </span>
              {shown.page < shown.pages ? (
                <Link href={withView({ ...view, page: shown.page + 1 })} className="btn btn-small">
                  Weiter →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </FilterLayout>
      </div>

      {shown.rows.length > 0 && (
        <SelectionBar form={SELECTION} page={`${query}`}>
          <form id={SELECTION} action={changeSeveral} className="space-y-5">
            <input type="hidden" name="zurueck" value={query} />
            {shown.rows.map((row) => (
              <input key={row.recipe.id} type="hidden" name="angezeigt" value={row.recipe.id} />
            ))}
            <div className="space-y-2">
              <TagNameField name="stichwort" label="Stichwort hinzufügen" tags={tags} />
              <SubmitButton className="btn btn-small" name="aktion" value="dazu">
                Hinzufügen
              </SubmitButton>
            </div>
            <Choice label="Stichwort entfernen" name="weg" action="weg" button="Entfernen">
              {tagGroups.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.tags.map((tag) => (
                    <option key={tag.ref} value={tag.ref}>
                      {tag.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Choice>
            <Choice label="Kategorie" name="kategorie" action="kategorie" button="Setzen">
              {categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.name}
                </option>
              ))}
              <option value="">Keine Kategorie</option>
            </Choice>
            <Choice label="Aufwand" name="aufwand" action="aufwand" button="Setzen">
              {EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {EFFORT_NAME[effort]}
                </option>
              ))}
            </Choice>
          </form>
        </SelectionBar>
      )}
    </div>
  );
}

const SORT_NAME: Record<TableSort, string> = {
  titel: "Titel",
  buch: "Kochbuch",
  kategorie: "Kategorie",
  art: "Art",
  aufwand: "Aufwand",
  portionen: "Portionen",
  gekocht: "Zuletzt gekocht",
  neu: "Neu",
};

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-2 py-2 font-semibold whitespace-nowrap ${className}`}>{children}</th>;
}

/** A column's heading that sorts by it, and the other way round when it does already. */
function SortLink({
  sort,
  view,
  href,
  chip = false,
  children,
}: {
  sort: TableSort;
  view: TableView;
  href: (view: TableView) => string;
  chip?: boolean;
  children: ReactNode;
}) {
  const active = (view.sort ?? "titel") === sort;
  const arrow = active ? (view.descending ? " ↓" : " ↑") : "";
  return (
    <Link
      href={href(sortedBy(view, sort))}
      className={
        chip
          ? `chip min-h-11 px-3 text-sm ${active ? "chip-on" : ""}`
          : `inline-flex min-h-11 items-center hover:text-ink ${active ? "text-ink" : ""}`
      }
      aria-current={active ? "true" : undefined}
      scroll={false}
    >
      {children}
      {arrow}
    </Link>
  );
}

/** One choice for the ticked recipes, with its button. */
function Choice({
  label,
  name,
  action,
  button,
  children,
}: {
  label: string;
  name: string;
  action: string;
  button: string;
  children: ReactNode;
}) {
  const id = `auswahl-${name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <select id={id} name={name} className="field flex-1">
          {children}
        </select>
        <SubmitButton className="btn btn-small shrink-0" name="aktion" value={action}>
          {button}
        </SubmitButton>
      </div>
    </div>
  );
}

/** "12. Oktober", with the year when it was another one. */
function dayText(day: IsoDate, now: IsoDate): string {
  return day.slice(0, 4) === now.slice(0, 4)
    ? dayAndMonth(day)
    : `${dayAndMonth(day)} ${day.slice(0, 4)}`;
}

function effortText(recipe: RecipeSummary): string | null {
  const effort = effortOf(recipe);
  if (!effort) return recipe.prepMinutes === null ? null : `${recipe.prepMinutes} Min.`;
  return recipe.prepMinutes === null
    ? EFFORT_NAME[effort]
    : `${EFFORT_NAME[effort]} · ${recipe.prepMinutes} Min.`;
}

function kindLabel(recipe: RecipeSummary): { className: string; label: string } | null {
  const tone = recipeTone(recipe);
  if (!tone) return null;
  return { className: tone.className, label: tone.label ?? "Süßes" };
}

function ShelfRow({
  row,
  now,
  tags,
  category,
  href,
  editor,
}: {
  row: TableRow;
  now: IsoDate;
  tags: readonly Tag[];
  category: string | null;
  href: (extra: Record<string, string>, anchor?: string) => string;
  editor: ReactNode;
}) {
  const { recipe, lastCooked } = row;
  const kind = kindLabel(recipe);
  const effort = effortText(recipe);
  const described = shownTags(recipe, tags);
  const source = [
    sourceLabel(recipe.sourceBook, recipe.sourceEdition),
    recipe.sourcePage !== null ? `S. ${recipe.sourcePage}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const servings = recipe.servings
    ? servingsText(recipe.servings.min, recipe.servings.max, recipe.servings.unit)
    : null;
  const cooked = lastCooked ? dayText(lastCooked, now) : "Nie";
  const tagHref = href({ stichworte: recipe.id }, `#r-${recipe.id}`);
  const deleteHref = href({ loeschen: recipe.id }, "#loeschen");
  const tagList = described.length > 0 && (
    <span className="flex flex-wrap gap-1">
      {described.map((tag) => (
        <span key={tag.ref} className="tag">
          {tag.name}
        </span>
      ))}
    </span>
  );
  const wish = (withWords: boolean) => (
    <form action={setWanted}>
      <input type="hidden" name="recipe" value={recipe.id} />
      <input type="hidden" name="wanted" value={recipe.wanted ? "0" : "1"} />
      <SubmitButton
        className={
          withWords ? `btn btn-small ${recipe.wanted ? "text-accent" : ""}` : "icon-button"
        }
        label={withWords ? undefined : `Möchte ich kochen: ${recipe.title}`}
        on={recipe.wanted}
      >
        <WishIcon filled={recipe.wanted} />
        {withWords && (recipe.wanted ? "Steht auf der Wunschliste" : "Möchte ich kochen")}
      </SubmitButton>
    </form>
  );

  return (
    <>
      <tr
        id={`r-${recipe.id}`}
        className="scroll-mt-4 border-b border-line align-top last:border-0"
      >
        <td className="w-11 py-1 pl-1">
          <label className="flex size-11 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              form={SELECTION}
              name="rezept"
              value={recipe.id}
              className="size-5 accent-accent"
              aria-label={`${recipe.title} auswählen`}
            />
          </label>
        </td>
        <td className="min-w-0 px-2 py-2.5">
          <div className="flex items-start gap-2.5">
            <RecipeBadge recipe={recipe} className="mt-0.5 hidden h-8 w-8 shrink-0 sm:flex" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/rezepte/${recipe.id}${FROM_SHELF}`}
                className="font-semibold hover:underline"
              >
                {recipe.title}
              </Link>
              {/* What has no column of its own at this width stands under the title. */}
              <p className="mt-0.5 text-sm text-muted">
                {source && <span className="xl:hidden">{source}</span>}
                {category && (
                  <span className="lg:hidden">
                    {source && " · "}
                    {category}
                  </span>
                )}
                {effort && <span className="sm:hidden"> · {effort}</span>}
              </p>
              {tagList && <div className="mt-1 hidden sm:block xl:hidden">{tagList}</div>}
              <details className="group mt-1 sm:hidden">
                <summary className="link inline-flex min-h-11 cursor-pointer list-none items-center text-sm [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Mehr</span>
                  <span className="hidden group-open:inline">Weniger</span>
                </summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Art</dt>
                  <dd>{kind?.label ?? "–"}</dd>
                  <dt className="text-muted">Portionen</dt>
                  <dd>{servings ?? "–"}</dd>
                  <dt className="text-muted">Gekocht</dt>
                  <dd>{cooked}</dd>
                  <dt className="text-muted">Stichworte</dt>
                  <dd>{tagList || "–"}</dd>
                </dl>
                <div className="mt-2 flex flex-wrap gap-2">
                  {wish(true)}
                  <Link href={tagHref} className="btn btn-small" scroll={false}>
                    <TagIcon />
                    Stichworte
                  </Link>
                  <Link href={`/rezepte/${recipe.id}/bearbeiten`} className="btn btn-small">
                    <PenIcon />
                    Ändern
                  </Link>
                  <Link href={deleteHref} className="btn btn-small">
                    <TrashIcon />
                    Löschen
                  </Link>
                </div>
              </details>
            </div>
          </div>
        </td>
        <td className="hidden px-2 py-2.5 text-sm xl:table-cell">
          {recipe.sourceBook ?? "–"}
          {recipe.sourceEdition && <span className="block text-muted">{recipe.sourceEdition}</span>}
        </td>
        <td className="hidden px-2 py-2.5 text-sm tabular-nums xl:table-cell">
          {recipe.sourcePage ?? ""}
        </td>
        <td className="hidden px-2 py-2.5 text-sm lg:table-cell">{category ?? "–"}</td>
        <td className="hidden px-2 py-2.5 text-sm md:table-cell">
          {kind ? (
            <span className={kind.className}>
              <span className="tag">{kind.label}</span>
            </span>
          ) : (
            "–"
          )}
        </td>
        <td className="hidden px-2 py-2.5 text-sm sm:table-cell">{effort ?? "–"}</td>
        <td className="hidden px-2 py-2.5 text-sm xl:table-cell">{servings ?? "–"}</td>
        <td className="hidden max-w-56 px-2 py-2.5 xl:table-cell">{tagList || "–"}</td>
        <td className="hidden px-2 py-2.5 text-sm whitespace-nowrap lg:table-cell">{cooked}</td>
        <td className="py-1 pr-1">
          <div className="flex items-center justify-end">
            <form action={setFavorite}>
              <input type="hidden" name="recipe" value={recipe.id} />
              <input type="hidden" name="favorite" value={recipe.isFavorite ? "0" : "1"} />
              <FavoriteHeart favorite={recipe.isFavorite} title={recipe.title} />
            </form>
            <span className="hidden items-center sm:flex">
              {wish(false)}
              <Link
                href={tagHref}
                className="icon-button"
                aria-label={`Stichworte ändern: ${recipe.title}`}
                title="Stichworte ändern"
                scroll={false}
              >
                <TagIcon />
              </Link>
              <Link
                href={`/rezepte/${recipe.id}/bearbeiten`}
                className="icon-button"
                aria-label={`Rezept ändern: ${recipe.title}`}
                title="Rezept ändern"
              >
                <PenIcon />
              </Link>
              <Link
                href={deleteHref}
                className="icon-button"
                aria-label={`Löschen: ${recipe.title}`}
                title="Löschen"
              >
                <TrashIcon />
              </Link>
            </span>
          </div>
        </td>
      </tr>
      {editor && (
        <tr className="border-b border-line bg-paper">
          <td colSpan={11} className="p-4">
            <p className="mb-3 font-semibold">Stichworte für „{recipe.title}“</p>
            {editor}
          </td>
        </tr>
      )}
    </>
  );
}

/** Asks once more before a recipe is deleted, or says why it cannot be. */
function DeleteQuestion({
  recipe,
  places,
  back,
  cancel,
}: {
  recipe: RecipeSummary;
  places: readonly PlanPlace[];
  back: string;
  cancel: string;
}) {
  if (places.length > 0) {
    return (
      <section
        id="loeschen"
        role="alert"
        className="mt-5 scroll-mt-4 rounded-lg bg-warn-soft px-4 py-3 text-warn"
      >
        <p className="font-semibold">„{recipe.title}“ steht im Plan und bleibt deshalb.</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {places.map((place) => (
            <li key={`${place.week}${place.date}${place.meal}`}>
              {place.date ? (
                <Link href={`/woche?w=${place.week}#tag-${place.date}`} className="underline">
                  {weekdayLong(place.date)}, {dayAndMonth(place.date)} {place.date.slice(0, 4)},{" "}
                  {MEAL_NAME[place.meal]}
                </Link>
              ) : (
                <Link href={`/woche?w=${place.week}&t=extra`} className="underline">
                  Außerdem in der Woche vom {dayAndMonth(place.week)} {place.week.slice(0, 4)}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          Nimm es dort heraus, dann lässt es sich löschen. Ist es doppelt, führe es unter{" "}
          <Link href="/import/pruefen/doppelt" className="underline">
            Doppelte Rezepte
          </Link>{" "}
          mit dem anderen zusammen: Seine Mahlzeiten gehen dann mit.
        </p>
        <Link href={cancel} className="btn btn-small mt-3">
          Schließen
        </Link>
      </section>
    );
  }
  return (
    <section id="loeschen" className="card mt-5 scroll-mt-4 p-4">
      <p className="font-semibold">„{recipe.title}“ löschen?</p>
      <p className="mt-1 text-sm text-muted">
        Es verschwindet mit seinen Zutaten und Stichworten aus dem Kochbuch. Das lässt sich nicht
        rückgängig machen.
      </p>
      <form action={deleteFromShelf} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="rezept" value={recipe.id} />
        <input type="hidden" name="zurueck" value={back} />
        <input type="hidden" name="bestaetigt" value="ja" />
        <SubmitButton className="btn btn-small btn-danger">Löschen</SubmitButton>
        <Link href={cancel} className="btn btn-small">
          Abbrechen
        </Link>
      </form>
    </section>
  );
}

/** What the last change did, or why it did nothing. */
function Said({
  params,
  tags,
  library,
}: {
  params: Record<string, string | string[] | undefined>;
  tags: readonly Tag[];
  library: Library;
}) {
  const done = one(params.getan);
  const failed = one(params.fehler);
  const count = Number(one(params.n)) || 0;
  const value = one(params.wert) ?? "";
  const recipes = count === 1 ? "1 Rezept" : `${count} Rezepte`;
  // After "bei": "bei 2 Rezepten".
  const atRecipes = count === 1 ? "1 Rezept" : `${count} Rezepten`;
  const tagName = tags.find((tag) => tag.ref === value)?.name;
  const category = library.categories.find((entry) => entry.key === value)?.name;
  let text: string | null = null;
  if (done === "dazu" && tagName) text = `„${tagName}“ steht jetzt bei ${atRecipes}.`;
  if (done === "weg" && tagName) text = `„${tagName}“ ist bei ${atRecipes} entfernt.`;
  if (done === "kategorie") {
    text = category ? `${recipes}: Kategorie „${category}“.` : `${recipes}: keine Kategorie.`;
  }
  if (done === "aufwand" && (EFFORTS as readonly string[]).includes(value)) {
    text = `${recipes}: Aufwand „${EFFORT_NAME[value as (typeof EFFORTS)[number]]}“.`;
  }
  if (done === "geloescht") text = "Das Rezept ist gelöscht.";
  if (failed === "auswahl") text = "Kreuze zuerst an, welche Rezepte sich ändern sollen.";
  if (failed === "stichwort") text = "Dieses Stichwort lässt sich so nicht vergeben.";
  if (!text) return null;
  return (
    <p
      role="status"
      className={`mt-4 rounded-lg px-4 py-3 font-semibold ${failed ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}
    >
      {text}
    </p>
  );
}
