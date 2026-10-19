import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_HOUSEHOLD_ID } from "../seed/build-seed-sql";
import { asServer, asUser, createDatabase } from "./database";

/**
 * Two households side by side: A, with a row in every table, and B, whose member tries
 * everything on A's data the Data API would let them try. A new table without a row here
 * fails the first test, so it cannot be left out by accident.
 */

const A = SEED_HOUSEHOLD_ID;
const B = "b0000000-0000-4000-8000-000000000000";
const MEMBER_A = "a1111111-1111-4111-8111-111111111111";
const MEMBER_B = "b1111111-1111-4111-8111-111111111111";

let db: PGlite;

/** One row in every table that the seed does not fill already. */
const ROWS_OF_A = `
  insert into public.household_member (household_id, user_id, role, display_name)
    values ('${A}', '${MEMBER_A}', 'admin', 'Anna');
  insert into public.household_invite (household_id, token_hash, created_by, expires_at)
    values ('${A}', 'hash-a', '${MEMBER_A}', now() + interval '7 days');
  insert into public.week_plan (id, household_id, week_start)
    values ('a0000000-0000-4000-8000-000000000001', '${A}', '2026-10-19');
  insert into public.plan_slot (id, household_id, week_plan_id, date, meal, kind, label)
    values ('a0000000-0000-4000-8000-000000000002', '${A}', 'a0000000-0000-4000-8000-000000000001', '2026-10-19', 'lunch', 'recipes', null),
           ('a0000000-0000-4000-8000-000000000003', '${A}', 'a0000000-0000-4000-8000-000000000001', '2026-10-19', 'dinner', 'free_text', 'Vesper');
  insert into public.plan_slot_item (household_id, plan_slot_id, recipe_id, servings)
    select '${A}', 'a0000000-0000-4000-8000-000000000002', id, 4 from public.recipe where household_id = '${A}' limit 1;
  insert into public.plan_slot_food (household_id, plan_slot_id, label)
    values ('${A}', 'a0000000-0000-4000-8000-000000000003', 'Brot');
  insert into public.plan_extra (household_id, week_plan_id, recipe_id, servings)
    select '${A}', 'a0000000-0000-4000-8000-000000000001', id, 4 from public.recipe where household_id = '${A}' limit 1;
  insert into public.recurring_item (id, household_id, label)
    values ('a0000000-0000-4000-8000-000000000004', '${A}', 'Milch');
  insert into public.week_recurring_item (household_id, week_plan_id, recurring_item_id, is_on)
    values ('${A}', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', true);
  insert into public.restock_item (household_id, text) values ('${A}', 'Mehl');
  insert into public.shopping_list (id, household_id, shopping_date, place)
    values ('a0000000-0000-4000-8000-000000000005', '${A}', '2026-10-19', 'supermarket');
  insert into public.shopping_line_state (household_id, shopping_list_id, line_key, note)
    values ('${A}', 'a0000000-0000-4000-8000-000000000005', 'milch@main', 'WS');
  insert into public.shopping_manual_entry (household_id, shopping_list_id, text)
    values ('${A}', 'a0000000-0000-4000-8000-000000000005', 'Milch WS 1.29');
  insert into public.shop_item_history (household_id, item_key, choice)
    values ('${A}', 'brezeln', 'market');
  insert into public.shopping_line (household_id, shopping_list_id, line_key, label, shop_id, aisle_group_id)
    select '${A}', 'a0000000-0000-4000-8000-000000000005', 'milch@main', 'Milch',
      (select id from public.shop where household_id = '${A}' limit 1),
      (select id from public.aisle_group where household_id = '${A}' limit 1);
  insert into public.import_batch (id, household_id) values ('a0000000-0000-4000-8000-000000000006', '${A}');
  insert into public.import_page (household_id, batch_id, position, file_name, photo_path)
    values ('${A}', 'a0000000-0000-4000-8000-000000000006', 0, 'seite.jpg', '${A}/a0000000-0000-4000-8000-000000000006/pages/0000.jpg');
  insert into public.import_job (household_id, batch_id, photo_paths)
    values ('${A}', 'a0000000-0000-4000-8000-000000000006', array['${A}/a0000000-0000-4000-8000-000000000006/pages/0000.jpg']);
  insert into public.recipe_photo (household_id, recipe_id, storage_path)
    select '${A}', id, '${A}/a0000000-0000-4000-8000-000000000006/pages/0000.jpg' from public.recipe where household_id = '${A}' limit 1;
  insert into public.ingredient_proposal (household_id, name, aisle_group_id, preferred_shop_id, default_unit)
    select '${A}', 'Belugalinsen',
      (select id from public.aisle_group where household_id = '${A}' limit 1),
      (select id from public.shop where household_id = '${A}' limit 1), 'g';
  insert into public.recipe_pair_kept (household_id, recipe_a, recipe_b)
    select '${A}', least(r1.id, r2.id), greatest(r1.id, r2.id)
    from (select id from public.recipe where household_id = '${A}' order by id limit 1) r1,
         (select id from public.recipe where household_id = '${A}' order by id offset 1 limit 1) r2;
`;

async function tables(): Promise<string[]> {
  const result = await db.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
  );
  return result.rows.map((row) => row.table_name);
}

/** The column that names the household: its own id for the household itself. */
const ownerColumn = (table: string) => (table === "household" ? "id" : "household_id");

async function rowsOfA(table: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    `select count(*)::int as n from public.${table} where ${ownerColumn(table)} = $1`,
    [A],
  );
  return result.rows[0].n;
}

/** Either refused outright, or allowed and touching nothing: both leave A's data alone. */
async function touchesNothing(sql: string, params: unknown[]): Promise<void> {
  try {
    const result = await db.query(sql, params);
    expect(result.affectedRows ?? 0, sql).toBe(0);
  } catch (error) {
    expect((error as Error).message, sql).toMatch(/row-level security|permission denied/);
  }
}

beforeAll(async () => {
  db = await createDatabase({ seed: true });
  await db.query("insert into auth.users (id) values ($1), ($2)", [MEMBER_A, MEMBER_B]);
  await db.exec(ROWS_OF_A);
  await db.query("insert into public.household (id, name) values ($1, 'Nachbarn')", [B]);
  await db.query(
    "insert into public.household_member (household_id, user_id, role) values ($1, $2, 'admin')",
    [B, MEMBER_B],
  );
});

describe("two households", () => {
  it("has a row of household A in every table", async () => {
    const empty = [];
    for (const table of await tables()) if ((await rowsOfA(table)) === 0) empty.push(table);
    expect(empty).toEqual([]);
  });

  it("shows a member of B nothing of A, in any table", async () => {
    for (const table of await tables()) {
      const seen = await asUser(db, MEMBER_B, () =>
        db.query<{ n: number }>(
          `select count(*)::int as n from public.${table} where ${ownerColumn(table)} = $1`,
          [A],
        ),
      );
      expect(seen.rows[0].n, table).toBe(0);
    }
  });

  it("lets a member of B change or delete nothing of A, in any table", async () => {
    const before = new Map<string, number>();
    for (const table of await tables()) before.set(table, await rowsOfA(table));
    for (const table of await tables()) {
      const owner = ownerColumn(table);
      await asUser(db, MEMBER_B, async () => {
        await touchesNothing(`update public.${table} set ${owner} = ${owner} where ${owner} = $1`, [
          A,
        ]);
        await touchesNothing(`delete from public.${table} where ${owner} = $1`, [A]);
      });
    }
    for (const table of await tables()) expect(await rowsOfA(table), table).toBe(before.get(table));
  });

  it("does not let a member of B add a row to A, in any table", async () => {
    for (const table of await tables()) {
      // A copy of one of A's rows, under a new id where the table has one.
      const copy = await db.query<{ row: Record<string, unknown> }>(
        `select to_jsonb(t) as row from public.${table} t where ${ownerColumn(table)} = $1 limit 1`,
        [A],
      );
      const row = { ...copy.rows[0].row };
      if ("id" in row && table !== "household") row.id = crypto.randomUUID();
      await asUser(db, MEMBER_B, async () => {
        await expect(
          db.query(
            `insert into public.${table} select * from jsonb_populate_record(null::public.${table}, $1)`,
            [row],
          ),
          table,
        ).rejects.toThrow(/row-level security|permission denied/);
      });
    }
  });

  it("does not let a member of B move a row of their own into A", async () => {
    await asServer(db, () =>
      db.exec(`
        insert into public.shop (household_id, name, short_label) values ('${B}', 'Lidl', 'Lidl');
        insert into public.tag (household_id, name, group_name) values ('${B}', 'Eigenes', 'Eigene');
        insert into public.restock_item (household_id, text) values ('${B}', 'Salz');
        insert into public.recipe (household_id, title) values ('${B}', 'Nachbars Suppe');
        insert into public.week_plan (household_id, week_start) values ('${B}', '2026-10-19');
      `),
    );
    for (const table of ["shop", "tag", "restock_item", "recipe", "week_plan"]) {
      await asUser(db, MEMBER_B, async () => {
        await expect(
          db.query(`update public.${table} set household_id = $1 where household_id = $2`, [A, B]),
          table,
        ).rejects.toThrow(/row-level security/);
      });
    }
  });

  it("does not let a member of B tick a line on a note of A", async () => {
    await asUser(db, MEMBER_B, async () => {
      await expect(
        db.query("select public.tick_shopping_line($1, 'milch@main', true, now())", [
          "a0000000-0000-4000-8000-000000000005",
        ]),
      ).rejects.toThrow(/shopping list not found/);
    });
  });

  it("does not let a member of B merge recipes of A", async () => {
    const recipes = await db.query<{ id: string }>(
      "select id from public.recipe where household_id = $1 order by id limit 2",
      [A],
    );
    await asUser(db, MEMBER_B, async () => {
      await expect(
        db.query("select public.merge_recipes($1, $2)", [recipes.rows[0].id, recipes.rows[1].id]),
      ).rejects.toThrow(/recipe not found/);
    });
    expect(await rowsOfA("recipe")).toBeGreaterThan(1);
  });

  it("keeps every photo a row names inside its household's folder", async () => {
    const recipe = await db.query<{ id: string }>(
      "select id from public.recipe where household_id = $1 limit 1",
      [A],
    );
    const foreign = `${B}/batch/pages/0000.jpg`;
    await asUser(db, MEMBER_A, async () => {
      for (const sql of [
        `insert into public.recipe_photo (household_id, recipe_id, storage_path) values ('${A}', '${recipe.rows[0].id}', '${foreign}')`,
        `insert into public.recipe_photo (household_id, recipe_id, storage_path) values ('${A}', '${recipe.rows[0].id}', '${A}/../${foreign}')`,
        `update public.recipe_photo set crop_path = '${foreign}' where household_id = '${A}'`,
        `update public.import_page set full_path = '${foreign}' where household_id = '${A}'`,
        `update public.import_job set photo_paths = array['${A}/x.jpg', '${foreign}'] where household_id = '${A}'`,
      ]) {
        await expect(db.query(sql), sql).rejects.toThrow(/in_household_folder/);
      }
    });
  });
});
