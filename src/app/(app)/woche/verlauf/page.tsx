import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  isIsoDate,
  isoWeek,
  mondayOf,
  monthAndYear,
  planningWeek,
  weekRange,
  weekdayShort,
} from "@/domain/dates";
import type { RecipeSummary } from "@/domain/library/summary";
import type { PlanSlot } from "@/domain/plan";
import { daysOfWeek, weeksByMonth, withCurrentWeek } from "@/domain/plan-history";
import { weekBalance } from "@/domain/recommend/balance";
import { GROUP_NAME, recipeTone, slotText } from "@/lib/plan-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { loadWeeks } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Alle Wochen" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** How many weeks back the page reaches at first, and how many more each time. */
const STEP = 12;
const MOST = 156;
/** How far ahead a week can have been planned. */
const AHEAD = 8;

/**
 * Every week with a plan, month by month, the newest first: to look up what was cooked and
 * to jump to a week.
 */
export default async function HistoryPage(props: PageProps<"/woche/verlauf">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const now = today();
  const current = planningWeek(now);
  const opened = one(params.w);
  const cameFrom = opened && isIsoDate(opened) ? mondayOf(opened) : current;
  const back = Math.min(MOST, Math.max(STEP, Math.floor(Number(one(params.n)) || STEP)));
  const from = addDays(current, -7 * back);

  const db = await createSessionClient();
  const [library, weeks, older] = await Promise.all([
    loadLibrary(db),
    loadWeeks(db, from, addDays(current, 7 * AHEAD)),
    db.from("week_plan").select("id", { count: "exact", head: true }).lt("week_start", from),
  ]);
  const recipeOf = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));
  const months = weeksByMonth(withCurrentWeek(weeks, current));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/woche?w=${cameFrom}`} className="link text-sm">
        ← Wochenplan
      </Link>
      <h1 className="title mt-3">Alle Wochen</h1>

      {months.map(({ month, weeks: entries }) => (
        <section key={month} className="mt-8" aria-label={monthAndYear(month)}>
          <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight">
            {monthAndYear(month)}
          </h2>
          <ul className="mt-3 space-y-3">
            {entries.map((week) => {
              const meals = week.slots.filter((slot) => slot.meal !== "coffee").length;
              const balance = weekBalance(week.slots, (id) => recipeOf.get(id), household.targets);
              const mark =
                week.weekStart === mondayOf(now)
                  ? "Diese Woche"
                  : week.weekStart === addDays(mondayOf(now), 7)
                    ? "Nächste Woche"
                    : null;
              return (
                <li key={week.weekStart}>
                  <Link
                    href={`/woche?w=${week.weekStart}`}
                    className="card lift block overflow-hidden"
                    aria-label={`Kalenderwoche ${isoWeek(week.weekStart)}, ${weekRange(week.weekStart)}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className="text-lg font-bold tracking-tight">
                          KW {isoWeek(week.weekStart)}
                        </span>
                        <span className="text-muted">{weekRange(week.weekStart)}</span>
                        {mark && <span className="tag">{mark}</span>}
                      </span>
                      <span className="flex items-center gap-3 text-sm text-muted">
                        {meals === 0 ? (
                          "Noch nichts geplant"
                        ) : (
                          <>
                            {balance
                              .filter((line) => line.count > 0)
                              .map((line) => (
                                <span
                                  key={line.group}
                                  className={`kind-${line.group} inline-flex items-center gap-1`}
                                  title={GROUP_NAME[line.group]}
                                >
                                  <span className="dot" />
                                  {line.count}
                                  <span className="sr-only"> {GROUP_NAME[line.group]}</span>
                                </span>
                              ))}
                            <span>{meals === 1 ? "1 Mahlzeit" : `${meals} Mahlzeiten`}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {week.slots.length > 0 && (
                      <span className="grid border-t border-line sm:grid-cols-7 sm:divide-x sm:divide-line">
                        {daysOfWeek(week).map((day) => (
                          <span
                            key={day.date}
                            className="grid grid-cols-[2.2rem_1fr] gap-x-2 px-4 py-1.5 sm:block sm:px-2.5 sm:py-2"
                          >
                            <span className={`eyebrow ${day.date === now ? "text-accent" : ""}`}>
                              {weekdayShort(day.date)}
                            </span>
                            <span className="min-w-0 space-y-0.5 text-sm sm:mt-1 sm:block">
                              <Meal slot={day.meals.lunch} recipeOf={recipeOf} />
                              <Meal slot={day.meals.dinner} recipeOf={recipeOf} />
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {(older.count ?? 0) > 0 && back < MOST && (
        <Link href={`/woche/verlauf?n=${back + STEP}`} scroll={false} className="btn mt-6">
          Ältere Wochen anzeigen
        </Link>
      )}
    </div>
  );
}

/** One meal of a day in a line: what was cooked, with a dot in the colour of its kind. */
function Meal({
  slot,
  recipeOf,
}: {
  slot: PlanSlot | undefined;
  recipeOf: ReadonlyMap<string, RecipeSummary>;
}) {
  if (!slot) return <span className="block text-line">–</span>;
  if (slot.kind !== "recipes") {
    return <span className="block truncate text-muted">{slotText(slot)}</span>;
  }
  const recipes = slot.items.flatMap((item) => recipeOf.get(item.recipeId) ?? []);
  const tone = recipes[0] ? recipeTone(recipes[0]) : null;
  return (
    <span className={`flex items-baseline gap-1.5 ${tone?.className ?? ""}`}>
      <span className="dot h-2 w-2 -translate-y-px" />
      <span className="truncate">{recipes.map((recipe) => recipe.title).join(" + ")}</span>
    </span>
  );
}
