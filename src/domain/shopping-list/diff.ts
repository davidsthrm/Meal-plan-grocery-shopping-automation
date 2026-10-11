import type { Amount } from "../units";
import type { LineState, ShoppingLine } from "./types";

export type LineChange =
  | { type: "added"; line: ShoppingLine }
  | { type: "removed"; line: ShoppingLine }
  | { type: "changed"; before: ShoppingLine; after: ShoppingLine };

function sameAmount(a: Amount | null, b: Amount | null): boolean {
  if (a === null || b === null) return a === b;
  return a.quantity === b.quantity && a.unit === b.unit;
}

/**
 * What changed on the list after the plan changed. Lines are matched by key, so everything
 * the household stored against a key (note, shop, at home, checked) stays with its line.
 *
 * A line counts as changed only when the quantity shown on the list differs. Going from
 * 150 ml to 190 ml of cream is still one pack and is not worth reporting.
 */
export function diffLines(before: ShoppingLine[], after: ShoppingLine[]): LineChange[] {
  const previous = new Map(before.map((line) => [line.key, line]));
  const current = new Map(after.map((line) => [line.key, line]));
  const changes: LineChange[] = [];

  for (const line of after) {
    const old = previous.get(line.key);
    if (!old) changes.push({ type: "added", line });
    else if (!sameAmount(old.purchase, line.purchase)) {
      changes.push({ type: "changed", before: old, after: line });
    }
  }
  for (const line of before) {
    if (!current.has(line.key)) changes.push({ type: "removed", line });
  }
  return changes;
}

/**
 * Keys the household changed that no longer have a line. A checked-off item the plan no
 * longer needs is worth telling them about; the caller decides how.
 */
export function orphanedStateKeys(
  states: Record<string, LineState>,
  lines: ShoppingLine[],
): string[] {
  const keys = new Set(lines.map((line) => line.key));
  return Object.keys(states).filter((key) => !keys.has(key));
}
