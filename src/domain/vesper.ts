/**
 * What a cold supper usually needs, and where this household buys it for that: bread from the
 * bakery and cold cuts from the butcher, although a recipe's bread comes from the supermarket.
 * The names are offered with one tap; anything else can be typed in.
 */
export interface FoodOption {
  label: string;
  /** Name of the shop it is bought at for a cold supper. Null: where the catalog says. */
  shop: string | null;
  /** How many a tap adds: one baguette. Left out: a name without an amount. */
  quantity?: number;
}

/**
 * A food as it is typed: a number in front says how many ("2 Baguettes", "8x Brötchen").
 * Without one it is a name only.
 */
export function readFood(text: string): { label: string; quantity: number | null } {
  const typed = text.trim().replace(/\s+/g, " ");
  const counted = /^(\d{1,2})\s*x?\s+(\S.*)$/i.exec(typed);
  const quantity = counted ? Number(counted[1]) : 0;
  if (!counted || quantity < 1) return { label: typed, quantity: null };
  return { label: counted[2], quantity };
}

/** A food as the plan says it: "1 Dinkelbaguette", or just "Brot". */
export function foodText(food: { label: string; quantity?: number | null }): string {
  return food.quantity ? `${food.quantity} ${food.label}` : food.label;
}

export const VESPER_FOODS: readonly FoodOption[] = [
  { label: "Brot", shop: "Bäcker" },
  { label: "Brötchen", shop: "Bäcker" },
  { label: "Brezeln", shop: "Bäcker" },
  { label: "Frischwurst", shop: "Metzger" },
  { label: "Schinken", shop: "Metzger" },
  { label: "Fleischsalat", shop: "Metzger" },
  { label: "Käse", shop: null },
  { label: "Frischkäse", shop: null },
  { label: "Butter", shop: null },
  { label: "Eier", shop: null },
  { label: "Gurke", shop: null },
  { label: "Tomaten", shop: null },
  { label: "Radieschen", shop: null },
  { label: "Paprika", shop: null },
  { label: "Essiggurken", shop: null },
];

/**
 * What goes with a cooked meal without a recipe of its own, offered with one tap next to the
 * recipes: a spelt baguette with Sunday's soup. Bread is fetched fresh from the bakery for
 * the meal; a salad and the rest come from where the catalog says.
 */
export const SIDE_FOODS: readonly FoodOption[] = [
  { label: "Baguette", shop: "Bäcker", quantity: 1 },
  { label: "Dinkelbaguette", shop: "Bäcker", quantity: 1 },
  { label: "Brot", shop: "Bäcker", quantity: 1 },
  { label: "Brötchen", shop: "Bäcker" },
  { label: "Brezeln", shop: "Bäcker" },
  { label: "Ciabatta", shop: "Bäcker", quantity: 1 },
  { label: "Blattsalat", shop: null, quantity: 1 },
];

/**
 * A food next to recipes as it is bought: a side that is one of something counts as one,
 * also where it was put on the meal before foods had a number ("Dinkelbaguette" is "1
 * Dinkelbaguette"). Any other food is left as it is.
 */
export function asSide<T extends { label: string; quantity?: number | null }>(food: T): T {
  if (food.quantity) return food;
  const label = food.label.trim().toLowerCase();
  const side = SIDE_FOODS.find((option) => option.label.toLowerCase() === label);
  return side?.quantity ? { ...food, quantity: side.quantity } : food;
}
