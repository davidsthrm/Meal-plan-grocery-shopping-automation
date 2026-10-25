/**
 * A figure, or how much is still missing before it says anything: a chart of one week is no
 * trend, and a "most cooked" list where every dish was cooked once ranks nothing.
 */
export type Stat<T> = { enough: true; value: T } | { enough: false; have: number; need: number };

export function stat<T>(have: number, need: number, value: () => T): Stat<T> {
  return have >= need ? { enough: true, value: value() } : { enough: false, have, need };
}
