import type { CatalogIndex, Ingredient } from "../catalog";
import { normalizeName } from "../catalog";
import { daysBetween, type IsoDate } from "../dates";
import type { PlanExtra, PlanSlot } from "../plan";
import { scaleFactor, shoppingAmount, type Recipe } from "../recipe";
import { baseUnitOf, convert, dimensionOf, tidy, type Amount, type Dimension } from "../units";
import { parseFreeEntry } from "./free-entry";
import { purchaseFor } from "./rounding";
import type { Contribution, ContributionSource, ManualEntry, ShoppingLine, Trip } from "./types";

export interface BuildInput {
  index: CatalogIndex;
  recipes: Recipe[];
  slots: PlanSlot[];
  /** Recipes the week needs outside its meals. */
  extras?: PlanExtra[];
  /** Day of the main shopping trip. */
  shoppingDate: IsoDate;
  manualEntries?: ManualEntry[];
}

/**
 * Whether something needed on `neededOn` can be bought on the main shopping day.
 * It can when it keeps at least as long as the days in between.
 */
export function tripFor(
  neededOn: IsoDate,
  shoppingDate: IsoDate,
  shelfLifeDays: number | null,
): Trip {
  if (shelfLifeDays === null) return "main";
  return daysBetween(shoppingDate, neededOn) > shelfLifeDays ? "later" : "main";
}

/**
 * Converts an amount to the ingredient's default unit, or returns null if there is no path.
 * For an ingredient bought in packs, "2 Packungen" and a bare "2" both mean two packs.
 */
export function toDefaultUnit(ingredient: Ingredient, amount: Amount): number | null {
  const direct = convert(amount.quantity, amount.unit, ingredient.defaultUnit, ingredient.gramsPer);
  if (direct !== null) return direct;
  const meansPacks =
    ingredient.buyingMode === "pack" && (amount.unit === "Packung" || amount.unit === "Stück");
  return meansPacks && ingredient.packSize ? amount.quantity * ingredient.packSize : null;
}

interface Bucket {
  ingredient: Ingredient;
  trip: Trip;
  /** Where it is bought when that is not where the catalog says. */
  shopId: string | null;
  contributions: Contribution[];
  notes: string[];
}

function neededBy(contributions: Contribution[]): IsoDate | null {
  const dates = contributions.flatMap((c) =>
    c.source.type === "recipe" || c.source.type === "food" ? [c.source.date] : [],
  );
  return dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

function isOptional(contributions: Contribution[]): boolean {
  return contributions.length > 0 && contributions.every((c) => c.optional);
}

/** One line per ingredient and trip, and one more per shop it is bought at on purpose. */
function bucketKey(ingredient: Ingredient, trip: Trip, shopId: string | null): string {
  return shopId ? `${ingredient.id}@${trip}@${shopId}` : `${ingredient.id}@${trip}`;
}

function linesForBucket(bucket: Bucket): ShoppingLine[] {
  const { ingredient, trip } = bucket;
  // Contributions that sum up in the default unit, plus those without a quantity.
  const primary: Contribution[] = [];
  let primarySum = 0;
  let hasSum = false;
  let hasUnquantified = false;
  // Amounts with no conversion path stay apart, one sum per dimension.
  const apart = new Map<Dimension, { sum: number; contributions: Contribution[] }>();

  for (const contribution of bucket.contributions) {
    if (contribution.amount === null) {
      hasUnquantified = true;
      primary.push(contribution);
      continue;
    }
    const inDefault = toDefaultUnit(ingredient, contribution.amount);
    if (inDefault !== null) {
      primarySum += inDefault;
      hasSum = true;
      primary.push(contribution);
      continue;
    }
    const dimension = dimensionOf(contribution.amount.unit);
    const inBase = convert(
      contribution.amount.quantity,
      contribution.amount.unit,
      baseUnitOf(dimension),
    ) as number;
    const group = apart.get(dimension) ?? { sum: 0, contributions: [] };
    group.sum += inBase;
    group.contributions.push(contribution);
    apart.set(dimension, group);
  }

  const common = {
    ingredientId: ingredient.id,
    label: ingredient.name,
    trip,
    shopId: bucket.shopId ?? ingredient.preferredShopId,
    shopByChoice: bucket.shopId !== null,
    aisleGroupId: ingredient.aisleGroupId,
  };
  // What someone put on the list on purpose is not assumed to be at home.
  const askedFor = bucket.contributions.some(
    (c) => c.source.type === "manual" || c.source.type === "food",
  );
  const defaultAtHome = ingredient.isPantryStaple && !askedFor;
  const note = bucket.notes.length > 0 ? bucket.notes.join(", ") : null;
  const primaryAmounts: Amount[] = hasSum
    ? [{ quantity: tidy(primarySum), unit: ingredient.defaultUnit }]
    : [];
  const apartAmounts = [...apart].map(([dimension, group]): Amount => ({
    quantity: tidy(group.sum),
    unit: baseUnitOf(dimension),
  }));
  const key = bucketKey(ingredient, trip, bucket.shopId);

  // No quantity is shown anyway, so differing units need no separate lines.
  if (ingredient.buyingMode === "none") {
    return [
      {
        ...common,
        key,
        neededBy: trip === "later" ? neededBy(bucket.contributions) : null,
        purchase: null,
        amounts: [...primaryAmounts, ...apartAmounts],
        hasUnquantified,
        contributions: bucket.contributions,
        note,
        defaultAtHome,
        optional: isOptional(bucket.contributions),
      },
    ];
  }

  const lines: ShoppingLine[] = [];
  if (primary.length > 0) {
    lines.push({
      ...common,
      key,
      neededBy: trip === "later" ? neededBy(primary) : null,
      purchase: hasSum ? purchaseFor(ingredient, primarySum) : null,
      amounts: primaryAmounts,
      hasUnquantified,
      contributions: primary,
      note,
      defaultAtHome,
      optional: isOptional(primary),
    });
  }
  let index = 0;
  for (const [dimension, group] of apart) {
    lines.push({
      ...common,
      key: `${key}#${dimension}`,
      neededBy: trip === "later" ? neededBy(group.contributions) : null,
      purchase: apartAmounts[index],
      amounts: [apartAmounts[index]],
      hasUnquantified: false,
      contributions: group.contributions,
      // The note belongs to the main line. Without one, it must not get lost.
      note: primary.length > 0 ? null : note,
      defaultAtHome,
      optional: isOptional(group.contributions),
    });
    index++;
  }
  return lines;
}

/**
 * Builds the shopping list for a set of planned meals: scale each recipe, map every line to
 * its catalog ingredient, sum per ingredient, round for purchase, and decide what is bought
 * on the shopping day and what later.
 *
 * The result holds every line, including pantry staples. What the household has at home and
 * has checked off is applied afterwards, see `present.ts`.
 */
export function buildShoppingList(input: BuildInput): ShoppingLine[] {
  const { index, shoppingDate } = input;
  const { catalog } = index;
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]));
  const buckets = new Map<string, Bucket>();
  // Lines without a catalog ingredient: unmapped recipe lines and free text.
  const loose = new Map<string, ShoppingLine>();

  const add = (
    ingredient: Ingredient,
    trip: Trip,
    contribution: Contribution,
    note?: string,
    shop?: string | null,
  ) => {
    // A shop that is the catalog's own is no exception.
    const shopId = shop && shop !== ingredient.preferredShopId ? shop : null;
    const key = bucketKey(ingredient, trip, shopId);
    const bucket = buckets.get(key) ?? { ingredient, trip, shopId, contributions: [], notes: [] };
    bucket.contributions.push(contribution);
    if (note) bucket.notes.push(note);
    buckets.set(key, bucket);
  };

  const addLoose = (
    key: string,
    label: string,
    contribution: Contribution,
    entry?: { shopId?: string | null; aisleGroupId?: string | null },
  ) => {
    const line = loose.get(key) ?? {
      key,
      ingredientId: null,
      label,
      trip: "main" as const,
      neededBy: null,
      shopId: entry?.shopId ?? catalog.defaultShopId,
      shopByChoice: Boolean(entry?.shopId),
      aisleGroupId: entry?.aisleGroupId ?? catalog.fallbackAisleGroupId,
      purchase: null,
      amounts: [],
      hasUnquantified: true,
      contributions: [],
      note: null,
      defaultAtHome: false,
      optional: false,
    };
    line.contributions.push(contribution);
    loose.set(key, line);
  };

  /** Adds every line of a recipe, scaled, as needed on `date` (null: no particular day). */
  const addRecipe = (
    recipe: Recipe,
    servings: number,
    source: ContributionSource,
    date: IsoDate | null,
  ) => {
    const factor = scaleFactor(recipe.servings, servings);
    for (const line of recipe.ingredients) {
      if (line.alternativeTo !== null) continue;
      const ingredient = line.ingredientId
        ? index.ingredientById.get(line.ingredientId)
        : undefined;
      if (!ingredient) {
        const contribution = {
          source,
          amount: null,
          originalText: line.originalText,
          optional: line.optional,
        };
        addLoose(`unmapped:${normalizeName(line.originalText)}`, line.originalText, contribution);
        continue;
      }
      const base = shoppingAmount(line, ingredient.defaultUnit, ingredient.gramsPer);
      const trip = date ? tripFor(date, shoppingDate, ingredient.shelfLifeDays) : "main";
      add(ingredient, trip, {
        source,
        amount: base && { quantity: tidy(base.quantity * factor), unit: base.unit },
        originalText: line.originalText,
        optional: line.optional,
      });
    }
  };

  for (const slot of input.slots) {
    if (slot.kind === "recipes") {
      for (const item of slot.items) {
        const recipe = recipeById.get(item.recipeId);
        if (!recipe) throw new Error(`slot ${slot.id} refers to unknown recipe ${item.recipeId}`);
        const source = {
          type: "recipe" as const,
          slotId: slot.id,
          date: slot.date,
          meal: slot.meal,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
        };
        addRecipe(recipe, item.servings, source, slot.date);
      }
    }
    // A meal without a recipe can still need things: bread and cold cuts for a "Vesper".
    if (slot.kind === "free_text") {
      for (const food of slot.foods ?? []) {
        const contribution: Contribution = {
          source: {
            type: "food",
            slotId: slot.id,
            date: slot.date,
            meal: slot.meal,
            mealLabel: slot.label,
          },
          amount: null,
          originalText: food.label,
          optional: false,
        };
        const ingredient = food.ingredientId
          ? index.ingredientById.get(food.ingredientId)
          : undefined;
        if (ingredient) {
          const trip = tripFor(slot.date, shoppingDate, ingredient.shelfLifeDays);
          add(ingredient, trip, contribution, undefined, food.shopId);
        } else {
          addLoose(
            `food:${normalizeName(food.label)}@${food.shopId ?? ""}`,
            food.label,
            contribution,
            {
              shopId: food.shopId,
            },
          );
        }
      }
    }
  }

  for (const extra of input.extras ?? []) {
    const recipe = recipeById.get(extra.recipeId);
    if (!recipe) throw new Error(`an extra refers to unknown recipe ${extra.recipeId}`);
    const source = {
      type: "extra" as const,
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      note: extra.note,
    };
    addRecipe(recipe, extra.servings, source, null);
  }

  for (const entry of input.manualEntries ?? []) {
    const parsed = parseFreeEntry(entry.text, index);
    const contribution: Contribution = {
      source: { type: "manual", entryId: entry.id },
      amount: parsed.amount,
      originalText: entry.text,
      optional: false,
    };
    if (parsed.ingredient) {
      add(parsed.ingredient, "main", contribution, parsed.note ?? undefined);
    } else {
      addLoose(`manual:${entry.id}`, parsed.label, contribution, entry);
    }
  }

  return [...[...buckets.values()].flatMap(linesForBucket), ...loose.values()];
}
