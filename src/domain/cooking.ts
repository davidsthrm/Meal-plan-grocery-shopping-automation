/**
 * The cooking view of a recipe: which step is being cooked. Nothing is stored; the step lives
 * only while the view is open on the phone or tablet in the kitchen.
 */

/**
 * The step after a tap on "Weiter" (forward) or "Zurück" (back). Before the first step,
 * "Weiter" starts with the first one; it stays on the last and the first instead of running
 * past them. Null for a recipe without steps.
 */
export function stepAfter(
  current: number | null,
  count: number,
  direction: "forward" | "back",
): number | null {
  if (count <= 0) return null;
  if (current === null) return direction === "forward" ? 0 : null;
  const next = current + (direction === "forward" ? 1 : -1);
  return Math.min(count - 1, Math.max(0, next));
}

/** "Schritt 2 von 5", or how many steps there are before the first is started. */
export function stepText(current: number | null, count: number): string {
  if (count === 0) return "Keine Arbeitsschritte";
  if (current === null) return count === 1 ? "1 Schritt" : `${count} Schritte`;
  return `Schritt ${current + 1} von ${count}`;
}
