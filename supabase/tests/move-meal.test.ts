import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createDatabase } from "./database";

/**
 * A meal moved to another place of its week, or swapped with the meal there: its row moves,
 * with everything that points to it, in one call.
 */

const HOME = "e0000000-0000-4000-8000-000000000000";
const NEIGHBOURS = "f0000000-0000-4000-8000-000000000000";
const MEMBER = "e1111111-1111-4111-8111-111111111111";
const NEIGHBOUR = "f1111111-1111-4111-8111-111111111111";
const WEEK = "e0000000-0000-4000-8000-000000000001";
const SOUP = "e0000000-0000-4000-8000-000000000002";
const VESPER = "e0000000-0000-4000-8000-000000000003";
const LEFTOVERS = "e0000000-0000-4000-8000-000000000004";
const RECIPE = "e0000000-0000-4000-8000-000000000005";

let db: PGlite;

async function places(): Promise<Record<string, string>> {
  const result = await db.query<{ id: string; place: string }>(
    "select id, to_char(date, 'YYYY-MM-DD') || '.' || meal as place from public.plan_slot order by id",
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row.place]));
}

const move = (slot: string, date: string, meal: string, user = MEMBER) =>
  asUser(db, user, () =>
    db.query<{ other: string | null }>("select public.move_plan_slot($1, $2, $3) as other", [
      slot,
      date,
      meal,
    ]),
  );

beforeEach(async () => {
  db = await createDatabase();
  await db.query("insert into auth.users (id) values ($1), ($2)", [MEMBER, NEIGHBOUR]);
  await db.query(
    "insert into public.household (id, name) values ($1, 'Stührmann'), ($2, 'Nachbarn')",
    [HOME, NEIGHBOURS],
  );
  await db.query(
    "insert into public.household_member (household_id, user_id, role) values ($1, $2, 'admin'), ($3, $4, 'admin')",
    [HOME, MEMBER, NEIGHBOURS, NEIGHBOUR],
  );
  await db.query(
    "insert into public.recipe (id, household_id, title, servings_min, servings_max) values ($1, $2, 'Kürbissuppe', 4, 4)",
    [RECIPE, HOME],
  );
  await db.query(
    "insert into public.week_plan (id, household_id, week_start) values ($1, $2, '2026-10-12')",
    [WEEK, HOME],
  );
  await db.query(
    `insert into public.plan_slot (id, household_id, week_plan_id, date, meal, kind, label, extra_servings, leftovers_of_slot_id) values
       ($1, $4, $5, '2026-10-12', 'dinner', 'recipes', null, 2, null),
       ($2, $4, $5, '2026-10-14', 'dinner', 'free_text', 'Vesper', 0, null),
       ($3, $4, $5, '2026-10-13', 'lunch', 'leftovers', null, 0, $1)`,
    [SOUP, VESPER, LEFTOVERS, HOME, WEEK],
  );
  await db.query(
    "insert into public.plan_slot_item (household_id, plan_slot_id, recipe_id, servings) values ($1, $2, $3, 6)",
    [HOME, SOUP, RECIPE],
  );
  await db.query(
    "insert into public.plan_slot_food (household_id, plan_slot_id, label) values ($1, $2, 'Dinkelbaguette'), ($1, $3, 'Brot')",
    [HOME, SOUP, VESPER],
  );
});

describe("moving a meal", () => {
  it("takes it to a free place with its recipes, persons and foods", async () => {
    const moved = await move(VESPER, "2026-10-15", "dinner");
    expect(moved.rows[0].other).toBeNull();
    expect((await places())[VESPER]).toBe("2026-10-15.dinner");
    const foods = await db.query(
      "select label from public.plan_slot_food where plan_slot_id = $1",
      [VESPER],
    );
    expect(foods.rows).toEqual([{ label: "Brot" }]);
  });

  it("swaps two meals, each keeping what it holds, and leftovers keep their meal", async () => {
    const moved = await move(SOUP, "2026-10-12", "lunch");
    expect(moved.rows[0].other).toBeNull();
    // Whether leftovers then still come after their meal is the app's to ask (`moveMeal`).
    const swapped = await move(VESPER, "2026-10-12", "lunch");
    expect(swapped.rows[0].other).toBe(SOUP);
    expect(await places()).toEqual({
      [SOUP]: "2026-10-14.dinner",
      [VESPER]: "2026-10-12.lunch",
      [LEFTOVERS]: "2026-10-13.lunch",
    });
    const soup = await db.query(
      `select s.extra_servings, i.servings, f.label
       from public.plan_slot s
       join public.plan_slot_item i on i.plan_slot_id = s.id
       join public.plan_slot_food f on f.plan_slot_id = s.id
       where s.id = $1`,
      [SOUP],
    );
    expect(soup.rows).toEqual([{ extra_servings: 2, servings: 6, label: "Dinkelbaguette" }]);
    const leftovers = await db.query(
      "select leftovers_of_slot_id as of from public.plan_slot where id = $1",
      [LEFTOVERS],
    );
    expect(leftovers.rows).toEqual([{ of: SOUP }]);
  });

  it("leaves a meal on its own place alone", async () => {
    const moved = await move(VESPER, "2026-10-14", "dinner");
    expect(moved.rows[0].other).toBeNull();
    expect((await places())[VESPER]).toBe("2026-10-14.dinner");
  });

  it("stays within the meal's week", async () => {
    await expect(move(VESPER, "2026-10-19", "dinner")).rejects.toThrow(/within its week/);
    expect((await places())[VESPER]).toBe("2026-10-14.dinner");
  });

  it("is not for another household's meals", async () => {
    await expect(move(VESPER, "2026-10-15", "dinner", NEIGHBOUR)).rejects.toThrow(/meal not found/);
    expect((await places())[VESPER]).toBe("2026-10-14.dinner");
  });
});
