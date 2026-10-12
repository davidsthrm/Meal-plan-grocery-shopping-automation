import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import {
  addDays,
  dayAndMonth,
  isIsoDate,
  mondayOf,
  planningWeek,
  weekDates,
  weekdayLong,
  weekRange,
  type IsoDate,
} from "@/domain/dates";
import type { RecipeSummary } from "@/domain/library/summary";
import { MEALS, type Meal, type PlanSlot } from "@/domain/plan";
import { missing, weekBalance, type BalanceLine } from "@/domain/recommend/balance";
import { suggestWeek, type Suggestion } from "@/domain/recommend/suggest";
import { GROUP_NAME, MEAL_NAME, plannedText, slotText, targetText, whyText } from "@/lib/plan-text";
import { today } from "@/lib/today";
import { loadLibrary } from "@/server/library";
import { loadHistory, loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { acceptSuggestions, changeServings, clearSlot, copyLastWeek, planRecipe } from "./actions";

export const metadata: Metadata = { title: "Wochenplan" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WeekPage(props: PageProps<"/woche">) {
  const params = await props.searchParams;
  const now = today();
  const asked = one(params.w);
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : planningWeek(now);
  // "Other suggestions" draws again: the number only changes which of equals come first.
  const draw = Math.max(0, Math.floor(Number(one(params.v)) || 0));
  const placingId = one(params.rezept) ?? null;

  const db = await createSessionClient();
  const [library, slots, history, previous] = await Promise.all([
    loadLibrary(db),
    loadWeek(db, week),
    loadHistory(db, week),
    loadWeek(db, addDays(week, -7)),
  ]);
  const recipeOf = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));
  const placing = placingId ? (recipeOf.get(placingId) ?? null) : null;
  const slotAt = (date: IsoDate, meal: Meal) =>
    slots.find((slot) => slot.date === date && slot.meal === meal);

  const balance = weekBalance(slots, (id) => recipeOf.get(id));
  const days = weekDates(week);
  // Nothing is suggested for meals that are over.
  const open = days
    .filter((date) => date >= now)
    .flatMap((date) => MEALS.filter((meal) => !slotAt(date, meal)).map((meal) => ({ date, meal })));
  const picks = placing
    ? []
    : suggestWeek(library.recipes, open, {
        balance,
        planned: new Set(
          slots.flatMap((slot) =>
            slot.kind === "recipes" ? slot.items.map((item) => item.recipeId) : [],
          ),
        ),
        history,
        weekStart: week,
        seed: `${week}:${draw}`,
      });
  const suggestionAt = (date: IsoDate, meal: Meal) =>
    picks.find((pick) => pick.date === date && pick.meal === meal)?.suggestion;

  const weekLink = (monday: IsoDate, extra = "") =>
    `/woche?w=${monday}${placing ? `&rezept=${placing.id}` : ""}${extra}`;
  const thisWeek = planningWeek(now);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Wochenplan</p>
          <h1 className="title mt-1">{weekRange(week)}</h1>
        </div>
        <nav aria-label="Woche wechseln" className="flex gap-2">
          <Link href={weekLink(addDays(week, -7))} className="btn btn-small">
            <span aria-hidden>←</span> Vorige
          </Link>
          {week !== thisWeek && (
            <Link href={weekLink(thisWeek)} className="btn btn-small">
              Aktuelle
            </Link>
          )}
          <Link href={weekLink(addDays(week, 7))} className="btn btn-small">
            Nächste <span aria-hidden>→</span>
          </Link>
        </nav>
      </div>

      <Balance lines={balance} />

      {placing && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
          <p>
            <span className="font-semibold">{placing.title}</span> einplanen: Mahlzeit wählen.
          </p>
          <Link href={`/woche?w=${week}`} className="link">
            Abbrechen
          </Link>
        </div>
      )}

      {!placing && (picks.length > 0 || (slots.length === 0 && previous.length > 0)) && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {picks.length > 1 && (
            <form action={acceptSuggestions}>
              <input type="hidden" name="week" value={week} />
              {picks.map((pick) => (
                <input
                  key={`${pick.date}${pick.meal}`}
                  type="hidden"
                  name="pick"
                  value={`${pick.date}|${pick.meal}|${pick.suggestion.recipe.id}`}
                />
              ))}
              <SubmitButton className="btn btn-primary btn-small">
                Alle {picks.length} Vorschläge übernehmen
              </SubmitButton>
            </form>
          )}
          {picks.length > 0 && (
            <Link href={`/woche?w=${week}&v=${draw + 1}`} scroll={false} className="btn btn-small">
              Andere Vorschläge
            </Link>
          )}
          {slots.length === 0 && previous.length > 0 && (
            <form action={copyLastWeek}>
              <input type="hidden" name="week" value={week} />
              <SubmitButton className="btn btn-small">Letzte Woche übernehmen</SubmitButton>
            </form>
          )}
        </div>
      )}

      <ol className="card mt-5 divide-y divide-line overflow-hidden">
        {days.map((date) => (
          <li
            key={date}
            id={`tag-${date}`}
            className={`grid scroll-mt-4 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[7.5rem_1fr_1fr] ${
              date === now ? "bg-accent-soft/40" : ""
            }`}
          >
            <h2 className="flex items-baseline gap-2 sm:block">
              <span className="text-lg font-bold tracking-tight">{weekdayLong(date)}</span>
              <span className="text-sm text-muted sm:block">
                {date === now ? "Heute" : dayAndMonth(date)}
              </span>
            </h2>
            {MEALS.map((meal) => (
              <MealCell
                key={meal}
                week={week}
                date={date}
                meal={meal}
                slot={slotAt(date, meal)}
                suggestion={suggestionAt(date, meal)}
                recipeOf={recipeOf}
                placing={placing}
              />
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The week counted: how many meals of each kind, against what the household aims for. */
function Balance({ lines }: { lines: BalanceLine[] }) {
  return (
    <ul
      aria-label="Ausgewogenheit der Woche"
      className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-3 sm:grid-cols-4"
    >
      {lines.map((line) => {
        const over = line.max !== null && line.count > line.max;
        const reached = line.min !== null ? missing(line) === 0 : !over && line.count > 0;
        return (
          <li key={line.group}>
            <span className="eyebrow block">{GROUP_NAME[line.group]}</span>
            <span className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  over ? "text-warn" : reached ? "text-accent" : ""
                }`}
              >
                {line.count}
              </span>
              <span className="text-sm text-muted">{targetText(line)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface CellProps {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  slot: PlanSlot | undefined;
  suggestion: Suggestion | undefined;
  recipeOf: ReadonlyMap<string, RecipeSummary>;
  /** The recipe that is being put somewhere, if the page was opened for that. */
  placing: RecipeSummary | null;
}

function MealCell({ week, date, meal, slot, suggestion, recipeOf, placing }: CellProps) {
  const where = (
    <>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
    </>
  );
  const choose = (mode: "replace" | "add") =>
    `/woche/auswahl?w=${week}&d=${date}&m=${meal}&modus=${mode}`;
  const what = `${weekdayLong(date)} ${MEAL_NAME[meal]}`;

  return (
    <section aria-label={what} className="min-w-0">
      <p className="eyebrow">{MEAL_NAME[meal]}</p>

      {slot?.kind === "recipes" && (
        <ul className="mt-1 space-y-2">
          {slot.items.map((item) => {
            const recipe = recipeOf.get(item.recipeId);
            const amount = (servings: number, sign: string, label: string) => (
              <form action={changeServings}>
                {where}
                <input type="hidden" name="recipe" value={item.recipeId} />
                <input type="hidden" name="servings" value={servings} />
                <SubmitButton
                  className="btn h-10 min-h-0 w-10 rounded-full p-0 text-lg leading-none"
                  label={label}
                >
                  {sign}
                </SubmitButton>
              </form>
            );
            return (
              <li key={item.recipeId}>
                <Link
                  href={`/rezepte/${item.recipeId}`}
                  className="font-semibold decoration-line underline-offset-4 hover:underline"
                >
                  {recipe?.title ?? "Rezept"}
                </Link>
                <div className="mt-1 flex items-center gap-2">
                  {amount(item.servings - 1, "−", `Weniger von ${recipe?.title ?? "dem Rezept"}`)}
                  <span className="min-w-24 text-center text-sm text-muted">
                    {plannedText(item.servings, recipe?.servings?.unit ?? null)}
                  </span>
                  {amount(
                    Math.min(99, item.servings + 1),
                    "+",
                    `Mehr von ${recipe?.title ?? "dem Rezept"}`,
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {slot && slot.kind !== "recipes" && (
        <p className={`mt-1 font-semibold ${slot.kind === "skipped" ? "text-muted" : ""}`}>
          {slotText(slot)}
        </p>
      )}

      {!slot && suggestion && !placing && (
        <div className="mt-1 rounded-lg border border-dashed border-line px-3 py-2">
          <p className="text-xs font-semibold text-accent">Vorschlag</p>
          <Link
            href={`/rezepte/${suggestion.recipe.id}`}
            className="font-semibold decoration-line underline-offset-4 hover:underline"
          >
            {suggestion.recipe.title}
          </Link>
          {suggestion.reasons.length > 0 && (
            <p className="text-sm text-muted">{whyText(suggestion.reasons)}</p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {placing ? (
          <form action={planRecipe}>
            {where}
            <input type="hidden" name="recipe" value={placing.id} />
            <input type="hidden" name="mode" value={slot?.kind === "recipes" ? "add" : "replace"} />
            <SubmitButton className="btn btn-primary btn-small" label={`${what}: hier einplanen`}>
              {slot?.kind === "recipes" ? "Dazu einplanen" : slot ? "Ersetzen" : "Hier einplanen"}
            </SubmitButton>
          </form>
        ) : slot ? (
          <>
            <Link href={choose("replace")} className="link text-sm" aria-label={`${what} ändern`}>
              Ändern
            </Link>
            {slot.kind === "recipes" && (
              <Link
                href={choose("add")}
                className="link text-sm"
                aria-label={`${what}: etwas dazu`}
              >
                Etwas dazu
              </Link>
            )}
            <form action={clearSlot}>
              {where}
              <SubmitButton
                className="min-h-10 text-sm font-semibold text-muted hover:text-danger"
                label={`${what} leeren`}
              >
                Leeren
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            {suggestion && (
              <form action={planRecipe}>
                {where}
                <input type="hidden" name="recipe" value={suggestion.recipe.id} />
                <input type="hidden" name="mode" value="replace" />
                <SubmitButton
                  className="btn btn-small"
                  label={`${what}: Vorschlag ${suggestion.recipe.title} übernehmen`}
                >
                  Übernehmen
                </SubmitButton>
              </form>
            )}
            <Link
              href={choose("replace")}
              className={suggestion ? "link text-sm" : "btn btn-small"}
              aria-label={`${what} planen`}
            >
              {suggestion ? "Etwas anderes" : "Planen"}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
