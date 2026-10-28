import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { ListMemory } from "@/components/list-return";
import { RecipeRoulette, type ReelFace, type RouletteRecipe } from "@/components/recipe-roulette";
import { NO_FILTER } from "@/domain/library/filter";
import { pictogramFor, pictogramForFilter } from "@/domain/library/pictogram";
import { combinations, comboKey } from "@/domain/library/roulette";
import { EFFORT_NAME, EFFORTS } from "@/domain/library/tags";
import { rank } from "@/domain/rank";
import { recipeTone } from "@/lib/plan-text";
import { timeText } from "@/lib/recipe-text";
import { today } from "@/lib/today";
import { loadLibraryForLists } from "@/server/recipe-list";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezept-Roulette" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The recipe roulette: main ingredient, cuisine and effort drawn by chance from what the
 * library has, and the meals that are that combination. An answer to "no idea what to cook".
 */
export default async function RoulettePage(props: PageProps<"/rezepte/roulette">) {
  const params = await props.searchParams;
  const now = today();
  const db = await createSessionClient();
  const { recipes, tagGroups } = await loadLibraryForLists(db, now);
  // The day's first combination is the same on every look; a spin draws another.
  const combos = combinations(recipes, tagGroups).sort(
    (a, b) => rank(now, comboKey(a)) - rank(now, comboKey(b)),
  );
  const used = new Set(combos.flatMap((combo) => combo.recipes));
  const listed: Record<string, RouletteRecipe> = Object.fromEntries(
    recipes
      .filter((recipe) => used.has(recipe.id))
      .map((recipe) => [
        recipe.id,
        {
          title: recipe.title,
          kind: recipeTone(recipe)?.className ?? "kind-none",
          picture: pictogramFor(recipe),
          time: timeText(recipe),
        },
      ]),
  );
  const faces: Record<string, ReelFace> = Object.fromEntries([
    ...tagGroups
      .filter((group) => group.name === "Hauptzutat" || group.name === "Küche")
      .flatMap((group) => group.tags)
      .map((tag) => [
        tag.ref,
        { name: tag.name, picture: pictogramForFilter({ ...NO_FILTER, tags: [tag.ref] }) },
      ]),
    ...EFFORTS.map((effort) => [
      effort,
      { name: EFFORT_NAME[effort], picture: pictogramForFilter({ ...NO_FILTER, tags: [effort] }) },
    ]),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <ListMemory />
      <BackLink href="/rezepte">Entdecken</BackLink>
      <h1 className="title mt-2">Rezept-Roulette</h1>
      <RecipeRoulette
        combos={combos}
        faces={faces}
        recipes={listed}
        initial={one(params.k) ?? null}
      />
    </div>
  );
}
