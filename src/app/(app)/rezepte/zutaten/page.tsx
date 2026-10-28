import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { FridgeFinder, type FridgeItem } from "@/components/fridge-finder";
import { ListMemory } from "@/components/list-return";
import { foodCounts } from "@/domain/library/fridge";
import { pictogramFor } from "@/domain/library/pictogram";
import { recipeTone } from "@/lib/plan-text";
import { timeText } from "@/lib/recipe-text";
import { loadFridge } from "@/server/library";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Was ist noch da?" };

/**
 * "Was ist noch da?": tap what is left in the fridge or from the week, and the recipes that
 * use most of it come first, each saying what is still missing. Favourites are among them:
 * what is there to use up is the question, not what is new.
 */
export default async function FridgePage(props: PageProps<"/rezepte/zutaten">) {
  const params = await props.searchParams;
  const db = await createSessionClient();
  const { foods, recipes } = await loadFridge(db);
  const asked = [params.z ?? []].flat();
  const items: FridgeItem[] = recipes
    .filter((recipe) => recipe.uses.length > 0)
    .map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      kind: recipeTone(recipe)?.className ?? "kind-none",
      picture: pictogramFor(recipe),
      time: timeText(recipe),
      uses: recipe.uses,
    }));

  return (
    <div className="mx-auto max-w-5xl">
      <ListMemory />
      <BackLink href="/rezepte">Entdecken</BackLink>
      <h1 className="title mt-2">Was ist noch da?</h1>
      <FridgeFinder
        foods={foods}
        counts={foodCounts(items, foods.length)}
        recipes={items}
        initial={asked.map((name) => foods.indexOf(name)).filter((food) => food >= 0)}
      />
    </div>
  );
}
