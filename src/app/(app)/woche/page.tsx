import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowIcon, PenIcon, WishIcon } from "@/components/icons";
import { RecipeBadge } from "@/components/recipe-card";
import { ResetWeek } from "@/components/reset-week";
import { SheetHoles } from "@/components/sheet-holes";
import { SubmitButton } from "@/components/submit-button";
import {
  addDays,
  dayAndMonth,
  isIsoDate,
  mondayOf,
  weekDates,
  weekdayLong,
  weekRange,
  type IsoDate,
} from "@/domain/dates";
import { BY_KIND, groupRecipes } from "@/domain/library/grouping";
import { firstName, salutation } from "@/domain/family";
import type { RecipeSummary } from "@/domain/library/summary";
import { openingWeek } from "@/domain/planned";
import { mealsOf, MEALS, namedMeal, type Meal, type PlanExtra, type PlanSlot } from "@/domain/plan";
import { missing, weekBalance, type BalanceLine } from "@/domain/recommend/balance";
import { suggest, suggestWeek, type Suggestion } from "@/domain/recommend/suggest";
import { rank } from "@/domain/rank";
import {
  GROUP_NAME,
  kindGroupName,
  MEAL_NAME,
  plannedText,
  slotText,
  targetText,
  TARGETS_SEEN,
  whyText,
} from "@/lib/plan-text";
import { fromPlan } from "@/lib/origin";
import { hourNow, today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { isSaved, loadExtras, loadHistory, loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import {
  acceptSuggestions,
  changeExtraServings,
  changeServings,
  clearSlot,
  needsNoRecipe,
  describeExtra,
  planExtra,
  planRecipe,
  resetWeekPlan,
  saveWeekPlan,
} from "./actions";

export const metadata: Metadata = { title: "Wochenplan" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** How many meals offer a suggestion unasked, and what an idea needs to be one of them. */
const HINTS = 5;
const HINT_SCORE = 2;
/** How many different suggestions a meal can be asked for before they come round again. */
const PROPOSALS = 12;

export default async function WeekPage(props: PageProps<"/woche">) {
  // Whoever opens the plan on a device for the first time is shown what the household aims
  // for in a week, and can change it.
  if (!(await cookies()).has(TARGETS_SEEN)) redirect("/woche/ziele?start=1");

  const params = await props.searchParams;
  const household = await requireHousehold();
  const now = today();
  const db = await createSessionClient();
  // The running week decides which week the planner opens on, and what there is today.
  const running = mondayOf(now);
  const runningSlots = await loadWeek(db, running);
  const thisWeek = openingWeek(now, runningSlots);
  const asked = one(params.w);
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : thisWeek;
  // The meal someone asked a suggestion for, and how often they asked for another one.
  const askedFor = one(params.frage) ?? "";
  const draw = Math.max(0, Math.floor(Number(one(params.v)) || 0));
  const placingId = one(params.rezept) ?? null;
  // The one meal of a saved plan someone took the pen to.
  const pen = one(params.stift) ?? "";

  const [library, slots, history, extras, saved, self] = await Promise.all([
    loadLibrary(db),
    loadWeek(db, week),
    loadHistory(db, week),
    loadExtras(db, week),
    isSaved(db, week),
    db
      .from("household_member")
      .select("display_name")
      .eq("user_id", household.userId)
      .maybeSingle(),
  ]);
  // Whoever opens the plan is greeted by the name they gave themselves, if they gave one.
  const greeting = firstName(self.data?.display_name);
  const recipeOf = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));
  const placing = placingId ? (recipeOf.get(placingId) ?? null) : null;
  // The second view of a week: what it needs outside its meals.
  const showExtras = one(params.t) === "extra" && !placing;
  const slotAt = (date: IsoDate, meal: Meal) =>
    slots.find((slot) => slot.date === date && slot.meal === meal);

  const balance = weekBalance(slots, (id) => recipeOf.get(id), household.targets);
  const days = weekDates(week);
  // Nothing is suggested for meals that are over, and coffee on Sunday stays optional.
  const open = days
    .filter((date) => date >= now)
    .flatMap((date) => MEALS.filter((meal) => !slotAt(date, meal)).map((meal) => ({ date, meal })));
  const context = {
    balance,
    planned: new Set(
      slots.flatMap((slot) =>
        slot.kind === "recipes" ? slot.items.map((item) => item.recipeId) : [],
      ),
    ),
    history,
    weekStart: week,
    seed: week,
  };
  // What would complete the week. Nothing of it is put on the plan unasked, and a plan the
  // household saved is done with suggestions.
  const picks = placing || showExtras || saved ? [] : suggestWeek(library.recipes, open, context);
  const pickAt = (date: IsoDate, meal: Meal) =>
    picks.find((pick) => pick.date === date && pick.meal === meal)?.suggestion;
  // A few of them are offered in their meal: the ones with the most to say for them, and
  // among equals not simply the first days of the week.
  const hinted = new Set(
    picks
      .filter((pick) => pick.suggestion.score >= HINT_SCORE)
      .map((pick) => ({ key: `${pick.date}.${pick.meal}`, score: pick.suggestion.score }))
      .sort((a, b) => b.score - a.score || rank(week, a.key) - rank(week, b.key))
      .slice(0, HINTS)
      .map((pick) => pick.key),
  );
  // The answer to "Hast du einen Vorschlag?": the pick for that meal first, then the next best
  // one each time another is asked for, and round again when the list is through.
  const question = open.find((slot) => `${slot.date}.${slot.meal}` === askedFor);
  let proposal: Suggestion | undefined;
  if (question && !placing && !showExtras) {
    const first = pickAt(question.date, question.meal);
    const ranked = suggest(
      library.recipes,
      question,
      { ...context, seed: `${week}:${question.date}:${question.meal}` },
      PROPOSALS,
    ).filter((entry) => entry.recipe.id !== first?.recipe.id);
    const list = first ? [first, ...ranked] : ranked;
    proposal = list.length > 0 ? list[draw % list.length] : undefined;
  }
  const wishes = library.recipes.filter(
    (recipe) => recipe.wanted && !context.planned.has(recipe.id),
  );

  const weekLink = (monday: IsoDate) =>
    `/woche?w=${monday}${placing ? `&rezept=${placing.id}` : ""}${showExtras ? "&t=extra" : ""}`;
  // "What is there to eat today?" is asked of the week that is running, also while the page
  // already shows the next one, as it does from Saturday on.
  const showToday =
    (week === running || addDays(week, -7) === running) &&
    !placing &&
    !showExtras &&
    hasToday(runningSlots, now);

  const title = (
    <div>
      {greeting ? (
        /*
         * A large title, as on the first screen of an app: the day small above it, the
         * greeting large with the name in the green of the logo, and the week below as
         * the heading of the page.
         */
        <>
          <p className="text-sm font-medium text-muted">
            {weekdayLong(now)}, {dayAndMonth(now)}
          </p>
          <p className="greeting mt-1">
            {salutation(hourNow())}, <span className="text-accent">{greeting}</span>
          </p>
          <h1 className="mt-2 text-lg font-semibold tracking-tight text-muted">
            Euer Wochenplan
            <span aria-hidden className="mx-2 text-line">
              ·
            </span>
            <span className="text-ink">{weekRange(week)}</span>
          </h1>
        </>
      ) : (
        <>
          <p className="eyebrow">Wochenplan</p>
          <h1 className="title mt-1">{weekRange(week)}</h1>
        </>
      )}
    </div>
  );
  const weekNav = (
    <nav aria-label="Woche wechseln" className="flex flex-wrap items-center gap-2">
      <Link
        href={weekLink(addDays(week, -7))}
        className="btn btn-small px-2.5"
        aria-label="Vorige Woche"
      >
        <ArrowIcon back />
      </Link>
      {week !== thisWeek && (
        <Link href={weekLink(thisWeek)} className="btn btn-small">
          Aktuelle
        </Link>
      )}
      <Link
        href={weekLink(addDays(week, 7))}
        className="btn btn-small px-2.5"
        aria-label="Nächste Woche"
      >
        <ArrowIcon />
      </Link>
      <Link href={`/woche/verlauf?w=${week}`} className="btn btn-small">
        Alle Wochen
      </Link>
    </nav>
  );

  return (
    <div className="mx-auto max-w-5xl">
      {showToday ? (
        /*
         * Once something is planned for today or the weekend, it stands next to the greeting
         * like a widget on a large screen, and under it on a phone.
         */
        <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start">
          <div className="flex flex-col gap-4">
            {title}
            {weekNav}
          </div>
          <Today now={now} week={week} slots={runningSlots} recipeOf={recipeOf} dated={!greeting} />
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {title}
          {weekNav}
        </div>
      )}

      <Balance lines={balance} />

      {placing ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
          <p>
            <span className="font-semibold">{placing.title}</span> einplanen: Mahlzeit wählen.
          </p>
          <span className="flex flex-wrap items-center gap-4">
            <form action={planExtra}>
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="recipe" value={placing.id} />
              <SubmitButton className="btn btn-small">Zu keiner Mahlzeit</SubmitButton>
            </form>
            <Link href={`/woche?w=${week}`} className="link">
              Abbrechen
            </Link>
          </span>
        </div>
      ) : (
        /*
         * The two views of the week on the left; on the right what can be done with the
         * whole plan, saving it last. On a phone they wrap below the views.
         */
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3">
          <nav aria-label="Ansicht" className="flex gap-2">
            <Link
              href={`/woche?w=${week}`}
              className={`chip ${showExtras ? "" : "chip-on"}`}
              aria-current={showExtras ? undefined : "page"}
            >
              Mahlzeiten
            </Link>
            <Link
              href={`/woche?w=${week}&t=extra`}
              className={`chip ${showExtras ? "chip-on" : ""}`}
              aria-current={showExtras ? "page" : undefined}
            >
              Außerdem{extras.length > 0 ? ` (${extras.length})` : ""}
            </Link>
          </nav>
          {!showExtras && (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
              {picks.length > 0 && (
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
                  <SubmitButton className="btn btn-small">Plan vervollständigen</SubmitButton>
                </form>
              )}
              {/* Done planning: the plan is saved and shown to read. Or the whole week is
                  rubbed out. */}
              {slots.length + extras.length > 0 &&
                (saved ? (
                  <>
                    <p className="text-sm text-muted">
                      Gespeichert. Der Stift an einer Mahlzeit ändert nur sie.
                    </p>
                    <form action={saveWeekPlan}>
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="saved" value="0" />
                      <SubmitButton className="btn btn-small">
                        <PenIcon />
                        Plan bearbeiten
                      </SubmitButton>
                    </form>
                  </>
                ) : (
                  <>
                    <ResetWeek action={resetWeekPlan} week={week} sheet="wochenblatt" />
                    <form action={saveWeekPlan}>
                      <input type="hidden" name="week" value={week} />
                      <input type="hidden" name="saved" value="1" />
                      <SubmitButton className="btn btn-primary btn-small">
                        Plan speichern
                      </SubmitButton>
                    </form>
                  </>
                ))}
            </div>
          )}
        </div>
      )}

      {showExtras && <Extras week={week} extras={extras} recipeOf={recipeOf} />}

      {!showExtras && (
        <div className="sheet mt-6">
          <SheetHoles />
          <ol id="wochenblatt" className="relative divide-y divide-rule">
            {days.map((date) => (
              <li
                key={date}
                id={`tag-${date}`}
                className="grid scroll-mt-4 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[7.5rem_1fr_1fr] sm:px-5"
              >
                <h2 className="flex items-baseline gap-2 sm:block">
                  <span
                    className={`text-lg font-bold tracking-tight ${date === now ? "marked" : ""}`}
                  >
                    {weekdayLong(date)}
                  </span>
                  <span className="text-sm text-muted sm:block">
                    {date === now ? "Heute" : dayAndMonth(date)}
                  </span>
                </h2>
                {mealsOf(date).map((meal) => (
                  <MealCell
                    key={meal}
                    week={week}
                    date={date}
                    meal={meal}
                    slot={slotAt(date, meal)}
                    proposal={
                      question?.date === date && question.meal === meal ? proposal : undefined
                    }
                    hint={hinted.has(`${date}.${meal}`) ? pickAt(date, meal) : undefined}
                    draw={draw}
                    canAsk={date >= now && meal !== "coffee" && !saved}
                    recipeOf={recipeOf}
                    placing={placing}
                    locked={saved && !placing && pen !== `${date}.${meal}`}
                    withPen={saved && pen === `${date}.${meal}`}
                  />
                ))}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!placing && !showExtras && !saved && wishes.length > 0 && (
        <Wishes week={week} wishes={wishes} all={one(params.wuensche) === "alle"} />
      )}
    </div>
  );
}

/** How many wishes a kind shows before the rest is folded into "weitere". */
const WISHES_SHOWN = 8;

/**
 * What someone wants to cook soon, below the plan, sorted by kind so that dozens of them stay
 * a few rows. A tap puts one on a meal.
 */
function Wishes({
  week,
  wishes,
  all,
}: {
  week: IsoDate;
  wishes: RecipeSummary[];
  /** Every wish is shown, not only the first of each kind. */
  all: boolean;
}) {
  const groups = groupRecipes(wishes, BY_KIND);
  return (
    <section id="wuensche" aria-label="Möchte ich kochen" className="mt-8 scroll-mt-4">
      <h2 className="eyebrow flex items-center gap-1.5">
        <WishIcon filled />
        Möchte ich kochen
        <span className="font-normal">· {wishes.length}</span>
      </h2>
      <ul className="mt-2 space-y-2.5">
        {groups.map((group) => {
          const shown = all ? group.recipes : group.recipes.slice(0, WISHES_SHOWN);
          const more = group.recipes.length - shown.length;
          const name = kindGroupName(group.key);
          return (
            <li
              key={group.key ?? "rest"}
              aria-label={name}
              className={`${group.key ? `kind-${group.key}` : ""} flex flex-wrap items-center gap-1.5 sm:grid sm:grid-cols-[8.5rem_1fr] sm:items-start sm:gap-3`}
            >
              <span className="flex min-h-9 items-center gap-1.5 pr-1 text-sm font-semibold text-muted">
                <span className="dot" />
                {name}
              </span>
              <span className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:gap-1.5">
                {shown.map((recipe) => (
                  <Link
                    key={recipe.id}
                    href={`/woche?w=${week}&rezept=${recipe.id}`}
                    className="chip min-h-9 max-w-full border-transparent bg-[var(--kind,var(--color-surface))] px-3 text-sm"
                    aria-label={`${recipe.title} einplanen`}
                  >
                    <span className="truncate">{recipe.title}</span>
                  </Link>
                ))}
                {more > 0 && (
                  <Link
                    href={`/woche?w=${week}&wuensche=alle#wuensche`}
                    scroll={false}
                    className="chip min-h-9 px-3 text-sm text-muted"
                  >
                    {more} weitere
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * What there is to eat today, and what the weekend holds: the two things anyone in the
 * household asks of a week that is running.
 */
/** The days `Today` speaks of: today, and what is still to come of the weekend. */
function todayAndWeekend(now: IsoDate): IsoDate[] {
  const monday = mondayOf(now);
  return [now, ...[addDays(monday, 5), addDays(monday, 6)].filter((date) => date > now)];
}

/** Whether there is anything planned for today or the weekend to show. */
function hasToday(slots: readonly PlanSlot[], now: IsoDate): boolean {
  return todayAndWeekend(now).some((date) => slots.some((slot) => slot.date === date));
}

function Today({
  now,
  week,
  slots,
  recipeOf,
  dated,
}: {
  now: IsoDate;
  /** The week the page shows, which the recipes named here lead back to. */
  week: IsoDate;
  slots: PlanSlot[];
  recipeOf: ReadonlyMap<string, RecipeSummary>;
  /** Whether the card says the date: not where the greeting above already does. */
  dated: boolean;
}) {
  const monday = mondayOf(now);
  const weekend = todayAndWeekend(now).slice(1);
  const at = (date: IsoDate, meal: Meal) =>
    slots.find((slot) => slot.date === date && slot.meal === meal);
  // Coffee on Sunday is said only when there is some.
  const mealsOn = (date: IsoDate) =>
    mealsOf(date).filter((meal) => meal !== "coffee" || at(date, meal));
  const said = (slot: PlanSlot | undefined) =>
    !slot
      ? "nichts geplant"
      : slot.kind === "recipes"
        ? slot.items.map((item) => recipeOf.get(item.recipeId)?.title ?? "Rezept").join(" und ")
        : slotText(slot);

  return (
    <section aria-label="Heute" className="card px-4 py-4 sm:px-5">
      <h2 className="text-lg font-bold tracking-tight">
        {dated ? (
          <>
            Heute, {weekdayLong(now)}
            <span className="font-normal text-muted"> · {dayAndMonth(now)}</span>
          </>
        ) : (
          "Heute"
        )}
      </h2>
      <ul className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {mealsOn(now).map((meal) => {
          const slot = at(now, meal);
          return (
            <li key={meal}>
              <p className="eyebrow">{MEAL_NAME[meal]}</p>
              {slot?.kind === "recipes" ? (
                <ul className="mt-0.5 space-y-1">
                  {slot.items.map((item) => (
                    <li key={item.recipeId}>
                      <KindTitle
                        recipe={recipeOf.get(item.recipeId)}
                        id={item.recipeId}
                        week={week}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={slot ? "font-semibold" : "text-muted"}>{said(slot)}</p>
              )}
            </li>
          );
        })}
      </ul>
      {weekend.length > 0 && (
        <>
          <h3 className="eyebrow mt-4 border-t border-line pt-3">Am Wochenende</h3>
          <ul className="mt-1 space-y-0.5">
            {weekend.map((date) => (
              <li key={date}>
                <Link href={`/woche?w=${monday}#tag-${date}`} className="font-semibold">
                  {weekdayLong(date)}
                </Link>
                <span className="text-muted">
                  {": "}
                  {mealsOn(date)
                    .map((meal) => `${MEAL_NAME[meal]} ${said(at(date, meal))}`)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** A recipe's title as a link to it, with its pictogram on the colour of its kind in front. */
function KindTitle({
  recipe,
  id,
  week,
}: {
  recipe: RecipeSummary | undefined;
  id: string;
  /** The week of the plan the title stands on: the recipe's page leads back to it. */
  week: IsoDate;
}) {
  return (
    <span className="flex items-center gap-2.5">
      {recipe && <RecipeBadge recipe={recipe} className="h-8 w-8" />}
      <Link
        href={`/rezepte/${id}${fromPlan(week)}`}
        className="min-w-0 font-semibold decoration-line underline-offset-4 hover:underline"
      >
        {recipe?.title ?? "Rezept"}
      </Link>
    </span>
  );
}

/** Plus and minus for how much of a recipe is made. Zero takes the recipe away. */
function Amount({
  action,
  fields,
  servings,
  unit,
  title,
}: {
  action: (form: FormData) => Promise<void>;
  /** What says which recipe of what is meant. */
  fields: Record<string, string>;
  servings: number;
  unit: string | null;
  title: string;
}) {
  const step = (to: number, sign: string, label: string) => (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="servings" value={to} />
      <SubmitButton
        className="btn h-10 min-h-0 w-10 rounded-full p-0 text-lg leading-none"
        label={label}
      >
        {sign}
      </SubmitButton>
    </form>
  );
  return (
    <div className="mt-1 flex items-center gap-2">
      {step(servings - 1, "−", `Weniger von ${title}`)}
      <span className="min-w-24 text-center text-sm text-muted">{plannedText(servings, unit)}</span>
      {step(Math.min(99, servings + 1), "+", `Mehr von ${title}`)}
    </div>
  );
}

/** The recipes of a week that belong to none of its meals. */
function Extras({
  week,
  extras,
  recipeOf,
}: {
  week: IsoDate;
  extras: PlanExtra[];
  recipeOf: ReadonlyMap<string, RecipeSummary>;
}) {
  return (
    <section aria-label="Außerdem" className="mt-4">
      <p className="text-muted">
        Was diese Woche gebraucht wird und zu keiner Mahlzeit gehört, etwa ein Kuchen für eine
        Einladung. Mit einem Tag wird es für diesen Tag eingekauft wie eine Mahlzeit, ohne Tag beim
        ersten Einkauf der Woche.
      </p>
      {extras.length > 0 && (
        <ul className="card mt-3 divide-y divide-line">
          {extras.map((extra) => {
            const recipe = recipeOf.get(extra.recipeId);
            const title = recipe?.title ?? "Rezept";
            return (
              <li key={extra.recipeId} className="space-y-2 px-4 py-3">
                <p>
                  <Link
                    href={`/rezepte/${extra.recipeId}${fromPlan(week)}`}
                    className="font-semibold decoration-line underline-offset-4 hover:underline"
                  >
                    {title}
                  </Link>
                  {extra.date && (
                    <span className="text-muted">
                      {" · für "}
                      {weekdayLong(extra.date)}
                    </span>
                  )}
                </p>
                <Amount
                  action={changeExtraServings}
                  fields={{ week, recipe: extra.recipeId }}
                  servings={extra.servings}
                  unit={recipe?.servings?.unit ?? null}
                  title={title}
                />
                <form
                  action={describeExtra}
                  className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[13rem_1fr_auto]"
                >
                  <input type="hidden" name="week" value={week} />
                  <input type="hidden" name="recipe" value={extra.recipeId} />
                  <label className="col-span-2 sm:col-span-1">
                    <span className="sr-only">An welchem Tag wird {title} gebraucht?</span>
                    <select name="date" defaultValue={extra.date ?? ""} className="field">
                      <option value="">Ohne Tag</option>
                      {weekDates(week).map((day) => (
                        <option key={day} value={day}>
                          {weekdayLong(day)}, {dayAndMonth(day)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Wofür ist {title}?</span>
                    <input
                      name="note"
                      defaultValue={extra.note ?? ""}
                      maxLength={80}
                      className="field"
                      placeholder="Wofür? z. B. Einladung"
                    />
                  </label>
                  <SubmitButton className="btn btn-small min-h-11">Merken</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={`/woche/auswahl?w=${week}&ziel=extra`} className="btn btn-primary mt-4">
        Rezept hinzufügen
      </Link>
    </section>
  );
}

/** The week counted: how many meals of each kind, against what the household aims for. */
function Balance({ lines }: { lines: BalanceLine[] }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-line py-3">
      <ul
        aria-label="Ausgewogenheit der Woche"
        className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
      >
        {lines.map((line) => {
          const over = line.max !== null && line.count > line.max;
          const reached = line.min !== null ? missing(line) === 0 : !over && line.count > 0;
          return (
            <li key={line.group} className={`kind-${line.group}`}>
              <span className="eyebrow flex items-center gap-1.5">
                <span className="dot" />
                {GROUP_NAME[line.group]}
              </span>
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
      <Link href="/woche/ziele" className="btn btn-small">
        Ziele ändern
      </Link>
    </div>
  );
}

interface CellProps {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  slot: PlanSlot | undefined;
  /** The answer to "Hast du einen Vorschlag?", when this meal was asked about. */
  proposal: Suggestion | undefined;
  /** An idea offered in an open meal nobody asked about. */
  hint: Suggestion | undefined;
  /** How often another suggestion was asked for. */
  draw: number;
  /** Whether a suggestion can be asked for: not for a meal that is over. */
  canAsk: boolean;
  recipeOf: ReadonlyMap<string, RecipeSummary>;
  /** The recipe that is being put somewhere, if the page was opened for that. */
  placing: RecipeSummary | null;
  /** The plan is saved: the meal is shown to read, with a pen to change it. */
  locked: boolean;
  /** The plan is saved and someone took the pen to this meal. */
  withPen: boolean;
}

function MealCell({
  week,
  date,
  meal,
  slot,
  proposal,
  hint,
  draw,
  canAsk,
  recipeOf,
  placing,
  locked,
  withPen,
}: CellProps) {
  // The suggestion the meal shows: the one asked for, or else an idea offered unasked.
  const shown = proposal ?? hint;
  const ask = (again: number) => `/woche?w=${week}&frage=${date}.${meal}&v=${again}#tag-${date}`;
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
  // From tablet width on, coffee sits below lunch and dinner stays in the right column.
  const column =
    meal === "coffee"
      ? "sm:col-start-2 sm:row-start-2"
      : meal === "dinner"
        ? "sm:col-start-3 sm:row-start-1"
        : "";

  // A saved plan is read, not planned: what there is, and a small pen for a change.
  if (locked) {
    return (
      <section aria-label={what} className={`min-w-0 ${column}`}>
        <p className="eyebrow flex items-center justify-between gap-2">
          {MEAL_NAME[meal]}
          <Link
            href={`/woche?w=${week}&stift=${date}.${meal}#tag-${date}`}
            scroll={false}
            className="-my-2 flex size-10 items-center justify-center rounded-full text-muted hover:text-accent"
            aria-label={`${what} bearbeiten`}
          >
            <PenIcon />
          </Link>
        </p>
        {slot?.kind === "recipes" && (
          <ul className="space-y-1.5">
            {slot.items.map((item) => {
              const recipe = recipeOf.get(item.recipeId);
              return (
                <li key={item.recipeId}>
                  <KindTitle recipe={recipe} id={item.recipeId} week={week} />
                  <p className="mt-0.5 text-sm text-muted">
                    {plannedText(item.servings, recipe?.servings?.unit ?? null)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {slot && slot.kind !== "recipes" && (
          <p className={`font-semibold ${slot.kind === "skipped" ? "text-muted" : ""}`}>
            {slotText(slot)}
          </p>
        )}
        {slot?.kind === "free_text" && (slot.foods?.length ?? 0) > 0 && (
          <p className="text-sm text-muted">{slot.foods?.map((food) => food.label).join(", ")}</p>
        )}
        {!slot && <p className="text-muted">Nichts geplant</p>}
      </section>
    );
  }

  return (
    <section aria-label={what} className={`min-w-0 ${column}`}>
      <p className="eyebrow flex items-center justify-between gap-2">
        {MEAL_NAME[meal]}
        {withPen && (
          <Link href={`/woche?w=${week}#tag-${date}`} scroll={false} className="link">
            Fertig
          </Link>
        )}
      </p>

      {slot?.kind === "recipes" && (
        <ul className="mt-1 space-y-2">
          {slot.items.map((item) => {
            const recipe = recipeOf.get(item.recipeId);
            return (
              <li key={item.recipeId}>
                <KindTitle recipe={recipe} id={item.recipeId} week={week} />
                <Amount
                  action={changeServings}
                  fields={{ week, date, meal, recipe: item.recipeId }}
                  servings={item.servings}
                  unit={recipe?.servings?.unit ?? null}
                  title={recipe?.title ?? "dem Rezept"}
                />
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
      {slot?.kind === "free_text" && (slot.foods?.length ?? 0) > 0 && (
        <p className="text-sm text-muted">{slot.foods?.map((food) => food.label).join(", ")}</p>
      )}
      {/*
        A typed meal the cookbook has no recipe for: the page can be photographed right now,
        while the week is planned, and the recipe takes the place of the text.
      */}
      {slot?.kind === "free_text" && !namedMeal(slot.label) && !placing && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-note px-3 py-1.5 text-sm">
          <span className="text-note-ink">Noch kein Rezept dazu</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/import?${new URLSearchParams({ d: date, m: meal })}`}
              className="btn btn-small min-h-9 border-note-line bg-white/60"
              aria-label={`${what}: Rezept hochladen`}
            >
              Hochladen
            </Link>
            <Link
              href={`/rezepte/neu?${new URLSearchParams({ titel: slot.label, w: week, d: date, m: meal })}`}
              className="font-semibold text-note-ink underline underline-offset-4"
              aria-label={`${what}: Rezept anlegen`}
            >
              Eintippen
            </Link>
            <form action={needsNoRecipe}>
              {where}
              <SubmitButton
                className="min-h-9 font-semibold text-note-ink underline underline-offset-4"
                label={`${what}: braucht kein Rezept`}
              >
                Braucht keins
              </SubmitButton>
            </form>
          </span>
        </div>
      )}

      {/*
       * A suggestion, asked for or offered unasked: a box of its own with a dashed edge, so
       * that it does not read as planned. Nothing is planned until "Gute Idee!".
       */}
      {!slot && shown && !placing && (
        <div className="mt-1 rounded-lg border border-dashed border-accent/50 bg-accent-soft/40 px-3 py-2.5">
          <p className="text-xs font-semibold text-accent">Vorschlag</p>
          <div className="mt-1">
            <KindTitle recipe={shown.recipe} id={shown.recipe.id} week={week} />
          </div>
          {shown.reasons.length > 0 && (
            <p className="mt-1 text-sm text-muted">{whyText(shown.reasons)}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <form action={planRecipe}>
              {where}
              <input type="hidden" name="recipe" value={shown.recipe.id} />
              <input type="hidden" name="mode" value="replace" />
              <SubmitButton
                className="btn btn-primary btn-small"
                label={`${what}: ${shown.recipe.title} einplanen`}
              >
                Gute Idee!
              </SubmitButton>
            </form>
            {/* An idea offered unasked is the first answer; the next one is the second. */}
            <Link href={ask(proposal ? draw + 1 : 1)} scroll={false} className="btn btn-small">
              Noch ein Vorschlag
            </Link>
          </div>
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
            {slot.kind === "free_text" && (
              <Link
                href={`/woche/lebensmittel?w=${week}&d=${date}&m=${meal}`}
                className="link text-sm"
                aria-label={`${what}: Lebensmittel`}
              >
                Lebensmittel
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
            <Link
              href={choose("replace")}
              className={shown ? "link text-sm" : "btn btn-small"}
              aria-label={`${what} planen`}
            >
              {shown ? "Selbst wählen" : "Planen"}
            </Link>
            {canAsk && !shown && (
              <Link
                href={ask(0)}
                scroll={false}
                className="link text-sm"
                aria-label={`${what}: Hast du einen Vorschlag?`}
              >
                Hast du einen Vorschlag?
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
