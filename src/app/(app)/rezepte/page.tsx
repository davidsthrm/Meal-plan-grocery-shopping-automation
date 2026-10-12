import type { Metadata } from "next";
import Link from "next/link";
import { servingsText, sourceText } from "@/lib/recipe-text";
import { must } from "@/server/catalog";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezepte" };

export default async function RecipesPage() {
  const db = await createSessionClient();
  const [recipeRows, categories, links] = await Promise.all([
    db
      .from("recipe")
      .select(
        "id, title, source_book, source_page, servings_min, servings_max, servings_unit, prep_minutes, status",
      )
      .order("title"),
    db.from("tag").select("id, name").eq("group_name", "Kategorie").order("sort_order"),
    db.from("recipe_tag").select("recipe_id, tag_id"),
  ]);
  const recipes = must(recipeRows, "load recipes");
  const waiting = recipes.filter((recipe) => recipe.status === "needs_review").length;
  const approved = recipes.filter((recipe) => recipe.status === "approved");

  // Every recipe is listed once: under its category, or under "ohne Kategorie".
  const categoryRows = must(categories, "load categories");
  const categoryIds = new Set(categoryRows.map((category) => category.id));
  const categoryOf = new Map(
    must(links, "load recipe categories")
      .filter((link) => categoryIds.has(link.tag_id))
      .map((link) => [link.recipe_id, link.tag_id]),
  );
  const sections = [
    ...categoryRows.map((category) => ({
      name: category.name,
      recipes: approved.filter((recipe) => categoryOf.get(recipe.id) === category.id),
    })),
    { name: "Ohne Kategorie", recipes: approved.filter((recipe) => !categoryOf.has(recipe.id)) },
  ].filter((section) => section.recipes.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Rezepte</h1>
        <p className="text-muted">{approved.length} im Kochbuch</p>
      </div>

      {waiting > 0 && (
        <Link
          href="/import/pruefen"
          className="mt-4 block rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn"
        >
          {waiting === 1 ? "1 Rezept wartet" : `${waiting} Rezepte warten`} auf deine Prüfung
        </Link>
      )}

      {approved.length === 0 && (
        <p className="mt-8 text-muted">
          Noch keine Rezepte. Unter{" "}
          <Link href="/import" className="font-semibold text-accent underline">
            Import
          </Link>{" "}
          kannst du Kochbuchseiten fotografieren und einlesen lassen.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.name} className="mt-6">
          <h2 className="mb-2 flex items-baseline justify-between text-lg font-semibold">
            {section.name}
            <span className="text-sm font-normal text-muted">{section.recipes.length}</span>
          </h2>
          <ul className="card divide-y divide-line">
            {section.recipes.map((recipe) => (
              <li key={recipe.id}>
                <Link
                  href={`/rezepte/${recipe.id}`}
                  className="block px-4 py-3 hover:bg-accent-soft"
                >
                  <span className="block font-semibold">{recipe.title}</span>
                  <span className="block text-sm text-muted">
                    {[
                      sourceText(recipe.source_book, recipe.source_page),
                      servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit),
                      recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
