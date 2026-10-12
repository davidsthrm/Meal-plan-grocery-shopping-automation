/**
 * What a cold supper usually needs, and where this household buys it for that: bread from the
 * bakery and cold cuts from the butcher, although a recipe's bread comes from the supermarket.
 * The names are offered with one tap; anything else can be typed in.
 */
export interface FoodOption {
  label: string;
  /** Name of the shop it is bought at for a cold supper. Null: where the catalog says. */
  shop: string | null;
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
