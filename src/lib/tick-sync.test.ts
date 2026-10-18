import { describe, expect, it } from "vitest";
import type { Tick } from "@/domain/shopping-list/ticks";
import { syncText, TickQueue, type Answer, type TickStore } from "./tick-sync";

const NOTE = "2026-10-12.supermarket";

/** IndexedDB as an array. */
function memoryStore(initial: Tick[] = []): TickStore & { kept: Tick[] } {
  const store = {
    kept: initial,
    read: async () => store.kept,
    write: async (ticks: readonly Tick[]) => {
      store.kept = [...ticks];
    },
  };
  return store;
}

/** A server that is reachable or not, and remembers every request it got. */
function server() {
  const fake = {
    online: true,
    requests: [] as string[][],
    send: async (ticks: readonly Tick[]): Promise<Answer> => {
      if (!fake.online) throw new TypeError("Failed to fetch");
      fake.requests.push(ticks.map((tick) => tick.id));
      return { kind: "taken", taken: ticks.map((tick) => tick.id), refused: [] };
    },
  };
  return fake;
}

let clock = 1000;
const now = () => clock;
const tick = (id: string, key: string, checked = true) => ({
  id,
  note: NOTE,
  key,
  checked,
  at: ++clock,
});
const waitingIds = (queue: TickQueue) =>
  queue
    .get()
    .ticks.filter((each) => each.sentAt === null)
    .map((each) => each.id);

describe("TickQueue", () => {
  it("sends a tick right away when there is a connection", async () => {
    const remote = server();
    const queue = new TickQueue(memoryStore(), remote.send, now);
    await queue.add(tick("a", "milch@main"));
    expect(remote.requests).toEqual([["a"]]);
    expect(waitingIds(queue)).toEqual([]);
    expect(queue.get().state).toBe("idle");
  });

  it("keeps ticks made without a connection and sends them once it is back", async () => {
    const remote = server();
    remote.online = false;
    const queue = new TickQueue(memoryStore(), remote.send, now);
    await queue.add(tick("a", "milch@main"));
    await queue.add(tick("b", "eier@main"));
    await queue.add(tick("c", "brot@main"));
    expect(queue.get().state).toBe("offline");
    expect(waitingIds(queue)).toEqual(["a", "b", "c"]);

    remote.online = true;
    await queue.flush();
    // In one request, in the order they were made.
    expect(remote.requests).toEqual([["a", "b", "c"]]);
    expect(waitingIds(queue)).toEqual([]);
  });

  it("sends only the last word on a line that was ticked and opened again offline", async () => {
    const remote = server();
    remote.online = false;
    const queue = new TickQueue(memoryStore(), remote.send, now);
    await queue.add(tick("a", "milch@main", true));
    await queue.add(tick("b", "milch@main", false));
    remote.online = true;
    await queue.flush();
    expect(remote.requests).toEqual([["b"]]);
  });

  it("keeps the ticks on the device: a page opened later still has them to send", async () => {
    const remote = server();
    remote.online = false;
    const store = memoryStore();
    const first = new TickQueue(store, remote.send, now);
    await first.add(tick("a", "milch@main"));
    await first.settled();

    // The app was closed in the shop and opened again at home.
    remote.online = true;
    const again = new TickQueue(store, remote.send, now);
    await again.flush();
    expect(remote.requests).toEqual([["a"]]);
    await again.settled();
    expect(store.kept.every((each) => each.sentAt !== null)).toBe(true);
  });

  it("does not lose a tick made while the request before it is on its way", async () => {
    let release: (answer: Answer) => void = () => {};
    const requests: string[][] = [];
    const send = (ticks: readonly Tick[]) => {
      requests.push(ticks.map((each) => each.id));
      if (requests.length === 1) return new Promise<Answer>((resolve) => (release = resolve));
      return Promise.resolve<Answer>({
        kind: "taken",
        taken: ticks.map((each) => each.id),
        refused: [],
      });
    };
    const queue = new TickQueue(memoryStore(), send, now);
    const first = queue.add(tick("a", "milch@main"));
    await queue.settled();
    // While "a" is on its way, the same line is opened again and another one is ticked.
    void queue.add(tick("b", "milch@main", false));
    void queue.add(tick("c", "eier@main"));
    release({ kind: "taken", taken: ["a"], refused: [] });
    await first;
    expect(requests).toEqual([["a"], ["b", "c"]]);
    expect(waitingIds(queue)).toEqual([]);
    expect(queue.get().ticks.find((each) => each.key === "milch@main")?.checked).toBe(false);
  });

  it("is harmless to send twice: an answer that was lost sends the same tick again", async () => {
    const remote = server();
    let lose = true;
    const send = async (ticks: readonly Tick[]): Promise<Answer> => {
      const answer = await remote.send(ticks);
      // The server stored it, but the answer never reached the phone.
      if (lose) {
        lose = false;
        throw new TypeError("Network connection was lost");
      }
      return answer;
    };
    const queue = new TickQueue(memoryStore(), send, now);
    await queue.add(tick("a", "milch@main"));
    expect(waitingIds(queue)).toEqual(["a"]);
    await queue.flush();
    // The same tick, with the same id and time: the server keeps what it has.
    expect(remote.requests).toEqual([["a"], ["a"]]);
    expect(waitingIds(queue)).toEqual([]);
  });

  it("keeps the ticks when the login is gone, and says so", async () => {
    const queue = new TickQueue(memoryStore(), async () => ({ kind: "signed-out" }), now);
    await queue.add(tick("a", "milch@main"));
    expect(queue.get().state).toBe("signed-out");
    expect(waitingIds(queue)).toEqual(["a"]);
  });

  it("drops a tick the server refuses for good, and sends the others", async () => {
    const queue = new TickQueue(
      memoryStore(),
      async (ticks) => ({
        kind: "taken",
        taken: ticks.filter((each) => each.id !== "bad").map((each) => each.id),
        refused: ["bad"],
      }),
      now,
    );
    await queue.add({ ...tick("bad", "x@main"), note: "kein Zettel" });
    await queue.add(tick("a", "milch@main"));
    expect(queue.get().ticks.map((each) => each.id)).toEqual(["a"]);
    expect(waitingIds(queue)).toEqual([]);
  });

  it("stops when the server answers without naming any tick, instead of asking forever", async () => {
    let requests = 0;
    const queue = new TickQueue(
      memoryStore(),
      async () => {
        requests += 1;
        return { kind: "taken", taken: [], refused: [] };
      },
      now,
    );
    await queue.add(tick("a", "milch@main"));
    expect(requests).toBe(1);
    expect(queue.get().state).toBe("failed");
    expect(waitingIds(queue)).toEqual(["a"]);
  });

  it("forgets ticks the server took long ago when it starts", async () => {
    const old: Tick = { id: "old", note: NOTE, key: "a", checked: true, at: 1, sentAt: 2 };
    const queue = new TickQueue(memoryStore([old]), server().send, () => 30 * 24 * 3600 * 1000);
    await queue.settled();
    expect(queue.get().ticks).toEqual([]);
  });

  it("tells whoever listens when something changes", async () => {
    const queue = new TickQueue(memoryStore(), server().send, now);
    const states: string[] = [];
    queue.subscribe(() => states.push(queue.get().state));
    await queue.add(tick("a", "milch@main"));
    expect(states).toContain("sending");
    expect(states.at(-1)).toBe("idle");
  });
});

describe("syncText", () => {
  it("says how many ticks wait while there is no connection", () => {
    expect(syncText(3, "offline", true)).toBe("Offline – 3 Häkchen warten");
    expect(syncText(1, "idle", false)).toBe("Offline – 1 Häkchen wartet");
    expect(syncText(0, "idle", false)).toBe("Offline");
  });

  it("says nothing while all is well or a tick is on its way", () => {
    expect(syncText(0, "idle", true)).toBe("");
    expect(syncText(2, "sending", true)).toBe("");
  });

  it("asks to sign in again when the login is gone", () => {
    expect(syncText(2, "signed-out", true)).toBe("2 Häkchen warten – bitte neu anmelden");
  });

  it("says that ticks wait when the server did not take them", () => {
    expect(syncText(2, "failed", true)).toBe("2 Häkchen warten");
  });
});
