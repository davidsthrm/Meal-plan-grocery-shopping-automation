import type { CatalogIndex, Ingredient } from "../catalog";
import { normalizeName } from "../catalog";
import type { IsoDate } from "../dates";
import type { PlanExtra, PlanSlot } from "../plan";
import { scaleFactor, shoppingAmount, type Recipe } from "../recipe";
import {
  baseUnitOf,
  convert,
  dimensionOf,
  tidy,
  type Amount,
  type Dimension,
  type Unit,
} from "../units";
import { parseFreeEntry } from "./free-entry";
import { purchaseFor } from "./rounding";
import { assignTrip, type Assignment, type ShoppingTrip } from "./trips";
import type { Contribution, ContributionSource, ManualEntry, ShoppingLine, Trip } from "./types";

export interface BuildInput {
  index: CatalogIndex;
  recipes: Recipe[];
  slots: PlanSlot[];
  /** Recipes the week needs outside its meals. */
  extras?: PlanExtra[];
  /** The household's shopping days around the planned meals, in order. At least one. */
  trips: readonly ShoppingTrip[];
  /** The shopping day the extras are bought on. Without one, the first. */
  extrasDate?: IsoDate;
  manualEntries?: ManualEntry[];
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

/** Amounts too small to shop for when they cannot be added to the rest. */
const SPOONFULS: ReadonlySet<Unit> = new Set(["EL", "TL", "Prise", "Msp"]);

/**
 * The name for one piece, where the catalog knows it: "1 Zitrone" instead of "1 Zitronen".
 * The catalog names things in the plural and lists the singular among the other names.
 */
function nameForOne(ingredient: Ingredient): string {
  const plural = ingredient.name.toLowerCase();
  const singular = ingredient.synonyms.find((name) => {
    const short = name.toLowerCase();
    return (
      short.length < plural.length && plural.length - short.length <= 2 && plural.startsWith(short)
    );
  });
  return singular ?? ingredient.name;
}

/**
 * Whether a food was named as one piece of something bought by the piece: "Gurke", where the
 * catalog says "Gurken". Named in the plural ("Tomaten"), it stays a name without an amount.
 */
function namesOnePiece(ingredient: Ingredient, label: string): boolean {
  if (ingredient.buyingMode !== "count") return false;
  const one = nameForOne(ingredient);
  return (
    one !== ingredient.name &&
    normalizeName(label) === normalizeName(one) &&
    toDefaultUnit(ingredient, { quantity: 1, unit: "Stück" }) !== null
  );
}

interface Bucket {
  ingredient: Ingredient;
  /** The shopping day whose list the line is on. */
  shoppingDate: IsoDate;
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
    // A spoonful or a pinch of something bought by weight or by the piece changes nothing
    // about what to buy. It counts as "some", and does not become a line of its own that
    // would read "55 ml Butter".
    if (SPOONFULS.has(contribution.amount.unit)) {
      hasUnquantified = true;
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
    shoppingDate: bucket.shoppingDate,
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
    const purchase = hasSum ? purchaseFor(ingredient, primarySum) : null;
    lines.push({
      ...common,
      label:
        purchase?.unit === "Stück" && purchase.quantity === 1
          ? nameForOne(ingredient)
          : ingredient.name,
      key,
      neededBy: trip === "later" ? neededBy(primary) : null,
      purchase,
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
 * Builds the shopping lists for a set of planned meals: scale each recipe, map every line to
 * its catalog ingredient, decide which shopping day buys it, sum per ingredient and day, and
 * round for purchase.
 *
 * The result holds the lines of every shopping day, each naming its day, including pantry
 * staples. What the household has at home and has checked off is applied afterwards, see
 * `present.ts`.
 */
export function buildShoppingList(input: BuildInput): ShoppingLine[] {
  const { index, trips } = input;
  const { catalog } = index;
  if (trips.length === 0) throw new Error("a shopping list needs a shopping day");
  const firstDate = (trips.find((trip) => trip.kind === "all") ?? trips[0]).date;
  const extrasDate = input.extrasDate ?? firstDate;
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]));
  const buckets = new Map<string, Bucket>();
  // Lines without a catalog ingredient: unmapped recipe lines and free text.
  const loose = new Map<string, ShoppingLine>();

  /** The shopping day that buys an ingredient for a meal on `date`. */
  const dayFor = (
    ingredient: Ingredient | undefined,
    date: IsoDate,
    plannedOn: IsoDate | null | undefined,
  ): Assignment =>
    assignTrip(
      {
        date,
        plannedOn,
        market: ingredient
          ? (index.aisleGroupById.get(ingredient.aisleGroupId)?.market ?? false)
          : false,
        shelfLifeDays: ingredient?.shelfLifeDays ?? null,
      },
      trips,
    ) as Assignment;

  const add = (
    ingredient: Ingredient,
    on: Assignment,
    contribution: Contribution,
    note?: string,
    shop?: string | null,
  ) => {
    // A shop that is the catalog's own is no exception.
    const shopId = shop && shop !== ingredient.preferredShopId ? shop : null;
    const key = `${on.date}|${bucketKey(ingredient, on.trip, shopId)}`;
    const bucket = buckets.get(key) ?? {
      ingredient,
      shoppingDate: on.date,
      trip: on.trip,
      shopId,
      contributions: [],
      notes: [],
    };
    bucket.contributions.push(contribution);
    if (note) bucket.notes.push(note);
    buckets.set(key, bucket);
  };

  const addLoose = (
    key: string,
    label: string,
    shoppingDate: IsoDate,
    contribution: Contribution,
    entry?: { shopId?: string | null; aisleGroupId?: string | null },
  ) => {
    const line = loose.get(`${shoppingDate}|${key}`) ?? {
      key,
      ingredientId: null,
      label,
      shoppingDate,
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
    loose.set(`${shoppingDate}|${key}`, line);
  };

  /**
   * Adds every line of a recipe, scaled, as needed on `date`. Without a date it is bought
   * on the shopping day of the extras.
   */
  const addRecipe = (
    recipe: Recipe,
    servings: number,
    source: ContributionSource,
    date: IsoDate | null,
    plannedOn?: IsoDate | null,
  ) => {
    const factor = scaleFactor(recipe.servings, servings);
    for (const line of recipe.ingredients) {
      if (line.alternativeTo !== null) continue;
      const ingredient = line.ingredientId
        ? index.ingredientById.get(line.ingredientId)
        : undefined;
      const on: Assignment = date
        ? dayFor(ingredient, date, plannedOn)
        : { date: extrasDate, trip: "main" };
      if (!ingredient) {
        const contribution = {
          source,
          amount: null,
          originalText: line.originalText,
          optional: line.optional,
        };
        addLoose(
          `unmapped:${normalizeName(line.originalText)}`,
          line.originalText,
          on.date,
          contribution,
        );
        continue;
      }
      const base = shoppingAmount(line, ingredient.defaultUnit, ingredient.gramsPer);
      add(ingredient, on, {
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
        addRecipe(recipe, item.servings, source, slot.date, item.plannedOn);
      }
    }
    // A meal without a recipe can still need things: bread and cold cuts for a "Vesper".
    if (slot.kind === "free_text") {
      for (const food of slot.foods ?? []) {
        const ingredient = food.ingredientId
          ? index.ingredientById.get(food.ingredientId)
          : undefined;
        const contribution: Contribution = {
          source: {
            type: "food",
            slotId: slot.id,
            date: slot.date,
            meal: slot.meal,
            mealLabel: slot.label,
          },
          amount:
            ingredient && namesOnePiece(ingredient, food.label)
              ? { quantity: 1, unit: "Stück" }
              : null,
          originalText: food.label,
          optional: false,
        };
        const on = dayFor(ingredient, slot.date, food.plannedOn);
        if (ingredient) {
          add(ingredient, on, contribution, undefined, food.shopId);
        } else {
          addLoose(
            `food:${normalizeName(food.label)}@${food.shopId ?? ""}`,
            food.label,
            on.date,
            contribution,
            { shopId: food.shopId },
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
    // A typed line stays on the list it was written on.
    const shoppingDate = entry.shoppingDate ?? firstDate;
    if (parsed.ingredient) {
      add(
        parsed.ingredient,
        { date: shoppingDate, trip: "main" },
        contribution,
        parsed.note ?? undefined,
      );
    } else {
      addLoose(`manual:${entry.id}`, parsed.label, shoppingDate, contribution, entry);
    }
  }

  return [...[...buckets.values()].flatMap(linesForBucket), ...loose.values()];
}
