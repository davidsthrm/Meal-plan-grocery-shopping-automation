import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowIcon, WishIcon } from "@/components/icons";
import { RecipeBadge } from "@/components/recipe-card";
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
import { mealsOf, MEALS, type Meal, type PlanExtra, type PlanSlot } from "@/domain/plan";
import { missing, weekBalance, type BalanceLine } from "@/domain/recommend/balance";
import { suggest, suggestWeek, type Suggestion } from "@/domain/recommend/suggest";
import { rank } from "@/domain/rank";
import {
  GROUP_NAME,
  MEAL_NAME,
  plannedText,
  slotText,
  targetText,
  TARGETS_SEEN,
  whyText,
} from "@/lib/plan-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { loadExtras, loadHistory, loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import {
  acceptSuggestions,
  changeExtraServings,
  changeServings,
  clearSlot,
  copyLastWeek,
  noteExtra,
  planExtra,
  planRecipe,
} from "./actions";

export const metadata: Metadata = { title: "Wochenplan" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** How many ideas show faintly in an empty week, and what an idea needs to be one of them. */
const HINTS = 3;
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
  const asked = one(params.w);
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : planningWeek(now);
  // The meal someone asked a suggestion for, and how often they asked for another one.
  const askedFor = one(params.frage) ?? "";
  const draw = Math.max(0, Math.floor(Number(one(params.v)) || 0));
  const placingId = one(params.rezept) ?? null;

  const db = await createSessionClient();
  const [library, slots, history, previous, extras] = await Promise.all([
    loadLibrary(db),
    loadWeek(db, week),
    loadHistory(db, week),
    loadWeek(db, addDays(week, -7)),
    loadExtras(db, week),
  ]);
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
  // What would complete the week. Nothing of it is put on the plan unasked.
  const picks = placing || showExtras ? [] : suggestWeek(library.recipes, open, context);
  const pickAt = (date: IsoDate, meal: Meal) =>
    picks.find((pick) => pick.date === date && pick.meal === meal)?.suggestion;
  // A few of them show faintly in their meal: the ones with the most to say for them, and
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
  const thisWeek = planningWeek(now);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Wochenplan</p>
          <h1 className="title mt-1">{weekRange(week)}</h1>
        </div>
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
      </div>

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
        <nav aria-label="Ansicht" className="mt-5 flex gap-2">
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
      )}

      {showExtras && <Extras week={week} extras={extras} recipeOf={recipeOf} />}

      {!placing && !showExtras && wishes.length > 0 && (
        <section aria-label="Möchte ich kochen" className="mt-4">
          <p className="eyebrow flex items-center gap-1.5">
            <WishIcon filled />
            Möchte ich kochen
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {wishes.map((recipe) => (
              <Link
                key={recipe.id}
                href={`/woche?w=${week}&rezept=${recipe.id}`}
                className="chip"
                aria-label={`${recipe.title} einplanen`}
              >
                {recipe.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      {!placing && !showExtras && (picks.length > 0 || slots.length === 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
          {slots.length === 0 && previous.length > 0 && (
            <form action={copyLastWeek}>
              <input type="hidden" name="week" value={week} />
              <SubmitButton className="btn btn-small">Letzte Woche übernehmen</SubmitButton>
            </form>
          )}
        </div>
      )}

      {!showExtras && (
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
                  canAsk={date >= now && meal !== "coffee"}
                  recipeOf={recipeOf}
                  placing={placing}
                />
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A recipe's title as a link to it, with its pictogram on the colour of its kind in front. */
function KindTitle({ recipe, id }: { recipe: RecipeSummary | undefined; id: string }) {
  return (
    <span className="flex items-center gap-2.5">
      {recipe && <RecipeBadge recipe={recipe} className="h-8 w-8" />}
      <Link
        href={`/rezepte/${id}`}
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
        Einladung. Es kommt mit auf die Einkaufsliste.
      </p>
      {extras.length > 0 && (
        <ul className="card mt-3 divide-y divide-line">
          {extras.map((extra) => {
            const recipe = recipeOf.get(extra.recipeId);
            const title = recipe?.title ?? "Rezept";
            return (
              <li key={extra.recipeId} className="space-y-2 px-4 py-3">
                <Link
                  href={`/rezepte/${extra.recipeId}`}
                  className="font-semibold decoration-line underline-offset-4 hover:underline"
                >
                  {title}
                </Link>
                <Amount
                  action={changeExtraServings}
                  fields={{ week, recipe: extra.recipeId }}
                  servings={extra.servings}
                  unit={recipe?.servings?.unit ?? null}
                  title={title}
                />
                <form action={noteExtra} className="flex gap-2">
                  <input type="hidden" name="week" value={week} />
                  <input type="hidden" name="recipe" value={extra.recipeId} />
                  <label className="flex-1">
                    <span className="sr-only">Wofür ist {title}?</span>
                    <input
                      name="note"
                      defaultValue={extra.note ?? ""}
                      maxLength={80}
                      className="field"
                      placeholder="Wofür? z. B. Einladung am Samstag"
                    />
                  </label>
                  <SubmitButton className="btn btn-small">Merken</SubmitButton>
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
    <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-y border-line py-3">
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
      <Link href="/woche/ziele" className="link inline-flex min-h-10 items-center text-sm">
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
  /** An idea shown faintly in an open meal nobody asked about. */
  hint: Suggestion | undefined;
  /** How often another suggestion was asked for. */
  draw: number;
  /** Whether a suggestion can be asked for: not for a meal that is over. */
  canAsk: boolean;
  recipeOf: ReadonlyMap<string, RecipeSummary>;
  /** The recipe that is being put somewhere, if the page was opened for that. */
  placing: RecipeSummary | null;
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
}: CellProps) {
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

  return (
    <section aria-label={what} className={`min-w-0 ${column}`}>
      <p className="eyebrow">{MEAL_NAME[meal]}</p>

      {slot?.kind === "recipes" && (
        <ul className="mt-1 space-y-2">
          {slot.items.map((item) => {
            const recipe = recipeOf.get(item.recipeId);
            return (
              <li key={item.recipeId}>
                <KindTitle recipe={recipe} id={item.recipeId} />
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

      {!slot && proposal && !placing && (
        <div className="mt-1 rounded-lg border border-accent/40 bg-surface px-3 py-2.5">
          <p className="text-xs font-semibold text-accent">Vorschlag</p>
          <div className="mt-1">
            <KindTitle recipe={proposal.recipe} id={proposal.recipe.id} />
          </div>
          {proposal.reasons.length > 0 && (
            <p className="mt-1 text-sm text-muted">{whyText(proposal.reasons)}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <form action={planRecipe}>
              {where}
              <input type="hidden" name="recipe" value={proposal.recipe.id} />
              <input type="hidden" name="mode" value="replace" />
              <SubmitButton
                className="btn btn-primary btn-small"
                label={`${what}: ${proposal.recipe.title} einplanen`}
              >
                Gute Idee!
              </SubmitButton>
            </form>
            <Link href={ask(draw + 1)} scroll={false} className="btn btn-small">
              Noch ein Vorschlag
            </Link>
          </div>
        </div>
      )}

      {/* Nobody asked: an idea may show, pale, and waits to be asked about. */}
      {!slot && !proposal && hint && !placing && (
        <Link
          href={ask(0)}
          scroll={false}
          className="mt-1 flex items-center gap-2 opacity-55 transition-opacity hover:opacity-100"
          aria-label={`${what}: Idee ${hint.recipe.title} ansehen`}
        >
          <RecipeBadge recipe={hint.recipe} className="h-7 w-7" />
          <span className="min-w-0 truncate text-sm text-muted">{hint.recipe.title}</span>
        </Link>
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
            {/* A typed meal the library has no recipe for can become one. */}
            {slot.kind === "free_text" && slot.label !== "Vesper" && (
              <Link
                href={`/rezepte/neu?${new URLSearchParams({ titel: slot.label, w: week, d: date, m: meal })}`}
                className="link text-sm"
                aria-label={`${what}: Rezept anlegen`}
              >
                Rezept anlegen
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
              className={proposal ? "link text-sm" : "btn btn-small"}
              aria-label={`${what} planen`}
            >
              {proposal ? "Selbst wählen" : "Planen"}
            </Link>
            {canAsk && !proposal && (
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
