import "server-only";
import type { Household } from "./auth";

/**
 * What the server keeps of a household's library between requests, under the household's
 * library counter (`library_version`, raised by the database with every change of a recipe,
 * a tag, an ingredient line or the catalog). Until November 2026 the week plan, the chooser
 * of a meal, Entdecken and the favourites read the whole library for every render: about 32
 * requests and 1.7 MB with 1,427 recipes, again for every button and every page fetched
 * ahead.
 *
 * Pages stay private and are rendered per request; only these reads are shared. The counter
 * is read with the household (`requireHousehold`) before anything here, so what is kept
 * under it is never older than it: a favourite tapped shows on the page that answers the tap.
 *
 * One entry per household and nothing else, no time or size limit: a household's library is
 * a few megabytes, and there are a handful of households.
 */

interface Entry {
  version: number;
  reads: Map<string, Promise<unknown>>;
}

const entries = new Map<string, Entry>();

/**
 * How long a read may take before those who come after it stop waiting for it and read for
 * themselves. A request to the database that hangs, as happens on a bad network, is given
 * up by the runtime only after five minutes: shared, it would keep every page of the
 * household waiting that long (seen in the browser tests behind a firewall, November 2026).
 * A read of the whole library takes a second or two.
 */
export const STUCK_MS = 10_000;

/**
 * `read`'s result for the household, kept until its library changes. Requests that arrive
 * together share one read. Whoever asks with an older counter than the one kept gets what is
 * kept: it is newer than what they asked for. A read that fails is not kept.
 *
 * What comes back is shared between requests: never change it in place.
 */
export function kept<T>(
  household: Pick<Household, "id" | "libraryVersion">,
  what: string,
  read: () => Promise<T>,
): Promise<T> {
  const version = household.libraryVersion;
  // Without a counter nobody could tell when to read again.
  if (version === null) return read();
  let entry = entries.get(household.id);
  if (!entry || entry.version < version) {
    entry = { version, reads: new Map() };
    entries.set(household.id, entry);
  }
  const known = entry.reads.get(what);
  if (known) return known as Promise<T>;

  const reads = entry.reads;
  const reading = read().then(frozen);
  reads.set(what, reading);
  const forget = () => {
    if (reads.get(what) === reading) reads.delete(what);
  };
  // Whoever asked for it goes on waiting; the next one reads afresh.
  const stuck = setTimeout(forget, STUCK_MS);
  reading.then(
    () => clearTimeout(stuck),
    () => {
      clearTimeout(stuck);
      forget();
    },
  );
  return reading;
}

/**
 * Freezes the objects and arrays of what is kept, the keys and values of its Maps and Sets
 * too, so that a change in place throws instead of reaching the next request. The Maps and
 * Sets themselves cannot be frozen: `set`, `add` and `delete` on them still work.
 */
function frozen<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  if (value instanceof Map) {
    for (const [key, entry] of value) {
      frozen(key);
      frozen(entry);
    }
  } else if (value instanceof Set) {
    for (const entry of value) frozen(entry);
  } else {
    for (const entry of Object.values(value)) frozen(entry);
  }
  return Object.freeze(value);
}
