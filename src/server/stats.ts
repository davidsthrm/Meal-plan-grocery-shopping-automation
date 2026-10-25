import "server-only";
import type { Place } from "@/domain/catalog";
import { mondayOf, type IsoDate } from "@/domain/dates";
import { favouriteSupermarkets } from "@/domain/shopping-list/supermarkets";
import { mealStats, type MealStats } from "@/domain/stats/meals";
import { bucketsOf, type Period } from "@/domain/stats/period";
import { shoppingStats, type LineRecord, type ShoppingStats } from "@/domain/stats/shopping";
import type { Household } from "./auth";
import { allRows, loadCatalogIndex, must, type Db } from "./catalog";
import { loadLibrary, type Library } from "./library";
import { loadWeeks } from "./planning/week";
import { loadSeasonalFoods } from "./season";

/**
 * Reads what the statistics count: the plans and the hand-made state of the shopping notes.
 * The counting itself is in `src/domain/stats/`.
 */

/** How many notes are asked for in one request, so their ids fit into its address. */
const NOTES_PER_REQUEST = 100;

type StatsHousehold = Pick<Household, "firstWeek" | "targets">;

/**
 * The week the statistics count from: the household's first week with the app, or where it
 * has none, the week of its first plan or note. Before it, a month or a year would count
 * days nobody planned as days without meals.
 */
export async function countingFrom(
  db: Db,
  household: Pick<Household, "firstWeek">,
): Promise<IsoDate | null> {
  if (household.firstWeek !== null) return household.firstWeek;
  const [plan, note] = await Promise.all([
    db.from("week_plan").select("week_start").order("week_start").limit(1),
    db.from("shopping_list").select("shopping_date").order("shopping_date").limit(1),
  ]);
  const starts = [
    ...must(plan, "find the first plan").map((row) => row.week_start),
    ...must(note, "find the first note").map((row) => mondayOf(row.shopping_date)),
  ].sort();
  return starts[0] ?? null;
}

/**
 * How the household ate. Every plan from its first week on is read: "Neu ausprobiert" and
 * "Mal wieder" compare the period with all that came before.
 */
export async function loadMealStats(
  db: Db,
  household: StatsHousehold,
  period: Period,
  today: IsoDate,
): Promise<{ stats: MealStats; library: Library }> {
  const [library, weeks, seasonalFoods] = await Promise.all([
    loadLibrary(db),
    loadWeeks(db, household.firstWeek ?? "2000-01-03", period.end),
    loadSeasonalFoods(db),
  ]);
  const tags = new Map(
    library.tagGroups.flatMap((group) =>
      group.tags.map((tag) => [tag.ref, { name: tag.name, group: group.name }] as const),
    ),
  );
  const stats = mealStats({
    period,
    today,
    firstWeek: household.firstWeek,
    slots: weeks.flatMap((week) => week.slots),
    recipes: new Map(library.recipes.map((recipe) => [recipe.id, recipe])),
    targets: household.targets,
    tags,
    seasonalFoods,
  });
  return { stats, library };
}

/** How the household shopped: the notes of the period, and of the bars before a week. */
export async function loadShoppingStats(
  db: Db,
  household: StatsHousehold,
  period: Period,
  today: IsoDate,
): Promise<ShoppingStats> {
  const bars = bucketsOf(period, today, household.firstWeek);
  const from = bars[0] && bars[0].start < period.start ? bars[0].start : period.start;
  const [noteRows, index, memberRows] = await Promise.all([
    allRows(
      (start, end) =>
        db
          .from("shopping_list")
          .select("id, shopping_date, place")
          .gte("shopping_date", from)
          .lte("shopping_date", period.end)
          .order("id")
          .range(start, end),
      "load shopping notes",
    ),
    loadCatalogIndex(db),
    db.from("household_member").select("user_id, display_name"),
  ]);
  const ids = noteRows.map((row) => row.id);
  const chunks = Array.from({ length: Math.ceil(ids.length / NOTES_PER_REQUEST) }, (_, at) =>
    ids.slice(at * NOTES_PER_REQUEST, (at + 1) * NOTES_PER_REQUEST),
  );
  const [linePages, typedPages] = await Promise.all([
    Promise.all(
      chunks.map((part) =>
        allRows(
          (start, end) =>
            db
              .from("shopping_line_state")
              .select(
                "shopping_list_id, line_key, status, checked_at, checked_by, decided_by, substituted, shop_id, moved_date, planned",
              )
              .in("shopping_list_id", part)
              .order("shopping_list_id")
              .order("line_key")
              .range(start, end),
          "load ticks",
        ),
      ),
    ),
    Promise.all(
      chunks.map((part) =>
        allRows(
          (start, end) =>
            db
              .from("shopping_manual_entry")
              .select(
                "id, shopping_list_id, text, ingredient_id, shop_id, aisle_group_id, for_whom, carried_from_list_id",
              )
              .in("shopping_list_id", part)
              .order("id")
              .range(start, end),
          "load typed lines",
        ),
      ),
    ),
  ]);
  const members = new Map(
    must(memberRows, "load members").flatMap((member) =>
      member.display_name ? [[member.user_id, member.display_name] as const] : [],
    ),
  );
  return shoppingStats({
    period,
    today,
    firstWeek: household.firstWeek,
    notes: noteRows.map((row) => ({
      id: row.id,
      date: row.shopping_date,
      place: row.place as Place,
    })),
    lines: linePages.flat().map((row) => ({
      noteId: row.shopping_list_id,
      key: row.line_key,
      status: readStatus(row.status),
      checkedAt: row.checked_at ? Date.parse(row.checked_at) : null,
      checkedBy: row.checked_by,
      decidedBy: row.decided_by,
      substituted: row.substituted,
      shopId: row.shop_id,
      movedTo: row.moved_date !== null,
      plannedName: plannedName(row.planned),
    })),
    typed: typedPages.flat().map((row) => ({
      id: row.id,
      noteId: row.shopping_list_id,
      text: row.text,
      ingredientId: row.ingredient_id,
      shopId: row.shop_id,
      aisleGroupId: row.aisle_group_id,
      forWhom: row.for_whom,
      carried: row.carried_from_list_id !== null,
    })),
    index,
    supermarkets: favouriteSupermarkets(index.catalog.shops),
    members,
  });
}

const STATUSES = ["bought", "partially_bought", "removed", "moved"] as const;

function readStatus(status: string | null): LineRecord["status"] {
  return STATUSES.find((known) => known === status) ?? null;
}

/** The name a line had on its note, as a decision kept it (`planned`). */
function plannedName(planned: unknown): string | null {
  if (typeof planned !== "object" || planned === null) return null;
  const name = (planned as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name : null;
}
