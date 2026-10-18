import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asAnonymous, asUser, createDatabase } from "./database";

/** Leaving a household, and its admin removing a member. */

const HOUSEHOLD = "c0000000-0000-4000-8000-000000000000";
const NEIGHBOURS = "d0000000-0000-4000-8000-000000000000";
const ADMIN = "c1111111-1111-4111-8111-111111111111";
const MEMBER = "c2222222-2222-4222-8222-222222222222";
const NEIGHBOUR = "d1111111-1111-4111-8111-111111111111";
const LIST = "c0000000-0000-4000-8000-000000000001";

let db: PGlite;

async function membersOf(household: string): Promise<string[]> {
  const result = await db.query<{ user_id: string }>(
    "select user_id from public.household_member where household_id = $1 order by user_id",
    [household],
  );
  return result.rows.map((row) => row.user_id);
}

beforeEach(async () => {
  db = await createDatabase();
  await db.query("insert into auth.users (id) values ($1), ($2), ($3)", [ADMIN, MEMBER, NEIGHBOUR]);
  await db.query(
    "insert into public.household (id, name) values ($1, 'Stührmann'), ($2, 'Nachbarn')",
    [HOUSEHOLD, NEIGHBOURS],
  );
  await db.query(
    `insert into public.household_member (household_id, user_id, role) values
       ($1, $2, 'admin'), ($1, $3, 'member'), ($4, $5, 'admin')`,
    [HOUSEHOLD, ADMIN, MEMBER, NEIGHBOURS, NEIGHBOUR],
  );
  await db.query(
    "insert into public.shopping_list (id, household_id, shopping_date) values ($1, $2, '2026-10-19')",
    [LIST, HOUSEHOLD],
  );
});

describe("leaving a household", () => {
  it("takes a member out of it", async () => {
    await asUser(db, MEMBER, () => db.query("select public.leave_household()"));
    expect(await membersOf(HOUSEHOLD)).toEqual([ADMIN]);
  });

  it("is not for the admin, who would leave nobody to look after the members", async () => {
    await asUser(db, ADMIN, async () => {
      await expect(db.query("select public.leave_household()")).rejects.toThrow(
        /the admin cannot leave/,
      );
    });
    expect(await membersOf(HOUSEHOLD)).toEqual([ADMIN, MEMBER]);
  });
});

describe("removing a member", () => {
  it("is done by the admin, and the member sees nothing of the household afterwards", async () => {
    await asUser(db, ADMIN, () => db.query("select public.remove_household_member($1)", [MEMBER]));
    expect(await membersOf(HOUSEHOLD)).toEqual([ADMIN]);
    await asUser(db, MEMBER, async () => {
      const seen = await db.query("select 1 from public.household");
      expect(seen.rows).toEqual([]);
    });
  });

  it("refuses the ticks a removed member's device still sends", async () => {
    await asUser(db, ADMIN, () => db.query("select public.remove_household_member($1)", [MEMBER]));
    await asUser(db, MEMBER, async () => {
      await expect(
        db.query("select public.tick_shopping_line($1, 'milch@main', true, now())", [LIST]),
      ).rejects.toThrow(/shopping list not found/);
    });
    const stored = await db.query("select 1 from public.shopping_line_state");
    expect(stored.rows).toEqual([]);
  });

  it("is not for a member who is no admin", async () => {
    await asUser(db, MEMBER, async () => {
      await expect(db.query("select public.remove_household_member($1)", [ADMIN])).rejects.toThrow(
        /member not found/,
      );
    });
    expect(await membersOf(HOUSEHOLD)).toEqual([ADMIN, MEMBER]);
  });

  it("is not for the admin of another household", async () => {
    await asUser(db, NEIGHBOUR, async () => {
      await expect(db.query("select public.remove_household_member($1)", [MEMBER])).rejects.toThrow(
        /member not found/,
      );
    });
    expect(await membersOf(HOUSEHOLD)).toEqual([ADMIN, MEMBER]);
  });

  it("does not remove the admin themselves", async () => {
    await asUser(db, ADMIN, async () => {
      await expect(db.query("select public.remove_household_member($1)", [ADMIN])).rejects.toThrow(
        /leave_household/,
      );
    });
    expect(await membersOf(HOUSEHOLD)).toEqual([ADMIN, MEMBER]);
  });

  it("is out of reach without a login", async () => {
    await asAnonymous(db, async () => {
      await expect(db.query("select public.remove_household_member($1)", [MEMBER])).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query("select public.leave_household()")).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
