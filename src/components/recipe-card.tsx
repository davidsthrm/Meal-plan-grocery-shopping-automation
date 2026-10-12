import Link from "next/link";
import type { ReactNode } from "react";
import type { RecipeSummary } from "@/domain/library/summary";
import { servingsText } from "@/lib/recipe-text";
import { ClockIcon, HeartIcon } from "./icons";

/** What a card or a row says under the title: time and amount. */
export function RecipeFacts({ recipe }: { recipe: RecipeSummary }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      {recipe.prepMinutes !== null && (
        <span className="inline-flex items-center gap-1">
          <ClockIcon />
          {recipe.prepMinutes} Min.
        </span>
      )}
      {recipe.servings && (
        <span>{servingsText(recipe.servings.min, recipe.servings.max, recipe.servings.unit)}</span>
      )}
    </span>
  );
}

/** A recipe as a card on a shelf or in a grid. */
export function RecipeCard({
  recipe,
  category,
  className = "",
}: {
  recipe: RecipeSummary;
  /** The category as the household named it. */
  category: string | null;
  className?: string;
}) {
  return (
    <Link
      href={`/rezepte/${recipe.id}`}
      className={`card flex min-h-36 flex-col gap-2 p-4 transition-colors hover:border-muted ${className}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="eyebrow">{category ?? "Rezept"}</span>
        {recipe.isFavorite && (
          <span className="text-accent" title="Favorit">
            <HeartIcon filled />
          </span>
        )}
      </span>
      <span className="line-clamp-3 text-[1.1rem] leading-snug font-semibold">{recipe.title}</span>
      <span className="mt-auto space-y-1">
        <RecipeFacts recipe={recipe} />
        {recipe.sourceBook && (
          <span className="block truncate text-sm text-muted">{recipe.sourceBook}</span>
        )}
      </span>
    </Link>
  );
}

/** A recipe as a row of a list, with room for something to do with it. */
export function RecipeRow({
  recipe,
  category,
  note,
  children,
}: {
  recipe: RecipeSummary;
  category: string | null;
  /** A line under the facts, such as why the recipe is suggested. */
  note?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link href={`/rezepte/${recipe.id}`} className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{recipe.title}</span>
          {recipe.isFavorite && (
            <span className="shrink-0 text-accent" title="Favorit">
              <HeartIcon filled />
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          {category && <span>{category}</span>}
          <RecipeFacts recipe={recipe} />
        </span>
        {note && <span className="mt-0.5 block text-sm text-accent">{note}</span>}
      </Link>
      {children}
    </li>
  );
}
