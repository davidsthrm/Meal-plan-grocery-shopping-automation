import { normalizeName, type CatalogIndex, type Place, type Shop } from "../catalog";
import type { ShoppingLine } from "./types";

/**
 * Where else a line can be bought: which shops plausibly have it. The Bäcker has no grapes,
 * the Metzger no pretzels, a farm shop eggs and vegetables, a supermarket everything. What
 * a shop sells is what the app knows of it already: the butcher, the bakery and the market
 * sell what the household buys fresh there (`aisle_group.fresh_place`); a supermarket found
 * on the map sells everything; a shop the household typed in itself sells the kinds of
 * grocery ticked for it ("Angaben"), or everything while none is. Where the household
 * bought something before comes first, whatever the shop sells by these rules.
 */

/** A shop a line can be bought at: on the note of its place, and in its section there. */
export interface ShopChoice {
  /** The shop's id, or the place where it has no shop of its own: "market". */
  id: string;
  place: Place;
  shopId: string | null;
  name: string;
  logoUrl: string | null;
}

/** The places food is bought at, in the order a choice is offered. */
const FOOD_PLACES: readonly Place[] = ["supermarket", "butcher", "bakery", "market"];

const PLACE_LABEL: Record<Exclude<Place, "drugstore">, string> = {
  supermarket: "Supermarkt",
  market: "Markt",
  butcher: "Metzger",
  bakery: "Bäcker",
};

/**
 * Every shop a line can be bought at: the household's supermarkets, the main one first,
 * then its butcher, bakery and market. A place the household has no shop for stands as the
 * place itself.
 */
export function shopChoices(index: CatalogIndex, supermarkets: readonly Shop[]): ShopChoice[] {
  const choices: ShopChoice[] = supermarkets.map((shop) => ({
    id: shop.id,
    place: "supermarket",
    shopId: shop.id,
    name: shop.name,
    logoUrl: shop.logoUrl ?? null,
  }));
  if (choices.length === 0) {
    choices.push({
      id: "supermarket",
      place: "supermarket",
      shopId: null,
      name: PLACE_LABEL.supermarket,
      logoUrl: null,
    });
  }
  for (const place of FOOD_PLACES.slice(1)) {
    const shops = index.catalog.shops
      .filter((shop) => shop.kind === place)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (shops.length === 0) {
      choices.push({
        id: place,
        place,
        shopId: null,
        name: PLACE_LABEL[place as "market"],
        logoUrl: null,
      });
    }
    for (const shop of shops) {
      choices.push({
        id: shop.id,
        place,
        shopId: shop.id,
        name: shop.name,
        logoUrl: shop.logoUrl ?? null,
      });
    }
  }
  return choices;
}

/**
 * The kinds of grocery a choice sells, or "all". Read as above: the fresh places by what is
 * bought fresh there, a supermarket of the map everything, a typed-in one its ticked kinds.
 */
export function kindsSold(choice: ShopChoice, index: CatalogIndex): ReadonlySet<string> | "all" {
  const shop = choice.shopId ? index.shopById.get(choice.shopId) : undefined;
  const ticked = shop?.aisleGroupIds ?? [];
  if (choice.place === "supermarket") {
    const typedIn = shop !== undefined && !shop.foundNear && !shop.logoUrl;
    return typedIn && ticked.length > 0 ? new Set(ticked) : "all";
  }
  if (ticked.length > 0) return new Set(ticked);
  return new Set(
    index.catalog.aisleGroups
      .filter((group) => group.freshPlace === choice.place)
      .map((group) => group.id),
  );
}

/** The thing a line buys, as the history of where it was bought knows it. */
export function itemKey(line: Pick<ShoppingLine, "ingredientId" | "label">): string {
  return line.ingredientId ?? `text:${normalizeName(line.label)}`.slice(0, 200);
}

/** Where the household bought or chose to buy one thing, and how often. */
export interface PastChoice {
  choice: string;
  times: number;
  /** When last, in milliseconds. */
  lastAt: number;
}

/**
 * The shops to offer for a line, and the rest behind "Alle Geschäfte". Offered first are
 * the shops it was bought at before, the most often first; then the others that sell its
 * kind of grocery, in the order of `choices`. The others are only offered behind it, and
 * one chosen there is remembered and offered first the next time.
 */
export function suggestShops(
  line: Pick<ShoppingLine, "aisleGroupId">,
  choices: readonly ShopChoice[],
  past: readonly PastChoice[],
  index: CatalogIndex,
): { suggested: ShopChoice[]; others: ShopChoice[] } {
  const known = [...past]
    .sort((a, b) => b.times - a.times || b.lastAt - a.lastAt)
    .flatMap((each) => choices.find((choice) => choice.id === each.choice) ?? []);
  const sells = (choice: ShopChoice) => {
    const kinds = kindsSold(choice, index);
    return kinds === "all" || kinds.has(line.aisleGroupId);
  };
  const rest = choices.filter((choice) => !known.includes(choice));
  return {
    suggested: [...known, ...rest.filter(sells)],
    others: rest.filter((choice) => !sells(choice)),
  };
}

/** The choice a line stands at on its note: its place, and the supermarket it is bought at. */
export function choiceOf(
  place: Place,
  supermarketId: string | null,
  choices: readonly ShopChoice[],
): ShopChoice | undefined {
  return (
    (supermarketId && choices.find((choice) => choice.shopId === supermarketId)) ||
    choices.find((choice) => choice.place === place)
  );
}
