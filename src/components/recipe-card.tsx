import Link from "next/link";
import type { ReactNode } from "react";
import { pictogramFor } from "@/domain/library/pictogram";
import type { RecipeSummary } from "@/domain/library/summary";
import { recipeTone } from "@/lib/plan-text";
import { servingsText, timeText } from "@/lib/recipe-text";
import { ClockIcon, HeartIcon, WishIcon } from "./icons";
import { PictogramIcon } from "./pictogram";

/** What a card or a row says under the title: time and amount. */
export function RecipeFacts({ recipe }: { recipe: RecipeSummary }) {
  // Half the cookbooks print no time. Their recipes say how much work they are instead.
  const time = timeText(recipe);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      {time && (
        <span className="inline-flex items-center gap-1">
          <ClockIcon />
          {time}
        </span>
      )}
      {recipe.servings && (
        <span>{servingsText(recipe.servings.min, recipe.servings.max, recipe.servings.unit)}</span>
      )}
    </span>
  );
}

/** A recipe's pictogram on the pastel of its kind: what tells two rows apart at a glance. */
export function RecipeBadge({
  recipe,
  className = "h-10 w-10",
}: {
  recipe: Pick<RecipeSummary, "title" | "category" | "proteinType" | "tags">;
  className?: string;
}) {
  return (
    <span className={`badge ${recipeTone(recipe)?.className ?? ""} ${className}`}>
      <PictogramIcon name={pictogramFor(recipe)} className="h-[68%] w-[68%]" />
    </span>
  );
}

/** The marks a recipe carries: favourite, and wanted for one of the next weeks. */
function Marks({ recipe }: { recipe: RecipeSummary }) {
  if (!recipe.isFavorite && !recipe.wanted) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-accent">
      {recipe.wanted && (
        <span title="Möchte ich kochen">
          <WishIcon filled />
        </span>
      )}
      {recipe.isFavorite && (
        <span title="Favorit">
          <HeartIcon filled />
        </span>
      )}
    </span>
  );
}

/** A recipe as a card on a shelf or in a grid. */
export function RecipeCard({
  recipe,
  category,
  className = "",
  from = "",
}: {
  recipe: RecipeSummary;
  /** The category as the household named it. */
  category: string | null;
  className?: string;
  /** What says where the card stands, for the way back: see `lib/origin.ts`. */
  from?: string;
}) {
  const tone = recipeTone(recipe);
  return (
    <Link
      href={`/rezepte/${recipe.id}${from}`}
      className={`card lift relative flex min-h-44 flex-col overflow-hidden ${tone?.className ?? ""} ${className}`}
    >
      {/* A band in the colour of the kind: a shelf can be read at a glance. */}
      <span aria-hidden className="h-1.5 bg-(--kind,var(--color-line))" />
      <PictogramIcon name={pictogramFor(recipe)} className="watermark" />
      <span className="relative flex flex-1 flex-col gap-2 p-4">
        <span className="flex items-start justify-between gap-2">
          <span className="eyebrow">{category ?? "Rezept"}</span>
          <Marks recipe={recipe} />
        </span>
        <span className="line-clamp-3 text-[1.1rem] leading-snug font-semibold">
          {recipe.title}
        </span>
        <span className="mt-auto space-y-1.5 pt-2">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {tone?.label && <span className="tag">{tone.label}</span>}
            <RecipeFacts recipe={recipe} />
          </span>
          {recipe.sourceBook && (
            <span className="block truncate pr-16 text-sm text-muted">{recipe.sourceBook}</span>
          )}
        </span>
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
      <Link href={`/rezepte/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <RecipeBadge recipe={recipe} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{recipe.title}</span>
            <Marks recipe={recipe} />
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {category && <span>{category}</span>}
            <RecipeFacts recipe={recipe} />
          </span>
          {note && <span className="mt-0.5 block text-sm text-accent">{note}</span>}
        </span>
      </Link>
      {children}
    </li>
  );
}
