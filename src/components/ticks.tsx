"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { checkLine, completeListNote } from "@/app/(app)/einkauf/actions";
import { shownChecked, type Tick } from "@/domain/shopping-list/ticks";
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
      ticks: ticks.map(({ id, note, key, checked, at }) => ({ id, note, key, checked, at })),
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

/** A line as the page knows it: its key, and whether the server had it ticked. */
export interface PageLine {
  key: string;
  checked: boolean;
}

/** What a page says about one note: which, in which week, and when the server drew it. */
export interface NotePage {
  week: string;
  note: string;
  /** By the server's clock, in milliseconds. */
  renderedAt: number;
}

function useShown(page: NotePage, lines: readonly PageLine[]): boolean[] {
  const { ticks } = useTicks();
  return lines.map((line) =>
    shownChecked(
      ticks,
      { note: page.note, key: line.key },
      { checked: line.checked, renderedAt: page.renderedAt },
    ),
  );
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
}: {
  page: NotePage;
  line: PageLine;
  /** The line as it reads, for the button's name. */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const [shown] = useShown(page, [line]);
  return (
    <form
      action={checkLine}
      data-offline-ok
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        void tickQueue().add({
          id: newId(),
          note: page.note,
          key: line.key,
          checked: !shown,
          at: Date.now(),
        });
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
          aria-label={`${label}: ${shown ? "wieder offen" : "erledigt"}`}
          data-on={shown}
        >
          <TickIcon />
        </button>
      )}
    </form>
  );
}

/** "3 offen, 2 erledigt", with the ticks of this device that the page does not know yet. */
export function TickCount({ page, lines }: { page: NotePage; lines: readonly PageLine[] }) {
  const done = useShown(page, lines).filter(Boolean).length;
  return (
    <>
      {lines.length - done} offen{done > 0 ? `, ${done} erledigt` : ""}
    </>
  );
}

/** How many lines are ticked of how many: "5 von 12". */
export function TickProgress({ page, lines }: { page: NotePage; lines: readonly PageLine[] }) {
  const done = useShown(page, lines).filter(Boolean).length;
  return (
    <>
      {done} von {lines.length}
    </>
  );
}

/** Whether every line shows as ticked: the errand is done. */
export function useAllTicked(page: NotePage, lines: readonly PageLine[]): boolean {
  const shown = useShown(page, lines);
  return lines.length > 0 && shown.every(Boolean);
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
  const shown = useShown(page, lines);
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
            void queue.add({ id: newId(), note: page.note, key: line.key, checked: true, at });
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
