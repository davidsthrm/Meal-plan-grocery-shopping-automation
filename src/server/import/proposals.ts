import "server-only";
import { findIngredient, type CatalogIndex } from "@/domain/catalog";
import { mapToCatalog, sameProductName } from "@/domain/import/map-ingredient";
import { usualShop } from "@/domain/import/proposal";
import { isUnit, type Unit } from "@/domain/units";
import { loadCatalogIndex, must, type Db } from "../catalog";
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
}

/**
 * "Porree" is the same as "Lauch": remembers the names as other names of the ingredient, so
 * the next recipe maps by itself, and points the waiting recipe lines at it.
 * Several proposals for one ingredient are written together, or one would overwrite another.
 */
async function acceptAsSynonyms(
  db: Db,
  ingredientId: string,
  proposals: { id: string; name: string }[],
): Promise<void> {
  const target = must(
    await db.from("ingredient").select("id, synonyms").eq("id", ingredientId).single(),
    "load ingredient",
  );
  const known = new Set(target.synonyms.map((synonym) => synonym.toLowerCase()));
  const added = [...new Set(proposals.map((p) => p.name))].filter(
    (name) => !known.has(name.toLowerCase()),
  );
  if (added.length > 0) {
    const updated = await db
      .from("ingredient")
      .update({ synonyms: [...target.synonyms, ...added] })
      .eq("id", ingredientId);
    if (updated.error) throw new Error(`add synonyms: ${updated.error.message}`);
  }
  await Promise.all(proposals.map((proposal) => resolve(db, proposal.id, ingredientId)));
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

/**
 * Creates the catalog ingredient a proposal stands for and returns its id, or a message if it
 * cannot be created.
 */
async function acceptAsNew(
  db: Db,
  householdId: string,
  proposalId: string,
  input: NewIngredient,
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (name === "") return { error: "Die Zutat braucht einen Namen." };
  if (!isUnit(input.defaultUnit)) return { error: "Die Einheit fehlt." };
  const pack = input.buyingMode === "pack" && input.packSize && input.packSize > 0;
  const created = await db
    .from("ingredient")
    .insert({
      household_id: householdId,
      name,
      aisle_group_id: input.aisleGroupId,
      preferred_shop_id: input.shopId,
      default_unit: input.defaultUnit,
      // A pack without a size cannot be counted in packs. The name alone goes on the list.
      buying_mode: input.buyingMode === "pack" && !pack ? "none" : input.buyingMode,
      pack_size: pack ? input.packSize : null,
      is_pantry_staple: input.isPantryStaple,
      shelf_life_days: input.shelfLifeDays,
    })
    .select("id")
    .single();
  if (created.error) {
    return {
      error:
        created.error.code === "23505"
          ? "Eine Zutat mit diesem Namen gibt es schon. Wähle „dasselbe wie“."
          : `Konnte nicht gespeichert werden: ${created.error.message}`,
    };
  }
  await resolve(db, proposalId, created.data.id);
  return { id: created.data.id };
}

/** Not wanted in the catalog. The recipe lines stay as printed text. */
async function rejectProposal(db: Db, proposalId: string): Promise<void> {
  const closed = await db
    .from("ingredient_proposal")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", proposalId);
  if (closed.error) throw new Error(`reject proposal: ${closed.error.message}`);
}

/**
 * Closes proposals the catalog can answer by now without anyone deciding: the name has become
 * a known name in the meantime, or differs from one only by a plural ending or "Bio-".
 * Called before the open proposals are shown, so the list only holds real questions.
 */
export async function settleKnownProposals(db: Db, index: CatalogIndex): Promise<number> {
  const open = must(
    await db.from("ingredient_proposal").select("id, name").eq("status", "open"),
    "load open proposals",
  );
  const byIngredient = new Map<string, { id: string; name: string }[]>();
  for (const proposal of open) {
    const known = mapToCatalog(index, { raw: proposal.name, name: proposal.name });
    if (!known) continue;
    byIngredient.set(known.id, [...(byIngredient.get(known.id) ?? []), proposal]);
  }
  for (const [ingredientId, proposals] of byIngredient) {
    await acceptAsSynonyms(db, ingredientId, proposals);
  }
  return [...byIngredient.values()].reduce((sum, list) => sum + list.length, 0);
}

export interface ProposalDecision {
  id: string;
  /** "later" leaves the proposal open. */
  decision: "new" | "same" | "reject" | "later";
  /** For "same": the name of the existing ingredient, as typed or chosen. */
  sameAs: string;
  /** For "new": the aisle group the ingredient goes to. */
  aisleGroupId: string;
}

/**
 * Applies the household's decisions on a list of proposals. Returns a message per proposal
 * that could not be decided as asked; those stay open.
 */
export async function decideProposals(
  db: Db,
  householdId: string,
  decisions: ProposalDecision[],
): Promise<Record<string, string>> {
  const index = await loadCatalogIndex(db);
  const open = new Map((await loadOpenProposals(db)).map((proposal) => [proposal.id, proposal]));
  const errors: Record<string, string> = {};
  const todo = decisions.filter((d) => d.decision !== "later" && open.has(d.id));

  // One write per existing ingredient, so that two new names for it do not overwrite each other.
  const sameAs = new Map<string, { id: string; name: string }[]>();
  for (const decision of todo.filter((d) => d.decision === "same")) {
    const target = findIngredient(index, decision.sameAs);
    if (!target) {
      errors[decision.id] = "Diese Zutat gibt es im Katalog nicht. Bitte aus der Liste wählen.";
      continue;
    }
    const proposal = open.get(decision.id)!;
    sameAs.set(target.id, [
      ...(sameAs.get(target.id) ?? []),
      { id: proposal.id, name: proposal.name },
    ]);
  }

  // "Forellenfilet" and "Forellenfilets" become one ingredient with two names, not two.
  const newGroups: ProposalDecision[][] = [];
  for (const decision of todo.filter((d) => d.decision === "new")) {
    const name = open.get(decision.id)!.name;
    const group = newGroups.find((g) => sameProductName(open.get(g[0].id)!.name, name));
    if (group) group.push(decision);
    else newGroups.push([decision]);
  }

  const tasks: (() => Promise<void>)[] = [
    ...[...sameAs].map(
      ([ingredientId, proposals]) =>
        () =>
          acceptAsSynonyms(db, ingredientId, proposals),
    ),
    ...todo
      .filter((d) => d.decision === "reject")
      .map((decision) => () => rejectProposal(db, decision.id)),
    ...newGroups.map(([first, ...others]) => async () => {
      const proposal = open.get(first.id)!;
      const aisle = index.aisleGroupById.has(first.aisleGroupId)
        ? first.aisleGroupId
        : proposal.aisleGroupId;
      const created = await acceptAsNew(db, householdId, first.id, {
        name: proposal.name,
        aisleGroupId: aisle,
        // A different aisle usually means a different shop too.
        shopId: aisle === proposal.aisleGroupId ? proposal.shopId : usualShop(index, aisle),
        defaultUnit: proposal.defaultUnit,
        buyingMode: proposal.buyingMode,
        packSize: proposal.packSize,
        isPantryStaple: proposal.isPantryStaple,
        shelfLifeDays: proposal.shelfLifeDays,
      });
      if ("error" in created) {
        for (const decision of [first, ...others]) errors[decision.id] = created.error;
        return;
      }
      if (others.length > 0) {
        await acceptAsSynonyms(
          db,
          created.id,
          others.map((decision) => ({ id: decision.id, name: open.get(decision.id)!.name })),
        );
      }
    }),
  ];
  // A few at a time: fast enough for a long list without flooding the database.
  for (let at = 0; at < tasks.length; at += 6) {
    await Promise.all(tasks.slice(at, at + 6).map((task) => task()));
  }
  return errors;
}
