import { z } from "zod";
import { findIngredient, type BuyingMode, type CatalogIndex } from "../catalog";
import { UNITS, type Unit } from "../units";
import type { RecipeDraft } from "./draft";

/**
 * Ingredients the catalog does not know are never created silently. They become proposals:
 * either "this is another name for something you already have" or "this is new, and here is
 * where it would go". The household confirms them in one batch.
 */

export interface IngredientProposal {
  /** The name as read from the recipe. */
  name: string;
  /** Set when this is probably just another name for an existing ingredient. */
  sameAsIngredientId: string | null;
  aisleGroupId: string;
  preferredShopId: string;
  defaultUnit: Unit;
  buyingMode: BuyingMode;
  packSize: number | null;
  isPantryStaple: boolean;
  shelfLifeDays: number | null;
}

/** The format a model answers in. Aisle groups are the household's own, hence built per call. */
export function suggestionSchema(aisleGroupNames: string[]) {
  return z.object({
    suggestions: z.array(
      z.object({
        /** The unknown name, exactly as given. */
        name: z.string(),
        /** Exact name of a catalog ingredient that is the same product, or null. */
        sameAs: z.string().nullable(),
        aisleGroup: z.enum(aisleGroupNames as [string, ...string[]]),
        defaultUnit: z.enum(UNITS as [string, ...string[]]),
        buyingMode: z.enum(["count", "weight", "pack", "none"]),
        /** Size of one pack in the default unit. Null unless bought in packs. */
        packSize: z.number().nullable(),
        isPantryStaple: z.boolean(),
        /** Days it keeps after buying. Null when it keeps for weeks. */
        shelfLifeDays: z.number().int().nullable(),
      }),
    ),
  });
}

export type Suggestions = z.infer<ReturnType<typeof suggestionSchema>>;

/** Names in a draft that the catalog does not know, each once, in order of appearance. */
export function unmappedNames(draft: RecipeDraft): string[] {
  const names = draft.ingredients.filter((l) => l.ingredientId === null).map((l) => l.readName);
  return [...new Set(names)];
}

/** The shop most ingredients of an aisle group are bought in. */
function usualShop(index: CatalogIndex, aisleGroupId: string): string {
  const counts = new Map<string, number>();
  for (const ingredient of index.catalog.ingredients) {
    if (ingredient.aisleGroupId !== aisleGroupId) continue;
    counts.set(ingredient.preferredShopId, (counts.get(ingredient.preferredShopId) ?? 0) + 1);
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? index.catalog.defaultShopId;
}

/**
 * Turns a model's suggestions into proposals the app can store. Anything the model returned
 * that does not hold up against the catalog is corrected to the safe choice, not trusted: an
 * unknown "same as" is dropped, a pack without a size becomes "no quantity".
 * A name the model skipped still gets a proposal, in the fallback aisle group.
 */
export function toProposals(
  names: string[],
  suggestions: Suggestions["suggestions"],
  index: CatalogIndex,
): IngredientProposal[] {
  const { catalog } = index;
  return names.map((name): IngredientProposal => {
    const suggestion = suggestions.find((s) => s.name === name);
    const aisleGroup = catalog.aisleGroups.find((a) => a.name === suggestion?.aisleGroup);
    const aisleGroupId = aisleGroup?.id ?? catalog.fallbackAisleGroupId;
    const packSize =
      suggestion?.buyingMode === "pack" && suggestion.packSize && suggestion.packSize > 0
        ? suggestion.packSize
        : null;
    const buyingMode: BuyingMode =
      !suggestion || (suggestion.buyingMode === "pack" && packSize === null)
        ? "none"
        : suggestion.buyingMode;
    const suggestedUnit = (suggestion?.defaultUnit as Unit | undefined) ?? "Stück";
    // Something bought by weight is summed in grams, whatever unit the model named.
    const defaultUnit: Unit =
      buyingMode === "weight" && suggestedUnit !== "g" && suggestedUnit !== "kg"
        ? "g"
        : suggestedUnit;
    const shelfLife = suggestion?.shelfLifeDays ?? null;
    return {
      name,
      sameAsIngredientId: suggestion?.sameAs
        ? (findIngredient(index, suggestion.sameAs)?.id ?? null)
        : null,
      aisleGroupId,
      preferredShopId: usualShop(index, aisleGroupId),
      defaultUnit,
      buyingMode,
      packSize,
      isPantryStaple: suggestion?.isPantryStaple ?? false,
      shelfLifeDays: shelfLife !== null && shelfLife >= 0 ? shelfLife : null,
    };
  });
}
