import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Tick } from "@/domain/shopping-list/ticks";
import { TickQueue, type Answer, type TickStore } from "@/lib/tick-sync";
import { SEED_HOUSEHOLD_ID } from "../seed/build-seed-sql";
import { asUser, createDatabase } from "./database";

/**
 * Ticks that arrive late: each line keeps the tick made last, by the time it was made, and
 * a tick sent twice changes nothing the second time.
 */

const LENA = "11111111-1111-4111-8111-111111111111";
const DAVID = "44444444-4444-4444-8444-444444444444";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const OTHER_HOUSEHOLD = "33333333-3333-4333-8333-333333333333";

let db: PGlite;
let list: string;

beforeAll(async () => {
  db = await createDatabase({ seed: true });
  await db.query("insert into auth.users (id) values ($1), ($2), ($3)", [LENA, DAVID, STRANGER]);
  await db.query("insert into public.household (id, name) values ($1, 'Nachbarn')", [
    OTHER_HOUSEHOLD,
  ]);
  await db.query(
    `insert into public.household_member (household_id, user_id)
     values ($1, $2), ($1, $3), ($4, $5)`,
    [SEED_HOUSEHOLD_ID, LENA, DAVID, OTHER_HOUSEHOLD, STRANGER],
  );
}, 60_000);

beforeEach(async () => {
  await db.query("delete from public.shopping_list");
  const created = await db.query<{ id: string }>(
    `insert into public.shopping_list (household_id, shopping_date, place)
     values ($1, '2026-10-12', 'supermarket') returning id`,
    [SEED_HOUSEHOLD_ID],
  );
  list = created.rows[0].id;
});

const at = (time: string) => `2026-10-12T${time}:00Z`;

async function tick(user: string, key: string, checked: boolean, time: string): Promise<boolean> {
  return asUser(db, user, async () => {
    const result = await db.query<{ changed: boolean }>(
      "select public.tick_shopping_line($1, $2, $3, $4) as changed",
      [list, key, checked, at(time)],
    );
    return result.rows[0].changed;
  });
}

async function state(key: string) {
  const result = await db.query<{ checked_at: Date | null; checked_by: string | null }>(
    "select checked_at, checked_by from public.shopping_line_state where shopping_list_id = $1 and line_key = $2",
    [list, key],
  );
  return result.rows[0];
}

describe("tick_shopping_line", () => {
  it("ticks a line and says who did it and when", async () => {
    expect(await tick(LENA, "milch@main", true, "10:05")).toBe(true);
    expect(await state("milch@main")).toEqual({
      checked_at: new Date(at("10:05")),
      checked_by: LENA,
    });
  });

  it("changes nothing when the same tick comes again", async () => {
    await tick(LENA, "milch@main", true, "10:05");
    expect(await tick(LENA, "milch@main", true, "10:05")).toBe(false);
    expect((await state("milch@main")).checked_by).toBe(LENA);
  });

  it("keeps the later tick when an earlier one arrives after it", async () => {
    // David opened the milk again at 10:20 with a connection. Lena's phone ticked it at 10:05
    // in the shop and sends it only now.
    await tick(DAVID, "milch@main", false, "10:20");
    expect(await tick(LENA, "milch@main", true, "10:05")).toBe(false);
    expect((await state("milch@main")).checked_at).toBeNull();
  });

  it("takes a later tick over an earlier one", async () => {
    await tick(LENA, "milch@main", true, "10:05");
    expect(await tick(DAVID, "milch@main", false, "10:20")).toBe(true);
    expect(await state("milch@main")).toEqual({ checked_at: null, checked_by: null });
  });

  it("counts a time in the future as now", async () => {
    // A phone whose clock runs a day ahead must not win over every later tick.
    await asUser(db, LENA, () =>
      db.query(
        "select public.tick_shopping_line($1, 'eier@main', true, now() + interval '1 day')",
        [list],
      ),
    );
    const stored = await db.query<{ late: boolean }>(
      "select checked_changed_at <= now() as late from public.shopping_line_state where line_key = 'eier@main'",
    );
    expect(stored.rows[0].late).toBe(true);
  });

  it("leaves a line's note, shop and move alone", async () => {
    await db.query(
      `insert into public.shopping_line_state (household_id, shopping_list_id, line_key, note)
       values ($1, $2, 'milch@main', 'WS 1.29')`,
      [SEED_HOUSEHOLD_ID, list],
    );
    // Noted before the column existed: no time of a tick yet, so any tick is newer.
    expect(await tick(LENA, "milch@main", true, "10:05")).toBe(true);
    const row = await db.query<{ note: string }>(
      "select note from public.shopping_line_state where line_key = 'milch@main'",
    );
    expect(row.rows[0].note).toBe("WS 1.29");
  });

  it("does not let anyone tick another household's list", async () => {
    await expect(tick(STRANGER, "milch@main", true, "10:05")).rejects.toThrow(/not found/);
    expect(await state("milch@main")).toBeUndefined();
  });
});

/** A phone: its own queue, sending through the function above as its user while online. */
function phone(user: string): { online: boolean; queue: TickQueue } {
  let kept: Tick[] = [];
  const store: TickStore = {
    read: async () => kept,
    write: async (ticks) => {
      kept = [...ticks];
    },
  };
  const device = { online: true, queue: undefined as unknown as TickQueue };
  device.queue = new TickQueue(store, async (ticks): Promise<Answer> => {
    if (!device.online) throw new TypeError("Failed to fetch");
    for (const each of ticks) {
      await asUser(db, user, () =>
        db.query("select public.tick_shopping_line($1, $2, $3, $4)", [
          list,
          each.key,
          each.checked,
          new Date(each.at).toISOString(),
        ]),
      );
    }
    return { kind: "taken", taken: ticks.map((each) => each.id), refused: [] };
  });
  return device;
}

describe("two phones in the shop", () => {
  const time = (clock: string) => new Date(at(clock)).getTime();
  const made = (id: string, key: string, checked: boolean, clock: string) => ({
    id,
    note: "2026-10-12.supermarket",
    key,
    checked,
    at: time(clock),
  });
  const ticked = async () =>
    (
      await db.query<{ line_key: string }>(
        "select line_key from public.shopping_line_state where checked_at is not null order by line_key",
      )
    ).rows.map((row) => row.line_key);

  it("never undo each other's ticks on different lines", async () => {
    const lena = phone(LENA);
    const david = phone(DAVID);
    lena.online = false;
    await lena.queue.add(made("l1", "milch@main", true, "10:01"));
    await lena.queue.add(made("l2", "eier@main", true, "10:02"));
    await david.queue.add(made("d1", "brot@main", true, "10:03"));
    await david.queue.add(made("d2", "butter@main", true, "10:04"));
    // Lena's phone finds a connection at the checkout.
    lena.online = true;
    await lena.queue.flush();
    expect(await ticked()).toEqual(["brot@main", "butter@main", "eier@main", "milch@main"]);
  });

  it("agree on the tick made last on the same line, whichever arrives last", async () => {
    const lena = phone(LENA);
    const david = phone(DAVID);
    lena.online = false;
    // Lena ticks the milk at 10:01 without a connection; David puts it back at 10:06 online.
    await lena.queue.add(made("l1", "milch@main", true, "10:01"));
    await david.queue.add(made("d1", "milch@main", false, "10:06"));
    lena.online = true;
    await lena.queue.flush();
    expect(await ticked()).toEqual([]);
  });
});
