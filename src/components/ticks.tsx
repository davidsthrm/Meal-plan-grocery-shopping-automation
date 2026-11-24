"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { checkLine, completeListNote } from "@/app/(app)/einkauf/actions";
import {
  isBought,
  leavesNote,
  type Decision,
  type PlannedLine,
} from "@/domain/shopping-list/decisions";
import {
  FOLD_MS,
  settleTicked,
  type Settled,
  type ShownLine,
} from "@/domain/shopping-list/ticked-last";
import { shownDecision, shownTick, type Tick } from "@/domain/shopping-list/ticks";
import { OWN_CHANGE } from "@/lib/live-refresh";
import { indexedDbTickStore } from "@/lib/tick-store";
import { syncText, TickQueue, type Answer, type Snapshot, type TickStore } from "@/lib/tick-sync";
import { TickIcon } from "./icons";
import { useOnline } from "./connection";

/**
 * Ticking off a line in the shop, with or without a connection. A tap is shown at once and
 * kept on the device (`TickQueue`), and sent whenever there is a connection: right away,
 * when the connection comes back, when the app is opened again. Without scripts each box is
 * the plain form it always was.
 */

/** How often waiting ticks are tried again while the page is open. */
const RETRY_MS = 15_000;

/** Who wants to know when the server took ticks: the page, to read itself again. */
const sentListeners = new Set<() => void>();

async function send(ticks: readonly Tick[]): Promise<Answer> {
  const response = await fetch("/api/einkauf/haken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticks: ticks.map(({ id, note, key, checked, decision, about, at }) => ({
        id,
        note,
        key,
        checked,
        decision,
        about,
        at,
      })),
    }),
    cache: "no-store",
    // Without a login the proxy sends to the login page: that is no answer to the ticks.
    redirect: "manual",
  });
  if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403)
    return { kind: "signed-out" };
  // Asked for something it cannot do: sending the same again would not help.
  if (response.status >= 400 && response.status < 500)
    return { kind: "taken", taken: [], refused: ticks.map((tick) => tick.id) };
  if (!response.ok) return { kind: "offline" };
  // The server has the ticks: their echo from Realtime is this device's own.
  window.dispatchEvent(new Event(OWN_CHANGE));
  const body = (await response.json()) as { taken: string[]; refused: string[] };
  for (const listener of sentListeners) listener();
  return { kind: "taken", ...body };
}

const inMemory = (): TickStore => {
  let kept: Tick[] = [];
  return {
    read: async () => kept,
    write: async (ticks) => {
      kept = [...ticks];
    },
  };
};

let shared: TickQueue | null = null;

/** The ticks of this device: one queue for every note and view of the page. */
function tickQueue(): TickQueue {
  if (shared) return shared;
  const queue = new TickQueue(
    typeof indexedDB === "undefined" ? inMemory() : indexedDbTickStore(),
    send,
  );
  shared = queue;
  const retry = () => {
    if (document.visibilityState === "visible") void queue.flush();
  };
  window.addEventListener("online", retry);
  document.addEventListener("visibilitychange", retry);
  setInterval(() => {
    if (navigator.onLine && queue.get().ticks.some((tick) => tick.sentAt === null)) retry();
  }, RETRY_MS);
  void queue.flush();
  return queue;
}

const NOTHING: Snapshot = { ticks: [], state: "idle" };

function useTicks(): Snapshot {
  return useSyncExternalStore(
    (listener) => tickQueue().subscribe(listener),
    () => tickQueue().get(),
    () => NOTHING,
  );
}

/** A random id, also where `crypto.randomUUID` is missing (a phone on the dev server's IP). */
function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A line as the page knows it: its key, whether the server had it ticked, and what else it
 * had decided about it (removed, bought in part). Without a decision, the tick says it.
 */
export interface PageLine {
  key: string;
  checked: boolean;
  decision?: Decision;
}

const pageDecision = (line: PageLine): Decision =>
  line.decision ?? (line.checked ? { kind: "bought" } : { kind: "open" });

/** What a page says about one note: which, in which week, and when the server drew it. */
export interface NotePage {
  week: string;
  note: string;
  /** By the server's clock, in milliseconds. */
  renderedAt: number;
}

/** What each line shows as decided: this device's own decision over an older page. */
export function useDecisions(page: NotePage, lines: readonly PageLine[]): Decision[] {
  const { ticks } = useTicks();
  return lines.map((line) =>
    shownDecision(
      ticks,
      { note: page.note, key: line.key },
      { decision: pageDecision(line), renderedAt: page.renderedAt },
    ),
  );
}

/**
 * Where the lines of one view stand (`settleTicked`), kept outside React because it changes
 * by the clock: a line goes a moment after the last tick, not with a render. The view tells
 * it after every render what its lines show (`see`); a line opened on the note holds it
 * (`hold`).
 */
class Placing {
  private settled: Settled;
  private lines: readonly ShownLine[];
  private readonly held = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly movers = new Set<(keys: readonly string[]) => void>();

  constructor(lines: readonly ShownLine[], now: number) {
    this.lines = lines;
    this.settled = settleTicked(null, lines, now);
  }

  get = (): Settled => this.settled;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) clearTimeout(this.timer);
    };
  };

  /** Told which lines leave their place, while the page still shows them there. */
  onMove = (mover: (keys: readonly string[]) => void): (() => void) => {
    this.movers.add(mover);
    return () => this.movers.delete(mover);
  };

  see(lines: readonly ShownLine[]): void {
    this.lines = lines;
    this.run();
  }

  hold = (key: string, opened: boolean): void => {
    if (opened === this.held.has(key)) return;
    if (opened) this.held.add(key);
    else this.held.delete(key);
    this.run();
  };

  private run(): void {
    const now = Date.now();
    clearTimeout(this.timer);
    const before = this.settled;
    const lines = this.lines.map((line) =>
      this.held.has(line.key) ? { ...line, held: true } : line,
    );
    // Asked for less motion, a line simply moves.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = settleTicked(before, lines, now, { foldMs: still ? 0 : FOLD_MS });
    if (next !== before) {
      const leaving = [...next.folding, ...next.placed].filter(
        (key) => !before.folding.has(key) && !before.placed.has(key),
      );
      if (leaving.length > 0) for (const mover of this.movers) mover(leaving);
      this.settled = next;
      for (const listener of this.listeners) listener();
    }
    if (next.due !== null) this.timer = setTimeout(() => this.run(), Math.max(0, next.due - now));
  }
}

/**
 * Where the lines of a view stand: still to buy, or under "Gekauft" at its end. From what this
 * device shows as decided, also ticks still waiting for a connection, never from the order the
 * server sent: the page read again after a tick, or `TickRefresh`, moves no line a second time.
 */
export function useTickedLast(page: NotePage, lines: readonly PageLine[]) {
  const { ticks } = useTicks();
  const decisions = useDecisions(page, lines);
  const shown: ShownLine[] = lines.map((line, index) => ({
    key: line.key,
    decision: decisions[index],
    at: shownTick(ticks, { note: page.note, key: line.key }, page.renderedAt)?.at,
  }));
  const [placing] = useState(() => new Placing(shown, Date.now()));
  const settled = useSyncExternalStore(placing.subscribe, placing.get, placing.get);
  useLayoutEffect(() => placing.see(shown));
  return { settled, hold: placing.hold, onMove: placing.onMove };
}

/** Whether each line shows as ticked: bought, in full or in part. */
function useShown(page: NotePage, lines: readonly PageLine[]): boolean[] {
  return useDecisions(page, lines).map(isBought);
}

/** Lines still on the note: neither removed nor moved elsewhere on this device. */
function useOnNote(page: NotePage, lines: readonly PageLine[]): Decision[] {
  return useDecisions(page, lines).filter((decision) => !leavesNote(decision, page.note));
}

/**
 * Decides what became of a line on this device, and sends it like a tick. `about` is the
 * line as the device saw it: the plan kept beside what was bought, and where it was bought.
 */
export function decide(
  page: NotePage,
  key: string,
  decision: Decision,
  about?: { planned: PlannedLine; item: string; shop: string | null },
): Promise<{ refused: boolean }> {
  return tickQueue().add({
    id: newId(),
    note: page.note,
    key,
    checked: isBought(decision),
    decision,
    about,
    at: Date.now(),
  });
}

/** A new id for something made on this device: a tick, or the rest of a line. */
export function deviceId(): string {
  return newId();
}

/**
 * The page reads itself again once the server has the ticks: the stamp of a finished errand
 * and the notes among the others come from there. Once per note page.
 */
export function TickRefresh() {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sent = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    sentListeners.add(sent);
    return () => {
      clearTimeout(timer);
      sentListeners.delete(sent);
    };
  }, [router]);
  return null;
}

/**
 * The box in front of a line. A tap ticks the line on this device and sends the tick. With
 * `children` the whole row is the button, as in the view for the shop.
 */
export function TickButton({
  page,
  line,
  label,
  className,
  children,
  about,
}: {
  page: NotePage;
  line: PageLine;
  /** The line as it reads, for the button's name. */
  label: string;
  className?: string;
  children?: ReactNode;
  /** The line as planned, for the history of where it was bought. */
  about?: Parameters<typeof decide>[3];
}) {
  const [shown] = useShown(page, [line]);
  return (
    <form
      action={checkLine}
      data-offline-ok
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        void decide(page, line.key, shown ? { kind: "open" } : { kind: "bought" }, about);
      }}
    >
      <input type="hidden" name="week" value={page.week} />
      <input type="hidden" name="note" value={page.note} />
      <input type="hidden" name="back" value="note" />
      <input type="hidden" name="key" value={line.key} />
      <input type="hidden" name="checked" value={shown ? "0" : "1"} />
      {children ? (
        <button className="store-row" aria-pressed={shown} data-on={shown}>
          <span className="tickbox tickbox-large" data-on={shown} aria-hidden>
            <TickIcon />
          </span>
          {children}
        </button>
      ) : (
        <button
          className="tickbox"
          aria-label={`${label}: ${shown ? "wieder offen" : "gekauft"}`}
          data-on={shown}
        >
          <TickIcon />
        </button>
      )}
    </form>
  );
}

/**
 * "3 offen, 2 gekauft", with the ticks of this device that the page does not know yet. It
 * said "erledigt" above the lines' own "Gekauft" (audit, 24 November 2026).
 */
export function TickCount({ page, lines }: { page: NotePage; lines: readonly PageLine[] }) {
  const onNote = useOnNote(page, lines);
  const done = onNote.filter(isBought).length;
  return (
    <>
      {onNote.length - done} offen{done > 0 ? `, ${done} gekauft` : ""}
    </>
  );
}

/** How many lines are ticked of how many: "5 von 12". */
export function TickProgress({ page, lines }: { page: NotePage; lines: readonly PageLine[] }) {
  const onNote = useOnNote(page, lines);
  return (
    <>
      {onNote.filter(isBought).length} von {onNote.length}
    </>
  );
}

/** Whether every line shows as ticked: the errand is done. */
export function useAllTicked(page: NotePage, lines: readonly PageLine[]): boolean {
  const shown = useDecisions(page, lines);
  return lines.length > 0 && shown.every((decision) => decision.kind !== "open");
}

/**
 * "Einkauf erledigt": ticks every line still open, on this device first like any tick, so
 * that it works in the shop without a connection too.
 */
export function CompleteNote({
  page,
  lines,
  className = "btn btn-primary w-full sm:w-auto",
}: {
  page: NotePage;
  lines: readonly PageLine[];
  className?: string;
}) {
  const shown = useDecisions(page, lines).map((decision) => decision.kind !== "open");
  if (lines.length === 0 || shown.every(Boolean)) return null;
  return (
    <form
      action={completeListNote}
      data-offline-ok
      onSubmit={(event) => {
        event.preventDefault();
        const queue = tickQueue();
        const at = Date.now();
        lines.forEach((line, index) => {
          if (!shown[index])
            void queue.add({
              id: newId(),
              note: page.note,
              key: line.key,
              checked: true,
              decision: { kind: "bought" },
              at,
            });
        });
      }}
    >
      <input type="hidden" name="week" value={page.week} />
      <input type="hidden" name="note" value={page.note} />
      <input type="hidden" name="back" value="note" />
      <button className={className}>
        <TickIcon />
        Einkauf erledigt
      </button>
    </form>
  );
}

/** "Offline – 3 Häkchen warten", or nothing while every tick has arrived. */
export function SyncStatus({ className = "" }: { className?: string }) {
  const { ticks, state } = useTicks();
  const online = useOnline();
  const text = syncText(ticks.filter((tick) => tick.sentAt === null).length, state, online);
  return (
    <p aria-live="polite" className={`sync-status ${className}`} data-shown={text !== ""}>
      {text}
    </p>
  );
}
