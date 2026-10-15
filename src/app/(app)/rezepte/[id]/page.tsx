import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteHeart } from "@/components/favorite-heart";
import { PenIcon, TickIcon, WishIcon } from "@/components/icons";
import { RecipeBadge } from "@/components/recipe-card";
import { SubmitButton } from "@/components/submit-button";
import type { ProteinType } from "@/domain/library/summary";
import { weekdayLong } from "@/domain/dates";
import { TAG_GROUPS } from "@/domain/library/tags";
import {
  amountText,
  ingredientText,
  lastCookedText,
  servingsText,
  sourceText,
} from "@/lib/recipe-text";
import { loadIngredientNames, must } from "@/server/catalog";
import { viewUrls } from "@/server/import/storage";
import { readOrigin } from "@/lib/origin";
import { MEAL_NAME } from "@/lib/plan-text";
import { today } from "@/lib/today";
import { loadLastCooked, loadPlannedAt } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { setFavorite, setWanted } from "../actions";

export const metadata: Metadata = { title: "Rezept" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function RecipePage(props: PageProps<"/rezepte/[id]">) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const back = readOrigin(one(query.von), one(query.w), { recipeId: id, field: one(query.feld) });
  const db = await createSessionClient();
  // Row level security decides whether this recipe exists for the person asking.
  const { data: recipe } = await db
    .from("recipe")
    .select(
      "id, title, source_title, source_book, source_page, servings_min, servings_max, servings_unit, prep_minutes, protein_type, status, is_favorite, wanted_at, source_text",
    )
    .eq("id", id)
    .maybeSingle();
  if (!recipe) notFound();

  const now = today();
  const [lines, photos, ingredients, tagLinks, categories, planned, cooked] = await Promise.all([
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
    db.from("tag").select("id, key, name, group_name").order("sort_order"),
    loadPlannedAt(db, id, now),
    loadLastCooked(db, id, now),
  ]);
  const ownIds = new Set(must(tagLinks, "load recipe tags").map((link) => link.tag_id));
  const ownTags = must(categories, "load tags").filter((tag) => ownIds.has(tag.id));
  const category = ownTags.find((tag) => tag.group_name === "Kategorie");
  // What else describes the recipe, in the order of the groups.
  const described = TAG_GROUPS.flatMap((group) =>
    ownTags.filter((tag) => tag.group_name === group),
  ).map((tag) => ({ ref: tag.key ?? tag.id, name: tag.name }));
  const wanted = recipe.wanted_at !== null;
  const catalog = new Map(ingredients.map((i) => [i.id, i]));
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
      <Link href={back.href} className="link text-sm">
        ← {back.label}
      </Link>
      <div className="mt-3 flex items-start gap-3.5">
        <RecipeBadge
          recipe={{
            title: recipe.title,
            category: category?.key ?? null,
            proteinType: recipe.protein_type as ProteinType | null,
            tags: described.map((tag) => tag.ref),
          }}
          className="mt-1 h-14 w-14 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          {category && <p className="eyebrow">{category.name}</p>}
          <h1 className="title mt-1">{recipe.title}</h1>
        </div>
        {recipe.status === "approved" && (
          // The same heart as in the corner of a recipe card.
          <form action={setFavorite} className="-mr-2 shrink-0">
            <input type="hidden" name="recipe" value={recipe.id} />
            <input type="hidden" name="favorite" value={recipe.is_favorite ? "0" : "1"} />
            <FavoriteHeart favorite={recipe.is_favorite} title={recipe.title} />
          </form>
        )}
      </div>
      <p className="mt-3 text-muted">
        {[
          servingsText(recipe.servings_min, recipe.servings_max, recipe.servings_unit),
          recipe.prep_minutes ? `${recipe.prep_minutes} Min.` : null,
          source || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-1 text-sm text-muted">{lastCookedText(cooked, now)}</p>

      {described.length > 0 && (
        <ul aria-label="Stichworte" className="mt-3 flex flex-wrap gap-1.5">
          {described.map((tag) => (
            <li key={tag.ref}>
              <Link href={`/rezepte?tag=${tag.ref}`} className="tag min-h-7 px-2.5 hover:underline">
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {recipe.status === "approved" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {planned ? (
            // On this week's plan already: the button says so and leads to where it stands.
            <Link
              href={
                planned.date
                  ? `/woche?w=${planned.week}#tag-${planned.date}`
                  : `/woche?w=${planned.week}&t=extra`
              }
              className="btn border-line bg-line text-accent"
              title={
                planned.date
                  ? `${weekdayLong(planned.date)}, ${MEAL_NAME[planned.meal]}`
                  : "Außerdem in dieser Woche"
              }
            >
              <TickIcon />
              Eingeplant
            </Link>
          ) : (
            <Link href={`/woche?rezept=${recipe.id}`} className="btn btn-primary">
              Einplanen
            </Link>
          )}
          <form action={setWanted}>
            <input type="hidden" name="recipe" value={recipe.id} />
            <input type="hidden" name="wanted" value={wanted ? "0" : "1"} />
            <SubmitButton className={`btn ${wanted ? "border-accent text-accent" : ""}`}>
              <WishIcon filled={wanted} />
              {wanted ? "Steht auf der Wunschliste" : "Möchte ich kochen"}
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="mt-6 mb-2 flex items-center gap-1">
        <h2 className="text-xl font-bold tracking-tight">Zutaten</h2>
        {recipe.status === "approved" && (
          // Changing the recipe means above all its ingredients: the pen stands next to them.
          <Link
            href={`/rezepte/${recipe.id}/bearbeiten`}
            className="-my-1.5 flex size-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent"
            aria-label="Rezept ändern"
            title="Rezept ändern"
          >
            <PenIcon />
          </Link>
        )}
      </div>
      <ul className="card divide-y divide-line">
        {must(lines, "load lines").map((line) => {
          const known = line.ingredient_id ? catalog.get(line.ingredient_id) : undefined;
          return (
            <li key={line.id} className="flex gap-3 px-4 py-2">
              <span className="w-24 shrink-0 text-right text-muted">
                {amountText(line.quantity, line.quantity_max, line.unit)}
              </span>
              <span>
                {known
                  ? ingredientText(known, line.quantity, line.quantity_max, line.unit)
                  : line.original_text}
                {line.note && <span className="text-muted">, {line.note}</span>}
                {line.alternative_to && <span className="text-muted"> (Alternative)</span>}
                {line.is_optional && <span className="text-muted"> (nach Belieben)</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {recipe.source_text && (
        // A recipe that came in as text has no photo. Its text is kept as it was pasted.
        <details className="group card mt-6">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            Zubereitung und Originaltext
            <span className="text-sm font-semibold text-accent">
              <span className="group-open:hidden">Ansehen</span>
              <span className="hidden group-open:inline">Ausblenden</span>
            </span>
          </summary>
          <p className="border-t border-line p-4 whitespace-pre-wrap">{recipe.source_text}</p>
        </details>
      )}

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
