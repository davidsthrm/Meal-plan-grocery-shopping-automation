import Link from "next/link";
import { RecipeBadge } from "@/components/recipe-card";
import { weekdayShort, type IsoDate } from "@/domain/dates";
import type { RecipeSummary } from "@/domain/library/summary";
import type { StripMeal } from "@/domain/plan";
import { MEAL_NAME, slotText } from "@/lib/plan-text";

/**
 * The week beside the recipe chooser on an iPad, so that a week is planned with the library
 * open: every meal with what it holds, the one being chosen for marked, each a link to choose
 * for it instead. On a phone it is not shown; the chooser has the whole width there.
 */
export function WeekStrip({
  week,
  days,
  recipeOf,
}: {
  week: IsoDate;
  days: { date: IsoDate; meals: StripMeal[] }[];
  recipeOf: ReadonlyMap<string, RecipeSummary>;
}) {
  return (
    <nav aria-label="Die Woche" className="sheet overflow-hidden">
      <ol className="divide-y divide-rule">
        {days.map(({ date, meals }) => (
          <li key={date} className="px-3 py-2.5">
            <p className="text-sm font-bold tracking-tight">
              {weekdayShort(date)} {Number(date.slice(8))}.
            </p>
            <ul className="mt-1 space-y-1">
              {meals.map(({ meal, slot, current }) => {
                const first =
                  slot?.kind === "recipes"
                    ? recipeOf.get(slot.items[0]?.recipeId ?? "")
                    : undefined;
                const what =
                  slot === null
                    ? null
                    : slot.kind === "recipes"
                      ? slot.items
                          .map((item) => recipeOf.get(item.recipeId)?.title ?? "Rezept")
                          .join(" + ")
                      : slotText(slot);
                return (
                  <li key={meal}>
                    <Link
                      href={`/woche/auswahl?${new URLSearchParams({ w: week, d: date, m: meal, modus: "replace" })}`}
                      aria-current={current ? "page" : undefined}
                      className="strip-meal"
                    >
                      {first ? (
                        <RecipeBadge recipe={first} className="h-7 w-7" />
                      ) : (
                        <span className="strip-open" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs text-muted">{MEAL_NAME[meal]}</span>
                        <span
                          className={`block truncate text-sm ${what ? "font-semibold" : "text-muted"}`}
                        >
                          {what ?? "Offen"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}
