import Link from "next/link";
import type { ReactNode } from "react";
import type { CategoryTab, Featured, Shelf, TagChip, Theme } from "@/domain/library/discover";
import type { RecipeFilter } from "@/domain/library/filter";
import { sourceLabel } from "@/domain/library/source";
import type { RecipeSummary } from "@/domain/library/summary";
import { filterTone, recipeTone } from "@/lib/plan-text";
import { timeText } from "@/lib/recipe-text";
import { NO_FILTER } from "@/domain/library/filter";
import { pictogramForFilter } from "@/domain/library/pictogram";
import { FORWARD, SWAP } from "@/lib/transitions";
import { ClockIcon } from "./icons";
import { PictogramIcon } from "./pictogram";
import { RecipeBadge, RecipeCard } from "./recipe-card";

/**
 * The pieces of "Entdecken" while nothing is searched: a recipe of the day, a row of themes,
 * and shelves of cards or of rows three to a column. Made for the iPad first, where the family browses (October
 * 2026): the page has the whole width then, and a shelf shows three or four cards and the
 * edge of the next, which says that it scrolls.
 */

/**
 * The recipe of the day as one band: its sign, the title with what speaks for it, time and
 * cookbook on one line, its tags, and the way onto the plan at its end. Taller, with a large
 * picture or the facts line by line, it was mostly empty room (October 2026).
 */
export function FeaturedRecipe({
  featured,
  category,
  tags,
  from = "",
}: {
  featured: Featured;
  category: string | null;
  /** What describes it: its main ingredient, kind of dish, cuisine, occasion. */
  tags: readonly string[];
  /** What says where it stands, for the way back: see `lib/origin.ts`. */
  from?: string;
}) {
  const { recipe, why } = featured;
  const href = `/rezepte/${recipe.id}${from}`;
  const facts = [
    timeText(recipe),
    recipe.sourceBook && sourceLabel(recipe.sourceBook, recipe.sourceEdition),
  ].filter(Boolean);
  return (
    <section aria-label="Heute entdecken" className={`featured ${kindOf(recipe)}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <RecipeBadge recipe={recipe} className="size-14 rounded-2xl" />
        <div className="min-w-0">
          <p className="eyebrow">Heute entdecken · {category ?? "Rezept"}</p>
          <h2 className="featured-title mt-0.5">
            <Link href={href} prefetch transitionTypes={[FORWARD]} className="hover:underline">
              {recipe.title}
            </Link>
          </h2>
          <p className="mt-1 text-sm">
            {why && <span className="font-semibold text-accent">{why}</span>}
            {why && facts.length > 0 && <span className="text-muted"> · </span>}
            <span className="text-muted">{facts.join(" · ")}</span>
          </p>
          {tags.length > 0 && (
            <ul aria-label="Stichworte" className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag} className="tag bg-surface">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href={`/woche?rezept=${recipe.id}`} className="btn btn-primary">
          Einplanen
        </Link>
        <Link href={href} prefetch transitionTypes={[FORWARD]} className="btn">
          Ansehen
        </Link>
      </div>
    </section>
  );
}

/** A small card beside the recipe of the day: a sign, two lines, and where it leads. */
export function SideCard({
  picture,
  title,
  text,
  className = "",
}: {
  picture: ReactNode;
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <span className={`side-card ${className}`}>
      <span className="badge size-11 rounded-xl">{picture}</span>
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-semibold">{title}</span>
        <span className="line-clamp-2 text-sm text-muted">{text}</span>
      </span>
      <span aria-hidden className="text-accent">
        →
      </span>
    </span>
  );
}

/** The colour class of a recipe's kind; grey where it has none. */
function kindOf(recipe: Pick<RecipeSummary, "proteinType" | "category">): string {
  return recipeTone(recipe)?.className ?? "kind-none";
}

/** A recipe as a row of a shelf that shows three to a column: sign, title, time. */
function RecipeListRow({
  recipe,
  category,
  note,
  from,
}: {
  recipe: RecipeSummary;
  category: string | null;
  /** Instead of the category: "Zuletzt am 1. Oktober". */
  note?: string;
  from: string;
}) {
  const time = timeText(recipe);
  const said = note ?? category;
  return (
    <Link
      href={`/rezepte/${recipe.id}${from}`}
      prefetch
      transitionTypes={[FORWARD]}
      className="list-row"
    >
      <RecipeBadge recipe={recipe} className="size-12 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 leading-snug font-semibold">{recipe.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-sm text-muted">
          {time && (
            <>
              <ClockIcon />
              {time}
              {said && " · "}
            </>
          )}
          {said && <span className="truncate">{said}</span>}
        </span>
      </span>
    </Link>
  );
}

/** A shelf: its title with how many it stands for, "Alle" where a list shows all, and its recipes. */
export function ShelfRow({
  shelf,
  all,
  nameOf,
  from = "",
}: {
  shelf: Shelf;
  all: string | null;
  nameOf: (key: string | null) => string | null;
  /** What says where the recipes stand, for the way back: see `lib/origin.ts`. */
  from?: string;
}) {
  return (
    <section className="mt-9" aria-label={shelf.title}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="shelf-title">
          {shelf.title}{" "}
          <span className="text-base font-normal tracking-normal text-muted tabular-nums">
            {shelf.total}
          </span>
        </h2>
        {all && (
          <Link href={all} className="link min-h-11 shrink-0 text-sm">
            Alle anzeigen
          </Link>
        )}
      </div>
      {shelf.look === "list" ? (
        <div className="shelf-list mt-1">
          {shelf.recipes.map((recipe) => (
            <RecipeListRow
              key={recipe.id}
              recipe={recipe}
              category={nameOf(recipe.category)}
              note={shelf.why?.[recipe.id]}
              from={from}
            />
          ))}
        </div>
      ) : (
        <div className="shelf mt-1">
          {/* The card the library shows everywhere, a little wider on the shelf of the season. */}
          {shelf.recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              category={nameOf(recipe.category)}
              note={shelf.why?.[recipe.id]}
              from={from}
              className={shelf.look === "large" ? "w-72" : "w-60"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A few themes to browse, one row that scrolls sideways: filters put together into something
 * to cook, each saying what is behind it. The categories and every filter as tiles of their
 * own only repeated the panel of filters (October 2026).
 */
export function ThemeRow({
  themes,
  href,
}: {
  themes: readonly Theme[];
  href: (filter: RecipeFilter) => string;
}) {
  if (themes.length === 0) return null;
  return (
    <section className="mt-9" aria-label="Worauf habt ihr Lust?">
      <h2 className="shelf-title">Worauf habt ihr Lust?</h2>
      <ul className="shelf mt-2">
        {themes.map((theme) => (
          <li key={theme.key}>
            <Link
              href={href(theme.filter)}
              className={`theme-tile lift ${filterTone(theme.filter)}`}
            >
              <span className="badge size-12 rounded-2xl">
                <PictogramIcon name={theme.picture} className="h-[64%] w-[64%]" />
              </span>
              <span className="min-w-0">
                <span className="block leading-tight font-semibold">{theme.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">{theme.line}</span>
              </span>
              <span className="ml-auto self-start text-sm text-muted tabular-nums">
                {theme.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The tabs of Entdecken in one row that scrolls sideways: "Für euch", then every category with
 * enough recipes, each its own page of shelves. A tab changes the view in place: it does not
 * add a step to the history.
 */
export function CategoryTabsNav({
  tabs,
  current,
}: {
  tabs: readonly CategoryTab[];
  current: string | null;
}) {
  if (tabs.length === 0) return null;
  const tab = (key: string | null, label: string, picture: ReactNode) => (
    <Link
      key={key ?? "fuer-euch"}
      href={key ? `/rezepte?art=${key}` : "/rezepte"}
      replace
      scroll={false}
      transitionTypes={[SWAP]}
      className="chip"
      aria-current={current === key ? "page" : undefined}
    >
      {picture}
      {label}
    </Link>
  );
  return (
    <nav aria-label="Kategorien" className="tab-row mt-4">
      {tab(null, "Für euch", null)}
      {tabs.map((entry) =>
        tab(
          entry.key,
          entry.name,
          <PictogramIcon
            name={pictogramForFilter({ ...NO_FILTER, category: entry.key })}
            className="chip-picture"
          />,
        ),
      )}
    </nav>
  );
}

/** A tile of the row of features: a sign on its pastel, a name and what it does. */
export function FeatureTile({
  href,
  tone,
  picture,
  title,
  text,
}: {
  href: string;
  tone: string;
  picture: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} prefetch transitionTypes={[FORWARD]} className={`lift ${tone}`}>
      <SideCard picture={picture} title={title} text={text} />
    </Link>
  );
}

/**
 * The tags of one group inside a category, as a row of chips to narrow it down with: "Nach
 * Hauptzutat: Pilze 12, Lachs 7".
 */
export function ChipRow({
  title,
  chips,
  href,
}: {
  title: string;
  chips: readonly TagChip[];
  href: (tag: string) => string;
}) {
  if (chips.length === 0) return null;
  return (
    <section className="mt-6" aria-label={title}>
      <h2 className="eyebrow">{title}</h2>
      <ul className="tab-row mt-1.5">
        {chips.map((chip) => (
          <li key={chip.ref}>
            <Link href={href(chip.ref)} className="chip">
              <PictogramIcon
                name={pictogramForFilter({ ...NO_FILTER, tags: [chip.ref] })}
                className="chip-picture"
              />
              {chip.name}
              <span className="chip-count">{chip.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
