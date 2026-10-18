/**
 * Ticks made on a device, before and after the server has them. In the shop the phone may
 * have no connection, so a tick is kept on the device first and sent when it can be.
 *
 * A tick is not "toggle this line" but "this line is now ticked" (or open again), with the
 * time it was made. Sent twice it changes nothing the second time, and the server keeps,
 * per line, the tick made last (`tick_shopping_line`): two people ticking different lines
 * never undo each other, and of two ticks on one line the later one wins, whichever arrives
 * first.
 */

export interface Tick {
  /** Unique per tick, so that the server's answer can be matched to it. */
  id: string;
  /** The note it was made on: "2026-10-12.supermarket". */
  note: string;
  /** The line on that note (`ShoppingLine.key`). */
  key: string;
  checked: boolean;
  /** When it was made, in milliseconds, by the device's clock. */
  at: number;
  /** When the server took it, by the device's clock. Null while it waits. */
  sentAt: number | null;
}

/** How long a tick the server took is kept to correct a page that is older than it. */
export const KEEP_SENT_MS = 7 * 24 * 60 * 60 * 1000;

/** At most this many ticks go in one request. */
export const BATCH = 100;

const lineOf = (tick: Pick<Tick, "note" | "key">) => `${tick.note}|${tick.key}`;

/**
 * Adds a tick. It replaces whatever the device still holds for the same line: only the
 * last word on a line matters, sent or not.
 */
export function enqueue(ticks: readonly Tick[], tick: Tick): Tick[] {
  const line = lineOf(tick);
  return [...ticks.filter((each) => lineOf(each) !== line), tick];
}

/** The ticks still to send, the oldest first, at most one request's worth. */
export function waiting(ticks: readonly Tick[], max = Infinity): Tick[] {
  return ticks
    .filter((tick) => tick.sentAt === null)
    .sort((a, b) => a.at - b.at)
    .slice(0, max);
}

/**
 * The server took the ticks named, or refused them for good. A taken tick no longer waits;
 * a refused one is dropped, or it would be sent again forever. A tick made on the same line
 * meanwhile has another id and still waits.
 */
export function settle(
  ticks: readonly Tick[],
  answer: { taken: readonly string[]; refused?: readonly string[] },
  now: number,
): Tick[] {
  const taken = new Set(answer.taken);
  const refused = new Set(answer.refused ?? []);
  return ticks
    .filter((tick) => !refused.has(tick.id))
    .map((tick) => (taken.has(tick.id) && tick.sentAt === null ? { ...tick, sentAt: now } : tick));
}

/**
 * Whether a line shows as ticked. The page says what the server knew when it was drawn
 * (`renderedAt`, by the server's clock). The device's own tick says more where the page
 * cannot know it yet: while the tick waits, or when the page is older than the moment the
 * server took it, as a page kept for the shop without a connection is.
 */
export function shownChecked(
  ticks: readonly Tick[],
  line: Pick<Tick, "note" | "key">,
  page: { checked: boolean; renderedAt: number },
): boolean {
  const wanted = lineOf(line);
  const own = ticks.find((tick) => lineOf(tick) === wanted);
  if (!own) return page.checked;
  if (own.sentAt === null || own.sentAt > page.renderedAt) return own.checked;
  return page.checked;
}

/** Forgets ticks the server took long ago. Waiting ticks are never forgotten. */
export function forget(ticks: readonly Tick[], now: number, keep = KEEP_SENT_MS): Tick[] {
  return ticks.filter((tick) => tick.sentAt === null || now - tick.sentAt < keep);
}
