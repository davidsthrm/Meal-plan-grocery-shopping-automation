import {
  aisleSortOrder,
  createCatalogIndex,
  findIngredient,
  type Ingredient,
} from "@/domain/catalog";
import type { PlanSlot } from "@/domain/plan";
import { buildShoppingList, toDefaultUnit } from "@/domain/shopping-list/build";
import { formatAmount } from "@/domain/shopping-list/format";
import { parseFreeEntry } from "@/domain/shopping-list/free-entry";
import { presentList, type ListView } from "@/domain/shopping-list/present";
import { packsFor, purchaseFor } from "@/domain/shopping-list/rounding";
import { singleTrip } from "@/domain/shopping-list/trips";
import type { LineState, ShoppingLine } from "@/domain/shopping-list/types";
import type { Amount } from "@/domain/units";
import { seedCatalog } from "../../supabase/seed/catalog";
import { seedRecipes } from "../../supabase/seed/recipes";
import inputs from "../fixtures/sample-week/inputs.json";
import plan from "../fixtures/sample-week/plan.json";
import handwritten from "../fixtures/sample-week/shopping-list.json";

/**
 * The acceptance test of the project: build the shopping list for the sample week with the
 * real catalog and recipes, and hold it against the list the household wrote by hand.
 */

export type LineStatus =
  /**
   * On both lists, in the same shop, buying the same quantity, and with the same note. A
   * line the paper writes without a quantity may show the amount the recipes need.
   */
  | "match"
  /** On both lists, but shop, quantity or note differ. */
  | "different"
  /** Only handwritten, and expected to come from a recipe that is not in the app yet. */
  | "pending"
  /** Only handwritten, with no explanation. */
  | "missing";

export interface ComparedLine {
  shop: string;
  raw: string;
  /** Catalog name the handwritten line resolves to. */
  name: string;
  status: LineStatus;
  detail: string | null;
}

export interface SampleWeek {
  slots: PlanSlot[];
  lines: ShoppingLine[];
  view: ListView;
  compared: ComparedLine[];
  /** Generated for the main trip but not on the handwritten list. */
  extra: string[];
  /** Handwritten lines whose aisle would come earlier than the line above them. */
  outOfOrder: string[];
  later: { expected: string[]; actual: string[] };
}

/** The part of the handwritten list fixture the comparison reads. */
interface HandwrittenList {
  shops: { shop: string; groups: { lines: { raw: string }[] }[] }[];
}

const handwrittenList: HandwrittenList = handwritten;
const index = createCatalogIndex(seedCatalog);

function planSlots(): PlanSlot[] {
  return plan.slots.map((slot): PlanSlot => {
    const base = {
      id: `${slot.date}-${slot.meal}`,
      date: slot.date,
      meal: slot.meal as PlanSlot["meal"],
    };
    switch (slot.kind) {
      case "leftovers":
        return { ...base, kind: "leftovers", ofSlotId: null };
      case "away":
      case "event":
        return { ...base, kind: "away", label: slot.text };
      case "skipped":
        return { ...base, kind: "skipped" };
      case "dish": {
        const recipe = seedRecipes.find((r) => r.sampleId === slot.sampleRecipe?.id);
        // A dish without a recipe yet is planned by name only.
        if (!recipe) return { ...base, kind: "free_text", label: slot.text };
        return {
          ...base,
          kind: "recipes",
          items: [{ recipeId: recipe.id, servings: inputs.householdServings }],
        };
      }
      default:
        throw new Error(`unknown slot kind in fixture: ${slot.kind}`);
    }
  });
}

/**
 * Whether the generated line buys what the handwritten one says. Where the paper shows no
 * quantity, the app may show the amount the recipes need: the household asked for it in
 * front of every line. Where the paper shows one, the line must buy the same: as many packs
 * of what comes in packs ("2x Garnelen" is 450 g), the same amount of everything else.
 */
function sameAmount(ingredient: Ingredient, written: Amount | null, line: ShoppingLine): boolean {
  if (written === null) return true;
  const inDefault = toDefaultUnit(ingredient, written);
  if (inDefault === null || line.purchase === null) return false;
  if (ingredient.buyingMode === "pack") return packsFor(ingredient, inDefault) === line.packs;
  const bought = purchaseFor(ingredient, inDefault);
  return bought.quantity === line.purchase.quantity && bought.unit === line.purchase.unit;
}

const describeAmount = (amount: Amount | null) => (amount ? formatAmount(amount) : "no quantity");

export function buildSampleWeek(): SampleWeek {
  const slots = planSlots();
  const lines = buildShoppingList({
    index,
    recipes: seedRecipes,
    slots,
    // The handwritten week had one shopping day, and one list for it: the meat is on it too.
    trips: singleTrip(inputs.shoppingDate),
    onDemand: [],
    manualEntries: inputs.freeEntries.lines.map((text, i) => ({ id: `free-${i}`, text })),
  });

  const states: Record<string, LineState> = {};
  for (const item of inputs.atHome.ingredients) {
    const ingredient = findIngredient(index, item.name);
    const key = `${ingredient?.id}@main`;
    if (!ingredient || !lines.some((line) => line.key === key)) {
      throw new Error(`inputs.json marks "${item.name}" as at home, but the list has no such line`);
    }
    states[key] = { atHome: true };
  }
  const view = presentList(lines, states, index);

  const compared: ComparedLine[] = [];
  const outOfOrder: string[] = [];
  const explained = new Set<string>();

  for (const section of handwrittenList.shops) {
    const shop = seedCatalog.shops.find((s) => s.name === section.shop);
    if (!shop) throw new Error(`fixture names an unknown shop: ${section.shop}`);
    const generated =
      view.shops.find((s) => s.shop.id === shop.id)?.groups.flatMap((g) => g.lines) ?? [];
    let previousAisle = -Infinity;

    for (const written of section.groups.flatMap((g) => g.lines)) {
      const parsed = parseFreeEntry(written.raw, index);
      const ingredient = parsed.ingredient;
      if (!ingredient) throw new Error(`handwritten line is not in the catalog: ${written.raw}`);

      const aisle = aisleSortOrder(index, shop.id, ingredient.aisleGroupId);
      if (aisle < previousAisle) outOfOrder.push(written.raw);
      previousAisle = aisle;

      const row = { shop: shop.shortLabel, raw: written.raw, name: ingredient.name };
      const line = generated.find((v) => v.line.ingredientId === ingredient.id);
      if (line) {
        explained.add(line.line.key);
        const problems = [
          sameAmount(ingredient, parsed.amount, line.line)
            ? null
            : `handwritten ${describeAmount(parsed.amount)}, generated ${describeAmount(line.line.purchase)}`,
          (parsed.note ?? null) === (line.note ?? null)
            ? null
            : `handwritten note "${parsed.note}", generated "${line.note}"`,
        ].filter((p): p is string => p !== null);
        compared.push({
          ...row,
          status: problems.length === 0 ? "match" : "different",
          detail: problems.join("; ") || null,
        });
        continue;
      }

      const elsewhere = view.shops
        .flatMap((s) => s.groups.flatMap((g) => g.lines.map((v) => ({ shop: s.shop, v }))))
        .find(({ v }) => v.line.ingredientId === ingredient.id);
      if (elsewhere) {
        explained.add(elsewhere.v.line.key);
        compared.push({
          ...row,
          status: "different",
          detail: `generated under ${elsewhere.shop.name}`,
        });
        continue;
      }

      const pendingFor = (inputs.pendingLines.lines as Record<string, string>)[written.raw];
      if (pendingFor && ingredient.preferredShopId !== shop.id) {
        compared.push({ ...row, status: "different", detail: "catalog puts it in the other shop" });
      } else if (pendingFor) {
        compared.push({ ...row, status: "pending", detail: pendingFor });
      } else {
        compared.push({ ...row, status: "missing", detail: null });
      }
    }
  }

  const extra = view.shops
    .flatMap((s) => s.groups.flatMap((g) => g.lines))
    .filter((v) => !explained.has(v.line.key))
    .map((v) => v.text);

  return {
    slots,
    lines,
    view,
    compared,
    extra,
    outOfOrder,
    later: {
      expected: [...inputs.boughtLater.ingredients].sort(),
      actual: view.later.map((v) => v.line.label).sort(),
    },
  };
}

/** True when nothing differs except lines that wait for a recipe. */
export function isAccepted(week: SampleWeek): boolean {
  return (
    week.compared.every((line) => line.status === "match" || line.status === "pending") &&
    week.extra.length === 0 &&
    week.outOfOrder.length === 0 &&
    week.later.expected.join() === week.later.actual.join()
  );
}
