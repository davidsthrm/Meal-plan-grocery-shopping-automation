/**
 * Reads a quantity the way people type it in a form: "2", "0,5", "1/2", "1 1/2", "½", "1½".
 * Returns null for an empty field and undefined for text that is not a quantity, so the two
 * can be told apart.
 */
const VULGAR: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
};

export function parseQuantity(text: string): number | null | undefined {
  const typed = text.trim();
  if (typed === "") return null;

  const withFraction = /^(\d+)?\s*([½¼¾⅓⅔⅛])$/.exec(typed);
  if (withFraction) return Number(withFraction[1] ?? 0) + VULGAR[withFraction[2]];

  const slashed = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(typed);
  if (slashed) {
    const denominator = Number(slashed[3]);
    if (denominator === 0) return undefined;
    return Number(slashed[1] ?? 0) + Number(slashed[2]) / denominator;
  }

  if (!/^\d+(?:[.,]\d+)?$/.test(typed)) return undefined;
  return Number(typed.replace(",", "."));
}

/** A quantity for a form field: German decimal comma, no trailing zeros. */
export function quantityText(quantity: number | null): string {
  if (quantity === null) return "";
  return String(Math.round(quantity * 1000) / 1000).replace(".", ",");
}
