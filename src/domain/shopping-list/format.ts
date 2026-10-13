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

const METRIC: ReadonlySet<Unit> = new Set(["g", "kg", "ml", "l"]);
const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };

/**
 * A number of spoons, bunches or pieces the way a recipe prints it: "½", "1½", "2". Weights
 * and volumes keep their decimals: nobody weighs out "1¼ kg".
 */
function kitchenNumber(value: number): string {
  const whole = Math.floor(value);
  const fraction = FRACTIONS[String(Math.round((value - whole) * 100) / 100)];
  if (!fraction) return formatNumber(value);
  return whole === 0 ? fraction : `${whole}${fraction}`;
}

/** A full amount by itself: "150 ml", "2 Stück", "1,25 l", "2 Dosen", "½ Bund". */
export function formatAmount(amount: Amount): string {
  const { quantity, unit } = humanScale(amount);
  const number = METRIC.has(unit) ? formatNumber(quantity) : kitchenNumber(quantity);
  return `${number} ${unitWord(unit, quantity)}`;
}

/**
 * A count of pieces in front of a name: "3x" as in "3x Paprika". Never "3 Stück Paprika",
 * and the same for packs and pieces, so that the list reads one way. Part of a piece has no
 * "x": "½ Zitrone".
 */
export function formatPieces(quantity: number): string {
  return Number.isInteger(quantity) ? `${quantity}x` : kitchenNumber(quantity);
}

/**
 * An amount as it stands in front of an ingredient's name, on the list and in a recipe:
 * "3x" for pieces and packs, the unit for everything else ("600 g", "2 Dosen", "½ Bund").
 */
export function formatPurchase(amount: Amount): string {
  if (amount.unit === "Stück" || amount.unit === "Packung") return formatPieces(amount.quantity);
  return formatAmount(amount);
}

/** One list line: quantity where needed, name, then the note. */
export function formatLine(label: string, purchase: Amount | null, note: string | null): string {
  return [purchase ? formatPurchase(purchase) : null, label, note].filter(Boolean).join(" ");
}
