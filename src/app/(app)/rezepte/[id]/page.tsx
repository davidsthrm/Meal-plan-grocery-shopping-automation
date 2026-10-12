import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeartIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { amountText, servingsText, sourceText } from "@/lib/recipe-text";
import { loadIngredientNames, must } from "@/server/catalog";
import { viewUrls } from "@/server/import/storage";
import { createSessionClient } from "@/server/supabase/server";
import { setFavorite } from "../actions";

export const metadata: Metadata = { title: "Rezept" };

export default async function RecipePage(props: PageProps<"/rezepte/[id]">) {
  const { id } = await props.params;
  const db = await createSessionClient();
  // Row level security decides whether this recipe exists for the person asking.
  const { data: recipe } = await db
    .from("recipe")
    .select(
      "id, title, source_title, source_book, source_page, servings_min, servings_max, servings_unit, prep_minutes, status, is_favorite",
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
      .select("storage_path, crop_path, sort_order")
      .eq("recipe_id", id)
      .order("sort_order"),
    loadIngredientNames(db),
    db.from("recipe_tag").select("tag_id").eq("recipe_id", id),
    db.from("tag").select("id, name").eq("group_name", "Kategorie"),
  ]);
  const ownTags = new Set(must(tagLinks, "load recipe tags").map((link) => link.tag_id));
  const category = must(categories, "load categories").find((tag) => ownTags.has(tag.id));
  const names = new Map(ingredients.map((i) => [i.id, i.name]));
  const photoRows = must(photos, "load photos");
  const urls = await viewUrls(
    photoRows.flatMap((photo) => [
      photo.storage_path,
      ...(photo.crop_path ? [photo.crop_path] : []),
    ]),
  );
  const source = sourceText(recipe.source_book, recipe.source_page);

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/rezepte" className="link text-sm">
        ← Entdecken
      </Link>
      {category && <p className="eyebrow mt-3">{category.name}</p>}
      <h1 className="title mt-1">{recipe.title}</h1>
      <p className="mt-2 text-muted">
        {[
          servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit),
          recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
          source || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {recipe.status === "approved" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/woche?rezept=${recipe.id}`} className="btn btn-primary">
            Einplanen
          </Link>
          <Link href={`/rezepte/${recipe.id}/bearbeiten`} className="btn">
            Ändern
          </Link>
          <form action={setFavorite}>
            <input type="hidden" name="recipe" value={recipe.id} />
            <input type="hidden" name="favorite" value={recipe.is_favorite ? "0" : "1"} />
            <SubmitButton className={`btn ${recipe.is_favorite ? "text-accent" : ""}`}>
              <HeartIcon filled={recipe.is_favorite} />
              {recipe.is_favorite ? "Favorit" : "Als Favorit merken"}
            </SubmitButton>
          </form>
        </div>
      )}

      <h2 className="mt-6 mb-2 text-xl font-bold tracking-tight">Zutaten</h2>
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

      {photoRows.length > 0 && (
        // Folded away: the ingredients above are what is cooked from. The page is there to
        // look something up, turned upright and cut to this recipe where it shares the page.
        <details className="group card mt-6">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            Originalfoto
            <span className="text-sm font-semibold text-accent">
              <span className="group-open:hidden">Ansehen</span>
              <span className="hidden group-open:inline">Ausblenden</span>
            </span>
          </summary>
          <div className="space-y-4 border-t border-line p-4">
            {photoRows.map((photo, i) => (
              <figure key={photo.storage_path}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img
                  src={urls[photo.crop_path ?? photo.storage_path]}
                  alt={`Seite ${i + 1} von ${recipe.title}`}
                  loading="lazy"
                  className="w-full rounded-lg border border-line"
                />
                <figcaption className="mt-2">
                  <a
                    href={urls[photo.storage_path]}
                    target="_blank"
                    rel="noreferrer"
                    className="link text-sm"
                  >
                    {photo.crop_path ? "Ganze Seite ansehen" : "In voller Größe ansehen"}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
