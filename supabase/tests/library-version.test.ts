import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_HOUSEHOLD_ID } from "../seed/build-seed-sql";
import { asUser, createDatabase } from "./database";

/**
 * The counter the server keeps the library under (src/server/kept.ts): it has to rise with
 * every change of what is kept, or a page shows an older library.
 */

const MEMBER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const OTHER_HOUSEHOLD = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

async function version(household = SEED_HOUSEHOLD_ID): Promise<number> {
  const result = await db.query<{ version: number }>(
    "select version::int as version from public.library_version where household_id = $1",
    [household],
  );
  return result.rows[0].version;
}

/** How much the counter rose while `work` ran. */
async function rise(work: () => Promise<unknown>): Promise<number> {
  const before = await version();
  await work();
  return (await version()) - before;
}

const asMember = <T>(work: () => Promise<T>) => asUser(db, MEMBER, work);

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
});

describe("the library's counter", () => {
  it("is there for a new household, at zero", async () => {
    expect(await version(OTHER_HOUSEHOLD)).toBe(0);
  });

  it("rises when a member adds, changes or deletes a recipe", async () => {
    let id = "";
    expect(
      await rise(() =>
        asMember(async () => {
          const added = await db.query<{ id: string }>(
            "insert into public.recipe (household_id, title, servings_min, servings_max) values ($1, 'Probe', 4, 4) returning id",
            [SEED_HOUSEHOLD_ID],
          );
          id = added.rows[0].id;
        }),
      ),
    ).toBe(1);
    expect(
      await rise(() =>
        asMember(() => db.query("update public.recipe set is_favorite = true where id = $1", [id])),
      ),
    ).toBe(1);
    expect(
      await rise(() => asMember(() => db.query("delete from public.recipe where id = $1", [id]))),
    ).toBe(1);
  });

  it("rises for a tag link, an ingredient line, a catalog ingredient and a shop", async () => {
    const recipe = await db.query<{ id: string }>(
      "select id from public.recipe where household_id = $1 limit 1",
      [SEED_HOUSEHOLD_ID],
    );
    const recipeId = recipe.rows[0].id;
    const changes: [string, string, unknown[]][] = [
      [
        "a tag link",
        `insert into public.recipe_tag (household_id, recipe_id, tag_id)
         select $1, $2, t.id from public.tag t
         where t.household_id = $1 and not exists (
           select 1 from public.recipe_tag l where l.recipe_id = $2 and l.tag_id = t.id)
         limit 1`,
        [SEED_HOUSEHOLD_ID, recipeId],
      ],
      [
        "an ingredient line",
        "update public.recipe_ingredient set original_text = original_text || ' ' where id = (select id from public.recipe_ingredient where recipe_id = $1 limit 1)",
        [recipeId],
      ],
      [
        "a catalog ingredient",
        "update public.ingredient set synonyms = synonyms || '{Probe}' where id = (select id from public.ingredient where household_id = $1 limit 1)",
        [SEED_HOUSEHOLD_ID],
      ],
      [
        "a new shop",
        "insert into public.shop (household_id, name, short_label) values ($1, 'Probeladen', 'PL')",
        [SEED_HOUSEHOLD_ID],
      ],
      ["a deleted shop", "delete from public.shop where name = 'Probeladen'", []],
    ];
    for (const [what, sql, params] of changes) {
      expect(await rise(() => asMember(() => db.query(sql, params))), what).toBe(1);
    }
  });

  it("does not rise for a meal planned", async () => {
    expect(
      await rise(() =>
        asMember(async () => {
          const week = await db.query<{ id: string }>(
            "insert into public.week_plan (household_id, week_start) values ($1, '2026-11-09') returning id",
            [SEED_HOUSEHOLD_ID],
          );
          const slot = await db.query<{ id: string }>(
            "insert into public.plan_slot (household_id, week_plan_id, date, meal, kind) values ($1, $2, '2026-11-10', 'dinner', 'recipes') returning id",
            [SEED_HOUSEHOLD_ID, week.rows[0].id],
          );
          await db.query(
            `insert into public.plan_slot_item (household_id, plan_slot_id, recipe_id, servings)
             select $1, $2, id, 4 from public.recipe where household_id = $1 limit 1`,
            [SEED_HOUSEHOLD_ID, slot.rows[0].id],
          );
        }),
      ),
    ).toBe(0);
  });

  it("is read by a member for their own household only, and written by none", async () => {
    await asMember(async () => {
      const seen = await db.query<{ household_id: string }>(
        "select household_id from public.library_version",
      );
      expect(seen.rows).toEqual([{ household_id: SEED_HOUSEHOLD_ID }]);
      await expect(
        db.query("update public.library_version set version = 0 where household_id = $1", [
          SEED_HOUSEHOLD_ID,
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("delete from public.library_version where household_id = $1", [SEED_HOUSEHOLD_ID]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("lets a household with recipes, tags and a catalog be deleted", async () => {
    // The seed's household: its rows go by cascade, each raising a counter that goes too.
    await db.query("delete from public.household where id = $1", [SEED_HOUSEHOLD_ID]);
    const left = await db.query("select 1 from public.library_version where household_id = $1", [
      SEED_HOUSEHOLD_ID,
    ]);
    expect(left.rows).toEqual([]);
    expect(await version(OTHER_HOUSEHOLD)).toBe(0);
  });
});
