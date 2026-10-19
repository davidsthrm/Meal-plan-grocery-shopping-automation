import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_HOUSEHOLD_ID } from "../seed/build-seed-sql";
import { asUser, createDatabase } from "./database";

/**
 * What became of a line in the shop: bought, bought in part, removed, moved or open again.
 * Each line keeps the decision made last, by the moment it was made, and keeps what the
 * plan had next to what was bought.
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
  await db.query("delete from public.shop_item_history");
  const created = await db.query<{ id: string }>(
    `insert into public.shopping_list (household_id, shopping_date, place)
     values ($1, '2026-10-19', 'supermarket') returning id`,
    [SEED_HOUSEHOLD_ID],
  );
  list = created.rows[0].id;
});

const at = (time: string) => `2026-10-19T${time}:00Z`;

const PLANNED = {
  name: "Ensinger Sport",
  quantity: 6,
  unit: "Stück",
  date: "2026-10-19",
  place: "supermarket",
};

async function decide(
  user: string,
  key: string,
  decision: Record<string, unknown>,
  time: string,
): Promise<string> {
  return asUser(db, user, async () => {
    const result = await db.query<{ answer: string }>(
      "select public.decide_shopping_line($1, $2, $3, $4) as answer",
      [list, key, decision, at(time)],
    );
    return result.rows[0].answer;
  });
}

interface Row {
  status: string | null;
  checked_at: Date | null;
  bought_name: string | null;
  bought_quantity: string | null;
  bought_unit: string | null;
  substituted: boolean;
  remainder: string | null;
  removed_reason: string | null;
  planned: unknown;
  decided_by: string | null;
}

async function row(key: string): Promise<Row> {
  const result = await db.query<Row>(
    `select status, checked_at, bought_name, bought_quantity::text, bought_unit, substituted,
       remainder, removed_reason, planned, decided_by
     from public.shopping_line_state where shopping_list_id = $1 and line_key = $2`,
    [list, key],
  );
  return result.rows[0];
}

describe("decide_shopping_line", () => {
  it("keeps three of six bottles bought and the rest discarded, next to the plan", async () => {
    expect(
      await decide(
        DAVID,
        "wasser@main",
        { kind: "partial", quantity: 3, unit: "Stück", remainder: "discarded", planned: PLANNED },
        "10:05",
      ),
    ).toBe("applied");
    expect(await row("wasser@main")).toMatchObject({
      status: "partially_bought",
      checked_at: new Date(at("10:05")),
      bought_quantity: "3",
      bought_unit: "Stück",
      remainder: "discarded",
      planned: PLANNED,
      decided_by: DAVID,
    });
  });

  it("removes a line without deleting it, with its reason", async () => {
    await decide(
      DAVID,
      "manual:shots",
      { kind: "removed", reason: "nicht mehr nötig", planned: PLANNED },
      "10:06",
    );
    expect(await row("manual:shots")).toMatchObject({
      status: "removed",
      checked_at: null,
      removed_reason: "nicht mehr nötig",
    });
  });

  it("marks a substitute, and keeps the plan of the first departure", async () => {
    await decide(DAVID, "kaese@main", { kind: "removed", planned: PLANNED }, "10:01");
    await decide(
      DAVID,
      "kaese@main",
      { kind: "bought", name: "Geramont", planned: { ...PLANNED, name: "Bavaria Blu" } },
      "10:02",
    );
    expect(await row("kaese@main")).toMatchObject({
      status: "bought",
      bought_name: "Geramont",
      substituted: true,
      removed_reason: null,
      planned: PLANNED,
    });
  });

  it("opens a line again and forgets what was decided", async () => {
    await decide(
      DAVID,
      "wasser@main",
      { kind: "partial", quantity: 3, unit: "Stück", remainder: "discarded" },
      "10:05",
    );
    expect(await decide(DAVID, "wasser@main", { kind: "open" }, "10:06")).toBe("applied");
    expect(await row("wasser@main")).toMatchObject({
      status: null,
      checked_at: null,
      bought_quantity: null,
      remainder: null,
    });
  });

  it("says when the same decision comes again, and keeps the one made last", async () => {
    await decide(LENA, "eier@main", { kind: "removed" }, "10:20");
    expect(await decide(LENA, "eier@main", { kind: "removed" }, "10:20")).toBe("same");
    // David's phone bought the eggs at 10:05 without a connection and sends it only now.
    expect(await decide(DAVID, "eier@main", { kind: "bought" }, "10:05")).toBe("older");
    expect((await row("eier@main")).status).toBe("removed");
  });

  it("takes the decision over a tick made earlier, and a tick over an earlier decision", async () => {
    await asUser(db, LENA, () =>
      db.query("select public.tick_shopping_line($1, 'milch@main', true, $2)", [list, at("10:01")]),
    );
    await decide(DAVID, "milch@main", { kind: "removed" }, "10:02");
    expect((await row("milch@main")).status).toBe("removed");
    await asUser(db, LENA, () =>
      db.query("select public.tick_shopping_line($1, 'milch@main', true, $2)", [list, at("10:03")]),
    );
    expect(await row("milch@main")).toMatchObject({ status: "bought", removed_reason: null });
  });

  it("refuses a part bought without what became of the rest", async () => {
    await expect(
      decide(DAVID, "wasser@main", { kind: "partial", quantity: 3, unit: "Stück" }, "10:05"),
    ).rejects.toThrow(/shopping_line_state_partial/);
  });

  it("refuses what it does not know", async () => {
    await expect(decide(DAVID, "wasser@main", { kind: "toggle" }, "10:05")).rejects.toThrow(
      /unknown decision/,
    );
  });

  it("does not let anyone decide on another household's list", async () => {
    await expect(decide(STRANGER, "milch@main", { kind: "removed" }, "10:05")).rejects.toThrow(
      /not found/,
    );
    expect(await row("milch@main")).toBeUndefined();
  });
});

describe("remember_shop_choice", () => {
  const choices = async () =>
    (
      await db.query<{ item_key: string; choice: string; times: number }>(
        "select item_key, choice, times from public.shop_item_history order by item_key, choice",
      )
    ).rows;

  it("counts each purchase at a shop", async () => {
    for (let time = 0; time < 2; time++) {
      await asUser(db, LENA, () =>
        db.query("select public.remember_shop_choice($1, 'brezeln', 'butcher-shop')", [
          SEED_HOUSEHOLD_ID,
        ]),
      );
    }
    expect(await choices()).toEqual([{ item_key: "brezeln", choice: "butcher-shop", times: 2 }]);
  });

  it("does not write into another household", async () => {
    await expect(
      asUser(db, STRANGER, () =>
        db.query("select public.remember_shop_choice($1, 'brezeln', 'market')", [
          SEED_HOUSEHOLD_ID,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(await choices()).toEqual([]);
  });
});
