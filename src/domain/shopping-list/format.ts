import type { Amount, Unit } from "../units";

const PLURALS: Partial<Record<Unit, string>> = {
  Zehe: "Zehen",
  Zweig: "Zweige",
  Blatt: "Blätter",
  Scheibe: "Scheiben",
  Dose: "Dosen",
  Glas: "Gläser",
  Packung: "Packungen",
  Kopf: "Köpfe",
  Knolle: "Knollen",
  Stange: "Stangen",
  Prise: "Prisen",
};

/** German number format with at most two decimals: 1.5 becomes "1,5". */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function unitWord(unit: Unit, quantity: number): string {
  return quantity > 1 ? (PLURALS[unit] ?? unit) : unit;
}

/** Larger weights and volumes read better in kg and l. */
function humanScale(amount: Amount): Amount {
  if (amount.unit === "g" && amount.quantity >= 1000) {
    return { quantity: amount.quantity / 1000, unit: "kg" };
  }
  if (amount.unit === "ml" && amount.quantity >= 1000) {
    return { quantity: amount.quantity / 1000, unit: "l" };
  }
  return amount;
}

/** A full amount for the detail view: "150 ml", "2 Stück", "1,25 l", "2 Dosen". */
export function formatAmount(amount: Amount): string {
  const { quantity, unit } = humanScale(amount);
  return `${formatNumber(quantity)} ${unitWord(unit, quantity)}`;
}

/**
 * The quantity as it stands in front of the name on the list: pieces and packs as a
 * multiplier ("1x Schalotte", "2x Garnelen"), as on the drugstore's note, everything else
 * with its unit ("200 g Crème fraîche", "1 Bund Petersilie").
 */
export function formatPurchase(amount: Amount): string {
  if (amount.unit === "Stück") return `${formatNumber(amount.quantity)}x`;
  if (amount.unit === "Packung") return `${formatNumber(amount.quantity)}x`;
  return formatAmount(amount);
}

/** One list line: quantity where needed, name, then the note. */
export function formatLine(label: string, purchase: Amount | null, note: string | null): string {
  return [purchase ? formatPurchase(purchase) : null, label, note].filter(Boolean).join(" ");
}

/**
 * The name a line goes by for an amount: one piece in the singular ("1x Schalotte"), any
 * other amount by the catalog's name. A line without catalog forms keeps its label.
 */
export function labelFor(
  forms: { one: string; many: string } | null,
  label: string,
  amount: Amount | null,
): string {
  if (!forms) return label;
  return amount?.unit === "Stück" && amount.quantity === 1 ? forms.one : forms.many;
}
