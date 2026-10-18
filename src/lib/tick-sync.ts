import { BATCH, enqueue, forget, settle, waiting, type Tick } from "@/domain/shopping-list/ticks";

/**
 * The ticks of this device on their way to the server: kept first, sent when there is a
 * connection, and sent again until the server has them. Where they are kept and how they
 * are sent is handed in, so that this runs in the browser (IndexedDB, `fetch`) and in a
 * test alike.
 */

/** Where the ticks are kept between two visits: IndexedDB in the browser. */
export interface TickStore {
  read(): Promise<Tick[]>;
  write(ticks: readonly Tick[]): Promise<void>;
}

/** What became of a request with ticks. */
export type Answer =
  /** The server answered: these it took, these it will never take. */
  | { kind: "taken"; taken: readonly string[]; refused: readonly string[] }
  /** No connection, or no answer: sent again later. */
  | { kind: "offline" }
  /** The login is gone: sent again once someone has signed in. */
  | { kind: "signed-out" };

export type Send = (ticks: readonly Tick[]) => Promise<Answer>;

export type SyncState = "idle" | "sending" | "offline" | "signed-out" | "failed";

export interface Snapshot {
  ticks: readonly Tick[];
  state: SyncState;
}

export class TickQueue {
  private snapshot: Snapshot = { ticks: [], state: "idle" };
  private readonly listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private readonly loaded: Promise<void>;

  constructor(
    private readonly store: TickStore,
    private readonly send: Send,
    private readonly now: () => number = Date.now,
  ) {
    this.loaded = store
      .read()
      .then((stored) => {
        // A tick made while the store was read is newer than anything in it.
        const ticks = this.snapshot.ticks.reduce(enqueue, forget(stored, this.now()));
        this.set({ ticks });
      })
      .catch(() => {
        // Nothing kept, or no IndexedDB: the ticks of this visit still work.
      });
  }

  /** The ticks and how sending them goes, for `useSyncExternalStore`. */
  get = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Keeps a tick and sends it right away, or as soon as that works. */
  add(tick: Omit<Tick, "sentAt">): Promise<void> {
    this.set({ ticks: enqueue(this.snapshot.ticks, { ...tick, sentAt: null }) });
    this.save();
    return this.flush();
  }

  /**
   * Sends whatever waits, one request after the other, until nothing waits or a request
   * fails. Called again while it runs, it returns the run that is on its way: that run
   * picks up ticks made meanwhile.
   */
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.sendAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Waits until what is kept is written: for a test, or before the page goes. */
  settled(): Promise<void> {
    return Promise.all([this.loaded, this.saving]).then(() => undefined);
  }

  private async sendAll(): Promise<void> {
    await this.loaded;
    for (;;) {
      const batch = waiting(this.snapshot.ticks, BATCH);
      if (batch.length === 0) {
        this.set({ state: "idle" });
        return;
      }
      this.set({ state: "sending" });
      let answer: Answer;
      try {
        answer = await this.send(batch);
      } catch {
        answer = { kind: "offline" };
      }
      if (answer.kind !== "taken") {
        this.set({ state: answer.kind });
        return;
      }
      this.set({ ticks: settle(this.snapshot.ticks, answer, this.now()) });
      this.save();
      // An answer that names none of them would send the same request forever.
      const answered = new Set([...answer.taken, ...answer.refused]);
      if (!batch.some((tick) => answered.has(tick.id))) {
        this.set({ state: "failed" });
        return;
      }
    }
  }

  private set(change: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }

  private save(): void {
    this.saving = this.saving
      .then(() => this.store.write(this.snapshot.ticks))
      .catch(() => {
        // Kept in memory for this visit; the next tick tries to write again.
      });
  }
}

/**
 * The sync status on a note, or nothing while all is well: "Offline – 3 Häkchen warten".
 * `online` is what the browser says of its connection.
 */
export function syncText(waitingCount: number, state: SyncState, online: boolean): string {
  const ticks = waitingCount === 1 ? "1 Häkchen wartet" : `${waitingCount} Häkchen warten`;
  if (!online || state === "offline") return waitingCount > 0 ? `Offline – ${ticks}` : "Offline";
  if (waitingCount === 0 || state === "sending") return "";
  if (state === "signed-out") return `${ticks} – bitte neu anmelden`;
  return ticks;
}
