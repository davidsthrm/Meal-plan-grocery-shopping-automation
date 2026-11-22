import { convert, type Amount, type Unit } from "../units";

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

/**
 * Weights and volumes read in g and ml below 1 kg and 1 l, in kg and l from there. A drink
 * kept in litres read "0,15 l Haferdrink" (November 2026).
 */
function humanScale(amount: Amount): Amount {
  const { quantity, unit } = amount;
  if (unit === "g" && quantity >= 1000) return { quantity: quantity / 1000, unit: "kg" };
  if (unit === "ml" && quantity >= 1000) return { quantity: quantity / 1000, unit: "l" };
  if (unit === "kg" && quantity < 1) return { quantity: quantity * 1000, unit: "g" };
  if (unit === "l" && quantity < 1) return { quantity: quantity * 1000, unit: "ml" };
  return amount;
}

/** A full amount for the detail view: "150 ml", "2 Stück", "1,25 l", "2 Dosen". */
export function formatAmount(amount: Amount): string {
  const { quantity, unit } = humanScale(amount);
  return `${formatNumber(quantity)} ${unitWord(unit, quantity)}`;
}

/**
 * A number beside an amount of the same unit, both in the amount's scale: "3 von 6 Stück",
 * "500–630 ml". The bare number would keep its own: "0,5–630 ml".
 */
export function formatBeside(quantity: number, between: string, amount: Amount): string {
  const shown = convert(quantity, amount.unit, humanScale(amount).unit) ?? quantity;
  return `${formatNumber(shown)}${between}${formatAmount(amount)}`;
}

/**
 * The quantity as it stands in front of the name on the list: pieces and packs as a
 * multiplier ("1x Schalotte", "2x Garnelen"), as on the drugstore's note, a tin as so many
 * tins ("1x Dose Mais"), everything else with its unit ("200 g Crème fraîche", "1 Bund
 * Petersilie").
 */
export function formatPurchase(amount: Amount): string {
  if (amount.unit === "Stück") return `${formatNumber(amount.quantity)}x`;
  if (amount.unit === "Packung") return `${formatNumber(amount.quantity)}x`;
  if (amount.unit === "Dose") return `${formatNumber(amount.quantity)}x Dose`;
  return formatAmount(amount);
}

/**
 * One list line: quantity where needed, name, then the note. A name that says its unit does
 * not say it twice: "1x Dose Mais", not "1 Dose Mais (Dose)", and "1 Lorbeerblatt", not
 * "1 Blatt Lorbeerblätter" (November 2026).
 */
export function formatLine(label: string, purchase: Amount | null, note: string | null): string {
  const name = purchase ? withoutUnit(label, purchase.unit) : label;
  const amount =
    purchase &&
    (saysUnit(name, purchase.unit) ? formatNumber(purchase.quantity) : formatPurchase(purchase));
  return [amount, name, note].filter(Boolean).join(" ");
}

/** "Mais (Dose)" bought by the tin is "Mais". */
function withoutUnit(label: string, unit: Unit): string {
  const tag = ` (${unit})`;
  return label.endsWith(tag) ? label.slice(0, -tag.length) : label;
}

/** The units written as a word before the name: "1 Blatt", "2 Knollen". */
const UNIT_WORDS: ReadonlySet<Unit> = new Set([
  "Zehe",
  "Bund",
  "Stängel",
  "Zweig",
  "Blatt",
  "Scheibe",
  "Glas",
  "Becher",
  "Beutel",
  "Würfel",
  "Kopf",
  "Knolle",
  "Stange",
]);

/** Whether a name says the unit it is counted in: "Lorbeerblätter", "Kopfsalat". */
function saysUnit(name: string, unit: Unit): boolean {
  const lower = name.toLowerCase();
  return (
    UNIT_WORDS.has(unit) &&
    [unit, PLURALS[unit] ?? unit].some((word) => lower.includes(word.toLowerCase()))
  );
}

/**
 * The name a line goes by for an amount: one piece in the singular ("1x Schalotte"), and one
 * of a unit the name says ("1 Lorbeerblatt"); any other amount by the catalog's name. A line
 * without catalog forms keeps its label.
 */
export function labelFor(
  forms: { one: string; many: string } | null,
  label: string,
  amount: Amount | null,
): string {
  if (!forms) return label;
  const one =
    amount?.quantity === 1 && (amount.unit === "Stück" || saysUnit(forms.many, amount.unit));
  return one ? forms.one : forms.many;
}
