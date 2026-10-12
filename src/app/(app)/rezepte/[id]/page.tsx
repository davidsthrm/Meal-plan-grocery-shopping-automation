import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { amountText, servingsText, sourceText } from "@/lib/recipe-text";
import { must } from "@/server/catalog";
import { viewUrls } from "@/server/import/storage";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezept" };

export default async function RecipePage(props: PageProps<"/rezepte/[id]">) {
  const { id } = await props.params;
  const db = await createSessionClient();
  // Row level security decides whether this recipe exists for the person asking.
  const { data: recipe } = await db
    .from("recipe")
    .select(
      "id, title, source_title, source_book, source_page, servings_min, servings_max, servings_unit, prep_minutes, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!recipe) notFound();

  const [lines, photos, ingredients, tagLinks, categories] = await Promise.all([
    db
      .from("recipe_ingredient")
      .select(
        "id, position, ingredient_id, quantity, quantity_max, unit, is_optional, alternative_to, original_text, note",
      )
      .eq("recipe_id", id)
      .order("position"),
    db
      .from("recipe_photo")
      .select("storage_path, sort_order")
      .eq("recipe_id", id)
      .order("sort_order"),
    db.from("ingredient").select("id, name"),
    db.from("recipe_tag").select("tag_id").eq("recipe_id", id),
    db.from("tag").select("id, name").eq("group_name", "Kategorie"),
  ]);
  const ownTags = new Set(must(tagLinks, "load recipe tags").map((link) => link.tag_id));
  const category = must(categories, "load categories").find((tag) => ownTags.has(tag.id));
  const names = new Map(must(ingredients, "load ingredients").map((i) => [i.id, i.name]));
  const photoPaths = must(photos, "load photos").map((photo) => photo.storage_path);
  const urls = await viewUrls(photoPaths);
  const source = sourceText(recipe.source_book, recipe.source_page);

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/rezepte" className="text-sm font-semibold text-accent">
        ← Alle Rezepte
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{recipe.title}</h1>
      <p className="mt-1 text-muted">
        {[
          category?.name ?? null,
          servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit),
          recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
          source || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Zutaten</h2>
      <ul className="card divide-y divide-line">
        {must(lines, "load lines").map((line) => (
          <li key={line.id} className="flex gap-3 px-4 py-2">
            <span className="w-24 shrink-0 text-right text-muted">
              {amountText(line.quantity, line.quantity_max, line.unit)}
            </span>
            <span>
              {line.ingredient_id ? names.get(line.ingredient_id) : line.original_text}
              {line.note && <span className="text-muted">, {line.note}</span>}
              {line.alternative_to && <span className="text-muted"> (Alternative)</span>}
              {line.is_optional && <span className="text-muted"> (nach Belieben)</span>}
            </span>
          </li>
        ))}
      </ul>

      {photoPaths.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Aus dem Kochbuch</h2>
          <div className="space-y-3">
            {photoPaths.map((path, i) => (
              <a key={path} href={urls[path]} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img
                  src={urls[path]}
                  alt={`Seite ${i + 1} von ${recipe.title}`}
                  className="w-full rounded-lg border border-line"
                />
              </a>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
