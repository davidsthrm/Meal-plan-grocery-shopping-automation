import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { RecipeEditForm } from "@/components/recipe-edit-form";
import { normalizeName } from "@/domain/catalog";
import { UNITS } from "@/domain/units";
import { loadIngredientNames } from "@/server/catalog";
import { loadLibrary } from "@/server/library";
import { loadRecipeForm } from "@/server/recipes";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezept ändern" };

/** Changing a recipe by hand: title, kind, servings, and every ingredient line. */
export default async function EditRecipePage(props: PageProps<"/rezepte/[id]/bearbeiten">) {
  const { id } = await props.params;
  const db = await createSessionClient();
  const [recipe, library, catalog] = await Promise.all([
    loadRecipeForm(db, id),
    loadLibrary(db),
    loadIngredientNames(db),
  ]);
  if (!recipe) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/rezepte/${id}`}>Zum Rezept</BackLink>
      <h1 className="title mt-3 mb-5">Rezept ändern</h1>
      <RecipeEditForm
        recipeId={id}
        recipe={recipe}
        categories={library.categories}
        tagGroups={library.tagGroups}
        units={[...UNITS]}
        ingredientNames={catalog.map((ingredient) => ingredient.name)}
        knownNames={catalog.flatMap((ingredient) =>
          [ingredient.name, ...ingredient.synonyms].map(normalizeName),
        )}
      />
    </div>
  );
}
