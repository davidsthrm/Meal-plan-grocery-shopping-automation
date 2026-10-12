import "server-only";
import type { ImportIssue } from "@/domain/import/checks";
import { isUnit, type Unit } from "@/domain/units";
import { must, type Db } from "../catalog";
import type { Database } from "../supabase/database.types";

/**
 * Proposals are ingredients that imported recipes use and the catalog does not know. The
 * household decides for each: it is another name for something in the catalog, it is a new
 * ingredient, or it is not wanted.
 */

type BuyingMode = Database["public"]["Enums"]["buying_mode"];

export interface OpenProposal {
  id: string;
  name: string;
  /** Recipes that wait for this decision. */
  recipeTitles: string[];
  sameAsIngredientId: string | null;
  aisleGroupId: string;
  shopId: string;
  defaultUnit: Unit;
  buyingMode: BuyingMode;
  packSize: number | null;
  isPantryStaple: boolean;
  shelfLifeDays: number | null;
}

export async function loadOpenProposals(db: Db): Promise<OpenProposal[]> {
  const proposals = must(
    await db
      .from("ingredient_proposal")
      .select(
        "id, name, same_as_ingredient_id, aisle_group_id, preferred_shop_id, default_unit, buying_mode, pack_size, is_pantry_staple, shelf_life_days",
      )
      .eq("status", "open")
      .order("name"),
    "load proposals",
  );
  if (proposals.length === 0) return [];
  const lines = must(
    await db
      .from("recipe_ingredient")
      .select("proposal_id, recipe_id")
      .in(
        "proposal_id",
        proposals.map((p) => p.id),
      ),
    "load lines waiting for proposals",
  );
  const recipes = must(
    await db
      .from("recipe")
      .select("id, title")
      .in("id", [...new Set(lines.map((l) => l.recipe_id))]),
    "load recipes waiting for proposals",
  );
  const titleOf = new Map(recipes.map((recipe) => [recipe.id, recipe.title]));
  return proposals.map((p) => ({
    id: p.id,
    name: p.name,
    recipeTitles: [
      ...new Set(
        lines.filter((l) => l.proposal_id === p.id).map((l) => titleOf.get(l.recipe_id) ?? ""),
      ),
    ].filter(Boolean),
    sameAsIngredientId: p.same_as_ingredient_id,
    aisleGroupId: p.aisle_group_id,
    shopId: p.preferred_shop_id,
    defaultUnit: p.default_unit,
    buyingMode: p.buying_mode,
    packSize: p.pack_size,
    isPantryStaple: p.is_pantry_staple,
    shelfLifeDays: p.shelf_life_days,
  }));
}

/** Points every recipe line that waited for the proposal at the ingredient it became. */
async function resolve(db: Db, proposalId: string, ingredientId: string): Promise<void> {
  const linked = await db
    .from("recipe_ingredient")
    .update({ ingredient_id: ingredientId, proposal_id: null })
    .eq("proposal_id", proposalId);
  if (linked.error) throw new Error(`link recipe lines: ${linked.error.message}`);
  const closed = await db
    .from("ingredient_proposal")
    .update({
      status: "accepted",
      resolved_ingredient_id: ingredientId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
  if (closed.error) throw new Error(`close proposal: ${closed.error.message}`);
  await approveResolvedRecipes(db);
}

/** "Porree" is the same as "Lauch": remember the name, so the next recipe maps by itself. */
export async function acceptAsSynonym(
  db: Db,
  proposalId: string,
  ingredientId: string,
): Promise<void> {
  const [proposal, ingredient] = await Promise.all([
    db.from("ingredient_proposal").select("name").eq("id", proposalId).single(),
    db.from("ingredient").select("id, synonyms").eq("id", ingredientId).single(),
  ]);
  const name = must(proposal, "load proposal").name;
  const target = must(ingredient, "load ingredient");
  if (!target.synonyms.some((synonym) => synonym.toLowerCase() === name.toLowerCase())) {
    const updated = await db
      .from("ingredient")
      .update({ synonyms: [...target.synonyms, name] })
      .eq("id", ingredientId);
    if (updated.error) throw new Error(`add synonym: ${updated.error.message}`);
  }
  await resolve(db, proposalId, ingredientId);
}

export interface NewIngredient {
  name: string;
  aisleGroupId: string;
  shopId: string;
  defaultUnit: string;
  buyingMode: BuyingMode;
  packSize: number | null;
  isPantryStaple: boolean;
  shelfLifeDays: number | null;
}

/** Creates the catalog ingredient a proposal stands for. Returns a message if it cannot. */
export async function acceptAsNew(
  db: Db,
  householdId: string,
  proposalId: string,
  input: NewIngredient,
): Promise<string | null> {
  const name = input.name.trim();
  if (name === "") return "Die Zutat braucht einen Namen.";
  if (!isUnit(input.defaultUnit)) return "Bitte eine Einheit wählen.";
  if (input.buyingMode === "pack" && !(input.packSize && input.packSize > 0)) {
    return "Für Packungen wird die Packungsgröße gebraucht.";
  }
  const created = await db
    .from("ingredient")
    .insert({
      household_id: householdId,
      name,
      aisle_group_id: input.aisleGroupId,
      preferred_shop_id: input.shopId,
      default_unit: input.defaultUnit,
      buying_mode: input.buyingMode,
      pack_size: input.buyingMode === "pack" ? input.packSize : null,
      is_pantry_staple: input.isPantryStaple,
      shelf_life_days: input.shelfLifeDays,
    })
    .select("id")
    .single();
  if (created.error) {
    return created.error.code === "23505"
      ? "Eine Zutat mit diesem Namen gibt es schon. Wähle sie unter „ist dasselbe wie“."
      : `Konnte nicht gespeichert werden: ${created.error.message}`;
  }
  await resolve(db, proposalId, created.data.id);
  return null;
}

/** Not wanted in the catalog. The recipe lines stay as printed text. */
export async function rejectProposal(db: Db, proposalId: string): Promise<void> {
  const closed = await db
    .from("ingredient_proposal")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", proposalId);
  if (closed.error) throw new Error(`reject proposal: ${closed.error.message}`);
}

/**
 * Approves recipes that waited for nothing but ingredient decisions and now have them all.
 * A recipe with any other open issue stays in review.
 */
export async function approveResolvedRecipes(db: Db): Promise<number> {
  const jobs = must(
    await db.from("import_job").select("id, recipe_id, issues").eq("status", "needs_review"),
    "load recipes in review",
  );
  let approved = 0;
  for (const job of jobs) {
    const issues = job.issues as unknown as ImportIssue[];
    if (!job.recipe_id || issues.length === 0) continue;
    if (!issues.every((issue) => issue.code === "unmapped_ingredient")) continue;
    const open = must(
      await db
        .from("recipe_ingredient")
        .select("id")
        .eq("recipe_id", job.recipe_id)
        .is("ingredient_id", null)
        .limit(1),
      "check recipe lines",
    );
    if (open.length > 0) continue;
    const recipe = await db.from("recipe").update({ status: "approved" }).eq("id", job.recipe_id);
    if (recipe.error) continue;
    await db
      .from("import_job")
      .update({ status: "approved", issues: [], finished_at: new Date().toISOString() })
      .eq("id", job.id);
    approved++;
  }
  return approved;
}
