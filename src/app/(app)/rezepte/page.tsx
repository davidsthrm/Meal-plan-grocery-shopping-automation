import type { Metadata } from "next";
import Link from "next/link";
import { servingsText, sourceText } from "@/lib/recipe-text";
import { must } from "@/server/catalog";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezepte" };

export default async function RecipesPage() {
  const db = await createSessionClient();
  const recipes = must(
    await db
      .from("recipe")
      .select(
        "id, title, source_book, source_page, servings_min, servings_max, prep_minutes, status",
      )
      .order("title"),
    "load recipes",
  );
  const waiting = recipes.filter((recipe) => recipe.status === "needs_review").length;
  const approved = recipes.filter((recipe) => recipe.status === "approved");

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

      {approved.length === 0 ? (
        <p className="mt-8 text-muted">
          Noch keine Rezepte. Unter{" "}
          <Link href="/import" className="font-semibold text-accent underline">
            Import
          </Link>{" "}
          kannst du Kochbuchseiten fotografieren und einlesen lassen.
        </p>
      ) : (
        <ul className="card mt-4 divide-y divide-line">
          {approved.map((recipe) => (
            <li key={recipe.id}>
              <Link href={`/rezepte/${recipe.id}`} className="block px-4 py-3 hover:bg-accent-soft">
                <span className="block font-semibold">{recipe.title}</span>
                <span className="block text-sm text-muted">
                  {[
                    sourceText(recipe.source_book, recipe.source_page),
                    `${servingsText(recipe.servings_min, recipe.servings_max)} Portionen`,
                    recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
