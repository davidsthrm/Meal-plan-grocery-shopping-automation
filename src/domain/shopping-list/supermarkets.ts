import { normalizeName, type AisleGroup, type Shop } from "../catalog";
import type { AisleView, ViewLine } from "./present";

/**
 * The household's supermarkets: one main one and any others it goes to now and then. A note
 * for the supermarket buys everything at the main one. A line the household moves to
 * another one for a week ("Kaufe ich bei Rewe") stands in a section of that supermarket on
 * the same note, and a supermarket without such a line has no section.
 */

/** The household's supermarkets, the main one first. Empty until it has named one. */
export function favouriteSupermarkets(shops: readonly Shop[]): Shop[] {
  return shops
    .filter((shop) => (shop.kind ?? "supermarket") === "supermarket" && shop.supermarketRank)
    .sort(
      (a, b) =>
        (a.supermarketRank as number) - (b.supermarketRank as number) ||
        a.name.localeCompare(b.name, "de"),
    );
}

/**
 * The chains most of Germany buys its groceries at, the biggest first. A supermarket named
 * after one of them ("Aldi Süd", "EDEKA Riedmüller") is offered before other markets.
 */
const BEST_KNOWN = [
  "edeka",
  "rewe",
  "lidl",
  "aldi",
  "kaufland",
  "netto",
  "penny",
  "norma",
  "globus",
  "marktkauf",
  "tegut",
];

/** Where a supermarket stands among the best-known chains: lower first, unknown last. */
function popularity(shop: Shop): number {
  const first = normalizeName(shop.name.split(/[\s-]+/)[0]);
  const at = BEST_KNOWN.indexOf(first);
  return at === -1 ? BEST_KNOWN.length : at;
}

/**
 * The supermarkets found near the household as the settings offer them: the household's
 * own first, the main one first; then the best-known chains, the biggest first; then other
 * chains, whose logo is known; then the rest, each by name. `shown` are the first five, or
 * every chosen one where there are more; `more` lie folded away under "Weitere anzeigen".
 */
export function offeredSupermarkets(
  found: readonly Shop[],
  chosen: readonly Shop[],
  count = 5,
): { shown: Shop[]; more: Shop[] } {
  const rest = found
    .filter((shop) => !chosen.some((each) => each.id === shop.id))
    .sort(
      (a, b) =>
        popularity(a) - popularity(b) ||
        Number(!a.logoUrl) - Number(!b.logoUrl) ||
        a.name.localeCompare(b.name, "de"),
    );
  const all = [...chosen, ...rest];
  const shown = Math.max(count, chosen.length);
  return { shown: all.slice(0, shown), more: all.slice(shown) };
}

/** How long a street may be, as the database keeps it. */
const ADDRESS_LENGTH = 120;

/**
 * What the household typed about one of its markets: its street, null for none, and the
 * kinds of grocery it buys there, only those the household has, in their order.
 */
export function readShopDetails(
  typed: { address: string; kinds: readonly string[] },
  aisleGroups: readonly Pick<AisleGroup, "id" | "sortOrder">[],
): { address: string | null; aisleGroupIds: string[] } {
  const address = typed.address.trim().replace(/\s+/g, " ").slice(0, ADDRESS_LENGTH);
  const wanted = new Set(typed.kinds);
  return {
    address: address === "" ? null : address,
    aisleGroupIds: [...aisleGroups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((group) => wanted.has(group.id))
      .map((group) => group.id),
  };
}

/**
 * The kinds of grocery the household buys at a market, by name in the order of a walk
 * through a shop: "Obst & Gemüse · Eier". A kind deleted since is left out.
 */
export function kindsText(
  shop: Pick<Shop, "aisleGroupIds">,
  aisleGroups: readonly Pick<AisleGroup, "id" | "name" | "sortOrder">[],
): string {
  const ids = new Set(shop.aisleGroupIds ?? []);
  return [...aisleGroups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((group) => ids.has(group.id))
    .map((group) => group.name)
    .join(" · ");
}

/** One supermarket's part of a note. `shop` is null while the household has named none. */
export interface ShopSection {
  shop: Shop | null;
  groups: AisleView["groups"];
}

/** The supermarket a line of a note is bought at: the one chosen for it, or the main one. */
export function supermarketOf(view: ViewLine, favourites: readonly Shop[]): Shop | null {
  return favourites.find((shop) => shop.id === view.chosenShopId) ?? favourites[0] ?? null;
}

/**
 * A supermarket note in one section per supermarket, the main one first, each by kind of
 * grocery. A supermarket with nothing to buy on this note has no section.
 */
export function sectionsByShop(view: AisleView, favourites: readonly Shop[]): ShopSection[] {
  if (favourites.length === 0)
    return view.groups.length > 0 ? [{ shop: null, groups: view.groups }] : [];
  return favourites
    .map((shop) => ({
      shop,
      groups: view.groups
        .map((group) => ({
          ...group,
          lines: group.lines.filter((line) => supermarketOf(line, favourites)?.id === shop.id),
        }))
        .filter((group) => group.lines.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}

/**
 * The order of the supermarkets after a change in the settings, as ids, the main one first.
 * The ranks stored are the positions in it, from 1.
 */
export function withMain(ranked: readonly string[], id: string): string[] {
  return [id, ...ranked.filter((each) => each !== id)];
}

export function withAdded(ranked: readonly string[], id: string): string[] {
  return ranked.includes(id) ? [...ranked] : [...ranked, id];
}

export function without(ranked: readonly string[], id: string): string[] {
  return ranked.filter((each) => each !== id);
}

/**
 * The supermarkets a note is taken to: those with a section on it, the main one first, or the
 * main one alone while nothing is on it. Empty while the household has named none.
 */
export function marketsOfNote(view: AisleView, favourites: readonly Shop[]): Shop[] {
  const onNote = sectionsByShop(view, favourites).flatMap((section) =>
    section.shop ? [section.shop] : [],
  );
  return onNote.length > 0 ? onNote : favourites.slice(0, 1);
}

/** Names as one says them: "Aldi", "Aldi & Rewe", "Aldi, Rewe & Botzenhardt". */
export function namesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
