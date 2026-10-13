import type { Metadata } from "next";
import Link from "next/link";
import { WishIcon } from "@/components/icons";
import { PictogramIcon } from "@/components/pictogram";
import { RecipeCard } from "@/components/recipe-card";
import { RecipeFilterBar } from "@/components/recipe-filter";
import { byCategory } from "@/domain/library/discover";
import { filterRecipes, isNoFilter, readFilter } from "@/domain/library/filter";
import { pictogramFor } from "@/domain/library/pictogram";
import { FROM_FAVORITES } from "@/lib/origin";
import { loadLibrary, searchLibrary } from "@/server/library";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Favoriten" };

/**
 * The household's favourites, sorted by what they are, and on top what someone wants to cook
 * soon. The search and the filters look through the favourites only.
 */
export default async function FavoritesPage(props: PageProps<"/favoriten">) {
  const params = await props.searchParams;
  const filter = { ...readFilter(params), favorites: true };
  const db = await createSessionClient();
  const library = await loadLibrary(db);
  const { recipes, categories, books, tagGroups } = library;
  const categoryName = new Map(categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);

  const favorites = recipes.filter((recipe) => recipe.isFavorite);
  const wishes = recipes.filter((recipe) => recipe.wanted);
  const browsing = isNoFilter({ ...filter, favorites: false });
  const found = filter.text.trim() === "" ? null : await searchLibrary(db, library, filter);
  const listed = found ? found.matches : filterRecipes(recipes, filter);
  const groups = byCategory(listed, categories);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">
        {favorites.length === 1 ? "1 Favorit" : `${favorites.length} Favoriten`}
      </p>
      <h1 className="title mt-1">Favoriten</h1>

      {browsing && wishes.length > 0 && (
        <section className="mt-6" aria-label="Möchte ich kochen">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="text-accent">
              <WishIcon filled />
            </span>
            Möchte ich kochen
          </h2>
          <p className="mt-1 text-sm text-muted">
            Wird für die nächsten Wochen zuerst vorgeschlagen, bis es eingeplant ist.
          </p>
          <div className="shelf mt-2">
            {wishes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                category={nameOf(recipe.category)}
                className="w-60"
                from={FROM_FAVORITES}
              />
            ))}
          </div>
        </section>
      )}

      {favorites.length === 0 ? (
        <p className="mt-8 text-muted">
          Noch keine Favoriten. Auf jedem Rezept gibt es dafür das Herz:{" "}
          <Link href="/rezepte" className="link underline">
            Rezepte entdecken
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6">
          <RecipeFilterBar
            path="/favoriten"
            filter={filter}
            categories={categories}
            books={books}
            tagGroups={tagGroups}
            favoritesOnly
          />
        </div>
      )}

      {!browsing && (
        <p className="mt-5 text-muted" role="status">
          {listed.length === 0
            ? "Kein Favorit passt dazu."
            : listed.length === 1
              ? "1 Favorit passt dazu"
              : `${listed.length} Favoriten passen dazu`}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.key ?? "ohne"} className="mt-7" aria-label={group.name}>
          <h2 className="flex items-center gap-2.5 border-b border-line pb-2 text-xl font-bold tracking-tight">
            <span className="badge h-8 w-8">
              <PictogramIcon
                name={pictogramFor({ title: "", category: group.key, proteinType: null, tags: [] })}
                className="h-[68%] w-[68%]"
              />
            </span>
            {group.name}
            <span className="text-base font-normal text-muted">{group.recipes.length}</span>
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                category={nameOf(recipe.category)}
                from={FROM_FAVORITES}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
