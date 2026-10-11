import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { UNITS } from "@/domain/units";
import { buildSeedSql, SEED_HOUSEHOLD_ID } from "../seed/build-seed-sql";
import { seedCatalog } from "../seed/catalog";
import { seedRecipes } from "../seed/recipes";
import { asAnonymous, asUser, createDatabase } from "./database";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const OTHER_HOUSEHOLD = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) t`, params);
  return result.rows[0].n;
}

beforeAll(async () => {
  db = await createDatabase({ seed: true });
  await db.query("insert into auth.users (id) values ($1), ($2)", [MEMBER, STRANGER]);
  await db.query("insert into public.household_member (household_id, user_id) values ($1, $2)", [
    SEED_HOUSEHOLD_ID,
    MEMBER,
  ]);
  // A second household the member must never see or write into.
  await db.query("insert into public.household (id, name) values ($1, 'Nachbarn')", [
    OTHER_HOUSEHOLD,
  ]);
  await db.query("insert into public.household_member (household_id, user_id) values ($1, $2)", [
    OTHER_HOUSEHOLD,
    STRANGER,
  ]);
});

describe("seed", () => {
  it("is the generated output of supabase/seed/*.ts", () => {
    const onDisk = readFileSync(fileURLToPath(new URL("../seed.sql", import.meta.url)), "utf8");
    expect(onDisk, "run `npm run seed:build`").toBe(buildSeedSql());
  });

  it("loads the whole catalog and the sample recipes", async () => {
    expect(await count("select 1 from public.shop")).toBe(seedCatalog.shops.length);
    expect(await count("select 1 from public.aisle_group")).toBe(seedCatalog.aisleGroups.length);
    expect(await count("select 1 from public.ingredient")).toBe(seedCatalog.ingredients.length);
    expect(await count("select 1 from public.recipe")).toBe(seedRecipes.length);
    expect(await count("select 1 from public.recipe_ingredient")).toBe(
      seedRecipes.reduce((sum, r) => sum + r.ingredients.length, 0),
    );
  });

  it("has about 150 or more common ingredients", () => {
    expect(seedCatalog.ingredients.length).toBeGreaterThanOrEqual(150);
  });

  it("keeps the two recipes without a printed title in the review queue", async () => {
    const result = await db.query<{ title: string }>(
      "select title from public.recipe where status = 'needs_review' order by title",
    );
    expect(result.rows.map((r) => r.title)).toEqual(["Ohne Titel (S. 88)", "Ohne Titel (S. 97)"]);
  });
});

describe("schema", () => {
  it("knows exactly the units of the domain", async () => {
    const result = await db.query<{ unit: string }>(
      "select unnest(enum_range(null::public.unit))::text as unit",
    );
    expect(result.rows.map((r) => r.unit).sort()).toEqual([...UNITS].sort());
  });

  it("has row level security on every table", async () => {
    const result = await db.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(result.rows.map((r) => r.relname)).toEqual([]);
  });

  it("scopes every table to a household", async () => {
    const result = await db.query<{ table_name: string }>(`
      select t.table_name
      from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name <> 'household'
        and not exists (
          select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'household_id'
        )
    `);
    expect(result.rows.map((r) => r.table_name)).toEqual([]);
  });

  it("rejects a pack ingredient without a pack size", async () => {
    await expect(
      db.query(
        `insert into public.ingredient (household_id, name, aisle_group_id, preferred_shop_id, default_unit, buying_mode)
         select household_id, 'Testware', aisle_group_id, preferred_shop_id, 'g', 'pack'
         from public.ingredient limit 1`,
      ),
    ).rejects.toThrow(/ingredient_pack_needs_size/);
  });

  it("rejects a week that does not start on a Monday", async () => {
    await expect(
      db.query(
        "insert into public.week_plan (household_id, week_start) values ($1, '2026-10-13')",
        [SEED_HOUSEHOLD_ID],
      ),
    ).rejects.toThrow(/week_plan_week_start_check/);
  });

  it("requires a label for free text and away slots", async () => {
    const week = await db.query<{ id: string }>(
      "insert into public.week_plan (household_id, week_start) values ($1, '2026-10-12') returning id",
      [SEED_HOUSEHOLD_ID],
    );
    const insertSlot = (kind: string, label: string | null) =>
      db.query(
        "insert into public.plan_slot (household_id, week_plan_id, date, meal, kind, label) values ($1, $2, '2026-10-13', 'lunch', $3, $4)",
        [SEED_HOUSEHOLD_ID, week.rows[0].id, kind, label],
      );
    await expect(insertSlot("away", null)).rejects.toThrow(/plan_slot_label_required/);
    await expect(insertSlot("away", "Oma Heidrun")).resolves.toBeDefined();
  });

  it("does not let a row point into another household", async () => {
    // Even with full rights: a recipe line of one household cannot use another's ingredient.
    await db.query(
      `insert into public.recipe (id, household_id, title, servings_min, servings_max)
       values ('44444444-4444-4444-8444-444444444444', $1, 'Fremdes Rezept', 4, 4)`,
      [OTHER_HOUSEHOLD],
    );
    await expect(
      db.query(
        `insert into public.recipe_ingredient (household_id, recipe_id, position, ingredient_id, original_text)
         select $1, '44444444-4444-4444-8444-444444444444', 0, id, 'geliehen' from public.ingredient limit 1`,
        [OTHER_HOUSEHOLD],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("row level security", () => {
  it("shows a member their household's data", async () => {
    await asUser(db, MEMBER, async () => {
      expect(await count("select 1 from public.ingredient")).toBe(seedCatalog.ingredients.length);
      expect(await count("select 1 from public.recipe")).toBe(seedRecipes.length);
      expect(await count("select 1 from public.household")).toBe(1);
    });
  });

  it("shows nothing of it to a user of another household", async () => {
    await asUser(db, STRANGER, async () => {
      expect(await count("select 1 from public.ingredient")).toBe(0);
      expect(await count("select 1 from public.shop")).toBe(0);
      expect(await count("select 1 from public.recipe_ingredient")).toBe(0);
      expect(await count("select 1 from public.household where id = $1", [SEED_HOUSEHOLD_ID])).toBe(
        0,
      );
    });
  });

  it("does not let a member write into another household", async () => {
    await asUser(db, MEMBER, async () => {
      await expect(
        db.query(
          "insert into public.shop (household_id, name, short_label) values ($1, 'Lidl', 'Lidl')",
          [OTHER_HOUSEHOLD],
        ),
      ).rejects.toThrow(/row-level security/);
      const updated = await db.query(
        "update public.recipe set title = 'gekapert' where household_id = $1",
        [OTHER_HOUSEHOLD],
      );
      expect(updated.affectedRows).toBe(0);
    });
  });

  it("lets a member add to their own household", async () => {
    await asUser(db, MEMBER, async () => {
      await db.query(
        "insert into public.shop (household_id, name, short_label, sort_order) values ($1, 'Metzger', 'Metzger', 3)",
        [SEED_HOUSEHOLD_ID],
      );
      expect(await count("select 1 from public.shop")).toBe(seedCatalog.shops.length + 1);
    });
  });

  it("does not let a member add themselves or others to a household", async () => {
    await asUser(db, MEMBER, async () => {
      await expect(
        db.query("insert into public.household_member (household_id, user_id) values ($1, $2)", [
          OTHER_HOUSEHOLD,
          MEMBER,
        ]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("gives anonymous visitors no access at all", async () => {
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    expect(tables.rows.length).toBeGreaterThan(15);
    await asAnonymous(db, async () => {
      for (const { table_name } of tables.rows) {
        await expect(
          db.query(`select 1 from public.${table_name} limit 1`),
          table_name,
        ).rejects.toThrow(/permission denied/);
      }
    });
  });
});
