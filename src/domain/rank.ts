/**
 * A stable pseudo-random order. Things that are equally good should not always appear in
 * the same order, yet the order must not jump around between two looks at the same page.
 * The seed decides: the same seed gives the same order, another seed another one.
 */
export function rank(seed: string, id: string): number {
  // FNV-1a, 32 bit.
  let hash = 0x811c9dc5;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Sorts a copy by that order. */
export function shuffled<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  return [...items].sort((a, b) => rank(seed, a.id) - rank(seed, b.id) || a.id.localeCompare(b.id));
}
