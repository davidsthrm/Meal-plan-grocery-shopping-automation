import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_HOUSEHOLD_ID } from "../seed/build-seed-sql";
import { asAnonymous, asUser, createDatabase } from "./database";

/** Merging two recipes that are the same dish, and keeping both of a pair. */

const MEMBER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const OTHER_HOUSEHOLD = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase({ seed: true });
  await db.query("insert into auth.users (id) values ($1), ($2)", [MEMBER, STRANGER]);
  await db.query("insert into public.household (id, name) values ($1, 'Nachbarn')", [
    OTHER_HOUSEHOLD,
  ]);
  await db.query(
    "insert into public.household_member (household_id, user_id) values ($1, $2), ($3, $4)",
    [SEED_HOUSEHOLD_ID, MEMBER, OTHER_HOUSEHOLD, STRANGER],
  );
  // Applying every migration takes a while, more so beside the other database test.
}, 60_000);

async function recipe(title: string, columns = "", values = ""): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.recipe (household_id, title, servings_min, servings_max, status${columns})
     values ($1, $2, 4, 4, 'approved'${values}) returning id`,
    [SEED_HOUSEHOLD_ID, title],
  );
  return result.rows[0].id;
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

describe("merge_recipes", () => {
  it("moves meals, extras, marks and the household's tags to the kept recipe", async () => {
    const kept = await recipe("Linsensalat");
    const duplicate = await recipe(
      "Rustikaler Linsensalat",
      ", is_favorite, wanted_at, source_text",
      ", true, '2026-10-01T10:00:00Z', 'Linsen kochen …'",
    );
    const weeks = await db.query<{ id: string }>(
      `insert into public.week_plan (household_id, week_start)
       values ($1, '2026-09-28'), ($1, '2026-10-05') returning id`,
      [SEED_HOUSEHOLD_ID],
    );
    const [lastWeek, thisWeek] = weeks.rows.map((row) => row.id);
    const slot = await one<{ id: string }>(
      `insert into public.plan_slot (household_id, week_plan_id, date, meal, kind)
       values ($1, $2, '2026-09-29', 'dinner', 'recipes') returning id`,
      [SEED_HOUSEHOLD_ID, lastWeek],
    );
    await db.query(
      `insert into public.plan_slot_item (household_id, plan_slot_id, recipe_id, servings)
       values ($1, $2, $3, 4)`,
      [SEED_HOUSEHOLD_ID, slot.id, duplicate],
    );
    // Both are extras of this week; only the duplicate of last week.
    await db.query(
      `insert into public.plan_extra (household_id, week_plan_id, recipe_id, servings)
       values ($1, $2, $3, 2), ($1, $2, $4, 3), ($1, $5, $4, 1)`,
      [SEED_HOUSEHOLD_ID, thisWeek, kept, duplicate, lastWeek],
    );
    const own = await one<{ id: string }>(
      "insert into public.tag (household_id, name, group_name) values ($1, 'Omas Rezept', 'Eigene') returning id",
      [SEED_HOUSEHOLD_ID],
    );
    await db.query(
      `insert into public.recipe_tag (household_id, recipe_id, tag_id)
       select $1::uuid, $2::uuid, id from public.tag where household_id = $1 and key in ('salat', 'schnell')
       union all select $1::uuid, $2::uuid, $3::uuid`,
      [SEED_HOUSEHOLD_ID, duplicate, own.id],
    );
    const batch = await one<{ id: string }>(
      "insert into public.import_batch (household_id) values ($1) returning id",
      [SEED_HOUSEHOLD_ID],
    );
    const job = await one<{ id: string }>(
      `insert into public.import_job (household_id, batch_id, status, recipe_id)
       values ($1, $2, 'approved', $3) returning id`,
      [SEED_HOUSEHOLD_ID, batch.id, duplicate],
    );

    await asUser(db, MEMBER, () =>
      db.query("select public.merge_recipes($1, $2)", [kept, duplicate]),
    );

    expect(
      await one("select count(*)::int as n from public.recipe where id = $1", [duplicate]),
    ).toEqual({
      n: 0,
    });
    expect(
      await one("select recipe_id from public.plan_slot_item where plan_slot_id = $1", [slot.id]),
    ).toEqual({ recipe_id: kept });
    const extras = await db.query(
      "select week_plan_id, recipe_id, servings from public.plan_extra where recipe_id = $1 order by servings",
      [kept],
    );
    expect(extras.rows).toEqual([
      { week_plan_id: lastWeek, recipe_id: kept, servings: 1 },
      { week_plan_id: thisWeek, recipe_id: kept, servings: 5 },
    ]);
    expect(
      await one<{ is_favorite: boolean; wanted: boolean; source_text: string }>(
        "select is_favorite, wanted_at is not null as wanted, source_text from public.recipe where id = $1",
        [kept],
      ),
    ).toEqual({ is_favorite: true, wanted: true, source_text: "Linsen kochen …" });
    // The household's own tag and the category carry over; the suggested effort does not.
    const tags = await db.query<{ name: string }>(
      `select t.name from public.recipe_tag l join public.tag t on t.id = l.tag_id
       where l.recipe_id = $1 order by t.name`,
      [kept],
    );
    expect(tags.rows.map((row) => row.name)).toEqual(["Omas Rezept", "Salat"]);
    expect(
      await one("select status, recipe_id from public.import_job where id = $1", [job.id]),
    ).toEqual({ status: "discarded", recipe_id: null });
  });

  it("keeps the kept recipe's own category", async () => {
    const kept = await recipe("Kürbissuppe");
    const duplicate = await recipe("Kürbis-Suppe");
    await db.query(
      `insert into public.recipe_tag (household_id, recipe_id, tag_id)
       select $1::uuid, $2::uuid, id from public.tag where household_id = $1 and key = 'suppe-eintopf'
       union all select $1::uuid, $3::uuid, id from public.tag where household_id = $1 and key = 'hauptgericht'`,
      [SEED_HOUSEHOLD_ID, kept, duplicate],
    );
    await asUser(db, MEMBER, () =>
      db.query("select public.merge_recipes($1, $2)", [kept, duplicate]),
    );
    const keys = await db.query<{ key: string }>(
      "select t.key from public.recipe_tag l join public.tag t on t.id = l.tag_id where l.recipe_id = $1",
      [kept],
    );
    expect(keys.rows.map((row) => row.key)).toEqual(["suppe-eintopf"]);
  });

  it("does not merge a recipe into itself", async () => {
    const id = await recipe("Allein");
    await expect(
      asUser(db, MEMBER, () => db.query("select public.merge_recipes($1, $1)", [id])),
    ).rejects.toThrow(/itself/);
  });

  it("does not let anyone touch another household's recipes", async () => {
    const kept = await recipe("Nicht deins");
    const duplicate = await recipe("Nicht deins 2");
    await expect(
      asUser(db, STRANGER, () =>
        db.query("select public.merge_recipes($1, $2)", [kept, duplicate]),
      ),
    ).rejects.toThrow(/not found/);
    expect(
      await one("select count(*)::int as n from public.recipe where id = $1", [duplicate]),
    ).toEqual({ n: 1 });
  });

  it("is closed to anonymous visitors", async () => {
    const kept = await recipe("Anonym");
    const duplicate = await recipe("Anonym 2");
    await expect(
      asAnonymous(db, () => db.query("select public.merge_recipes($1, $2)", [kept, duplicate])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("recipe_pair_kept", () => {
  it("stores a pair once, smaller id first, and goes with either recipe", async () => {
    const [x, y] = [await recipe("Paar 1"), await recipe("Paar 2")].sort();
    await expect(
      db.query(
        "insert into public.recipe_pair_kept (household_id, recipe_a, recipe_b) values ($1, $2, $3)",
        [SEED_HOUSEHOLD_ID, y, x],
      ),
    ).rejects.toThrow(/recipe_pair_kept_order/);
    await asUser(db, MEMBER, () =>
      db.query(
        "insert into public.recipe_pair_kept (household_id, recipe_a, recipe_b) values ($1, $2, $3)",
        [SEED_HOUSEHOLD_ID, x, y],
      ),
    );
    await db.query("delete from public.recipe where id = $1", [y]);
    expect(
      await one("select count(*)::int as n from public.recipe_pair_kept where recipe_a = $1", [x]),
    ).toEqual({
      n: 0,
    });
  });
});

describe("recipe.checked_fields", () => {
  it("names only the fields that are checked", async () => {
    const id = await recipe("Geprüft");
    await db.query("update public.recipe set checked_fields = '{protein,time}' where id = $1", [
      id,
    ]);
    await expect(
      db.query("update public.recipe set checked_fields = '{title}' where id = $1", [id]),
    ).rejects.toThrow(/check/);
  });
});
