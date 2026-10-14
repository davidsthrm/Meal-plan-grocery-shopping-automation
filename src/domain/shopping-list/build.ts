import type { CatalogIndex, Ingredient, Place } from "../catalog";
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
import { assignTrip, noteId, type Assignment, type ShoppingTrip } from "./trips";
import {
  dayOf,
  type Contribution,
  type ContributionSource,
  type ManualEntry,
  type ShoppingLine,
  type Trip,
} from "./types";

export interface BuildInput {
  index: CatalogIndex;
  recipes: Recipe[];
  slots: PlanSlot[];
  /** Recipes the week needs outside its meals. */
  extras?: PlanExtra[];
  /** The household's errands around the planned meals, in order. At least one. */
  trips: readonly ShoppingTrip[];
  /**
   * The places gone to for the meal that needs something from there: the butcher and the
   * bakery, unless said otherwise. Empty for a household that buys everything in one go.
   */
  onDemand?: readonly Place[];
  /** The supermarket day the extras without a day are bought on. Without one, the first. */
  extrasDate?: IsoDate;
  manualEntries?: ManualEntry[];
  /**
   * Lines the household decided to buy on another errand: the note a line would be on by
   * itself and its key (see `moveKey`), to the note it was moved to.
   */
  moves?: ReadonlyMap<string, ShoppingTrip>;
}

/** How a moved line is looked up: by the note it would be on by itself, and its key. */
export function moveKey(origin: ShoppingTrip, lineKey: string): string {
  // Amounts that could not be merged are lines of their own, but move together.
  return `${noteId(origin)}|${lineKey.replace(/#\w+$/, "")}`;
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
  /** The note the line is on: a place on a day. */
  shoppingDate: IsoDate;
  place: Place;
  trip: Trip;
  /** Where it is bought when that is not where the catalog says. */
  shopId: string | null;
  contributions: Contribution[];
  notes: string[];
}

function neededBy(contributions: Contribution[]): IsoDate | null {
  const dates = contributions.flatMap((c) => dayOf(c.source) ?? []);
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
    place: bucket.place,
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
  // The day it is needed is said only for what goes bad: tomatoes and yoghurt are bought
  // close to their meal, flour is simply on the list.
  const dated = trip === "later" && ingredient.shelfLifeDays !== null;

  // No quantity is shown anyway, so differing units need no separate lines.
  if (ingredient.buyingMode === "none") {
    return [
      {
        ...common,
        key,
        neededBy: dated ? neededBy(bucket.contributions) : null,
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
      neededBy: dated ? neededBy(primary) : null,
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
      neededBy: dated ? neededBy(group.contributions) : null,
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
 * its catalog ingredient, decide which errand buys it, sum per ingredient and errand, and
 * round for purchase.
 *
 * The result holds the lines of every note, each naming its day and place, including pantry
 * staples. What the household has at home and has checked off is applied afterwards, see
 * `present.ts`.
 */
export function buildShoppingList(input: BuildInput): ShoppingLine[] {
  const { index, trips } = input;
  const { catalog } = index;
  if (trips.length === 0) throw new Error("a shopping list needs a shopping day");
  const first = trips.find((trip) => trip.place === "supermarket") ?? trips[0];
  const extrasOn: Assignment = {
    date: input.extrasDate ?? first.date,
    place: input.extrasDate ? "supermarket" : first.place,
    trip: "main",
  };
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]));
  const buckets = new Map<string, Bucket>();
  // Lines without a catalog ingredient: unmapped recipe lines and free text.
  const loose = new Map<string, ShoppingLine>();

  /** The errand that buys an ingredient for a meal on `date`. */
  const errandFor = (
    ingredient: Ingredient | undefined,
    date: IsoDate,
    plannedOn: IsoDate | null | undefined,
    shopId?: string | null,
  ): Assignment =>
    assignTrip(
      {
        date,
        plannedOn,
        fresh: ingredient
          ? (index.aisleGroupById.get(ingredient.aisleGroupId)?.freshPlace ?? null)
          : null,
        // A shop named on purpose says where: bread for a cold supper from the bakery.
        at: shopId ? (index.shopById.get(shopId)?.kind ?? null) : null,
        shelfLifeDays: ingredient?.shelfLifeDays ?? null,
      },
      trips,
      input.onDemand,
    ) as Assignment;

  /** Where a line ends up: on its own note, or on the one the household moved it to. */
  const settle = (on: Assignment, lineKey: string): Assignment => {
    const target = input.moves?.get(moveKey(on, lineKey));
    return target ? { ...target, trip: on.trip } : on;
  };

  const add = (
    ingredient: Ingredient,
    origin: Assignment,
    contribution: Contribution,
    note?: string,
    shop?: string | null,
  ) => {
    // A shop that is the catalog's own is no exception.
    const shopId = shop && shop !== ingredient.preferredShopId ? shop : null;
    const lineKey = bucketKey(ingredient, origin.trip, shopId);
    const on = settle(origin, lineKey);
    const key = `${noteId(on)}|${lineKey}`;
    const bucket = buckets.get(key) ?? {
      ingredient,
      shoppingDate: on.date,
      place: on.place,
      trip: on.trip,
      shopId,
      contributions: [],
      notes: [],
    };
    bucket.contributions.push({
      ...contribution,
      origin: { date: origin.date, place: origin.place },
    });
    if (note) bucket.notes.push(note);
    buckets.set(key, bucket);
  };

  const addLoose = (
    lineKey: string,
    label: string,
    origin: Assignment,
    contribution: Contribution,
    entry?: { shopId?: string | null; aisleGroupId?: string | null },
  ) => {
    const on = settle(origin, lineKey);
    const key = `${noteId(on)}|${lineKey}`;
    const line = loose.get(key) ?? {
      key: lineKey,
      ingredientId: null,
      label,
      shoppingDate: on.date,
      place: on.place,
      trip: on.trip,
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
    line.contributions.push({
      ...contribution,
      origin: { date: origin.date, place: origin.place },
    });
    loose.set(key, line);
  };

  /**
   * Adds every line of a recipe, scaled, as needed on `date`. Without a date it is bought
   * with the extras that have none.
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
      const on = date ? errandFor(ingredient, date, plannedOn) : extrasOn;
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
          on,
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
        const on = errandFor(ingredient, slot.date, food.plannedOn, food.shopId);
        if (ingredient) {
          add(ingredient, on, contribution, undefined, food.shopId);
        } else {
          addLoose(
            `food:${normalizeName(food.label)}@${food.shopId ?? ""}`,
            food.label,
            on,
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
      date: extra.date ?? null,
    };
    // An extra for a day is bought for that day, exactly like a meal on it.
    addRecipe(recipe, extra.servings, source, extra.date ?? null, extra.plannedOn);
  }

  for (const entry of input.manualEntries ?? []) {
    const parsed = parseFreeEntry(entry.text, index);
    const contribution: Contribution = {
      source: { type: "manual", entryId: entry.id },
      amount: parsed.amount,
      originalText: entry.text,
      optional: false,
    };
    // A typed line stays on the note it was written on.
    const on: Assignment = {
      date: entry.shoppingDate ?? first.date,
      place: entry.place ?? (entry.shoppingDate ? "supermarket" : first.place),
      trip: "main",
    };
    if (parsed.ingredient) {
      add(parsed.ingredient, on, contribution, parsed.note ?? undefined);
    } else {
      addLoose(`manual:${entry.id}`, parsed.label, on, contribution, entry);
    }
  }

  return [...[...buckets.values()].flatMap(linesForBucket), ...loose.values()];
}
