import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PictogramIcon } from "@/components/pictogram";
import { RecipeStack, type StackCard } from "@/components/recipe-stack";
import { addDays } from "@/domain/dates";
import { categoryTabs } from "@/domain/library/discover";
import { NO_FILTER } from "@/domain/library/filter";
import { pictogramFor, pictogramForFilter } from "@/domain/library/pictogram";
import { sourceLabel } from "@/domain/library/source";
import { SKIP_DAYS, stackOf, stackWhy } from "@/domain/library/stack";
import { recipeTone } from "@/lib/plan-text";
import { timeText } from "@/lib/recipe-text";
import { dayOf, today } from "@/lib/today";
import { SWAP } from "@/lib/transitions";
import { allRows, must } from "@/server/catalog";
import { productName } from "@/domain/import/tidy-proposals";
import { loadLibraryForLists } from "@/server/recipe-list";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezept-Stapel" };

/** How many cards are dealt at once: the stack is dealt anew when the page is read again. */
const DEAL = 40;
/** The tags a card shows: what it is made of and for. */
const CARD_GROUPS = new Set(["Hauptzutat", "Gericht", "Küche", "Anlass"]);

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The recipe stack: recipes nobody cooked or marked yet, one card at a time, to keep as a wish,
 * put aside for four weeks, or plan. All meals, or the recipes of one category.
 */
export default async function StackPage(props: PageProps<"/rezepte/stapel">) {
  const params = await props.searchParams;
  const now = today();
  const db = await createSessionClient();
  const since = addDays(now, -SKIP_DAYS);
  const [library, asideRows] = await Promise.all([
    loadLibraryForLists(db, now),
    // Only what was put aside lately: older marks no longer keep a recipe out.
    allRows(
      (from, to) =>
        db
          .from("recipe")
          .select("id, skipped_at")
          .gte("skipped_at", since)
          .order("id")
          .range(from, to),
      "load recipes put aside",
    ),
  ]);
  const { recipes, categories, tagGroups, history } = library;
  const skipped = new Map(
    asideRows.flatMap((row) => (row.skipped_at ? [[row.id, dayOf(row.skipped_at)] as const] : [])),
  );
  const tabs = categoryTabs(recipes, categories);
  const category = tabs.find((tab) => tab.key === one(params.art))?.key ?? null;
  const categoryName = new Map(categories.map((entry) => [entry.key, entry.name]));
  const tagName = new Map(
    tagGroups
      .filter((group) => CARD_GROUPS.has(group.name))
      .flatMap((group) => group.tags.map((tag) => [tag.ref, tag.name] as const)),
  );
  const stack = stackOf(recipes, { today: now, history, skipped, category });
  const dealt = stack.slice(0, DEAL);
  // What is in each card's recipe, without what is always at home: what decides it.
  const lineRows = dealt.length
    ? must(
        await db
          .from("recipe_ingredient")
          .select("recipe_id, position, original_text, ingredient(name, is_pantry_staple)")
          .in(
            "recipe_id",
            dealt.map((recipe) => recipe.id),
          )
          .order("position"),
        "load the ingredients of the stack",
      )
    : [];
  const ingredientsOf = new Map<string, string[]>();
  for (const line of lineRows) {
    if (line.ingredient?.is_pantry_staple) continue;
    const name = line.ingredient?.name ?? productName(line.original_text);
    const own = ingredientsOf.get(line.recipe_id) ?? [];
    if (name && !own.includes(name)) own.push(name);
    ingredientsOf.set(line.recipe_id, own);
  }
  const cards: StackCard[] = dealt.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    category: (recipe.category && categoryName.get(recipe.category)) || "Rezept",
    kind: recipeTone(recipe)?.className ?? "kind-none",
    picture: pictogramFor(recipe),
    why: stackWhy(recipe, now),
    facts: [
      timeText(recipe),
      recipe.sourceBook && sourceLabel(recipe.sourceBook, recipe.sourceEdition),
    ]
      .filter(Boolean)
      .join(" · "),
    tags: recipe.tags.flatMap((tag) => tagName.get(tag) ?? []).slice(0, 3),
    ingredients: ingredientsOf.get(recipe.id) ?? [],
  }));
  const choice = (key: string | null, label: string) => (
    <Link
      key={key ?? "alle"}
      href={key ? `/rezepte/stapel?art=${key}` : "/rezepte/stapel"}
      replace
      transitionTypes={[SWAP]}
      className="chip"
      aria-current={category === key ? "page" : undefined}
    >
      {key && (
        <PictogramIcon
          name={pictogramForFilter({ ...NO_FILTER, category: key })}
          className="chip-picture"
        />
      )}
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/rezepte">Entdecken</BackLink>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4">
        <h1 className="title">Rezept-Stapel</h1>
        <p className="text-sm text-muted">Noch nie gekocht · {stack.length}</p>
      </div>
      <nav aria-label="Welche Rezepte" className="tab-row mt-3">
        {choice(null, "Alle Gerichte")}
        {tabs.map((tab) => choice(tab.key, tab.name))}
      </nav>
      {/* A new stack for each choice: its cards are dealt by the server. */}
      <RecipeStack key={category ?? "alle"} cards={cards} />
    </div>
  );
}
