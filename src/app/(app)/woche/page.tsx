import type { Metadata } from "next";
import { SegmentPill } from "@/components/segment-pill";
import { WeekDone } from "@/components/week-done";
import { BACK, FORWARD, SWAP } from "@/lib/transitions";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowIcon,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  ListIcon,
  MoveIcon,
  PenIcon,
  PersonIcon,
  PlusIcon,
  PrinterIcon,
  StackIcon,
  TrashIcon,
  WishIcon,
} from "@/components/icons";
import { ListMemory } from "@/components/list-return";
import { PdfLink } from "@/components/pdf-link";
import { ResetWeek } from "@/components/reset-week";
import { SheetHoles } from "@/components/sheet-holes";
import { ServingsStepper } from "@/components/servings-stepper";
import { SubmitButton } from "@/components/submit-button";
import {
  addDays,
  dayAndMonth,
  daysFromToday,
  mondayOf,
  monthOfWeek,
  weekDates,
  weekdayLong,
  weekdayShort,
  weekRange,
  type IsoDate,
  hasWeekBefore,
  weekShown,
} from "@/domain/dates";
import {
  BY_KIND,
  groupRecipes,
  readWishGrouping,
  WISH_GROUPINGS,
  wishGrouping,
  type WishGrouping,
} from "@/domain/library/grouping";
import { EFFORT_NAME, type Effort, type TagGroup } from "@/domain/library/tags";
import { firstName, salutation } from "@/domain/family";
import type { RecipeSummary } from "@/domain/library/summary";
import { openingWeek } from "@/domain/planned";
import {
  contentOf,
  cookedServings,
  LEFTOVER_DAYS,
  mealsOf,
  MEALS,
  namedMeal,
  openMealsAfter,
  slotKey,
  weekPlanned,
  type Meal,
  type PlanExtra,
  type PlanSlot,
} from "@/domain/plan";
import { progress, weekBalance, type BalanceLine } from "@/domain/recommend/balance";
import {
  hintedMeals,
  suggest,
  suggestWeek,
  tagsOfWeek,
  varietyTags,
  type Suggestion,
} from "@/domain/recommend/suggest";
import { monthOf } from "@/domain/season/calendar";
import { foodText } from "@/domain/vesper";
import {
  GROUP_NAME,
  kindGroupName,
  MEAL_NAME,
  mealPlaceText,
  recipeTone,
  plannedText,
  slotText,
  targetText,
  TARGETS_SEEN,
  whyText,
} from "@/lib/plan-text";
import { fromPlan } from "@/lib/origin";
import { hourNow, today } from "@/lib/today";
import { loadSelf, requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { loadSeasonalFoods, withSeason } from "@/server/season";
import { isSaved, loadExtras, loadHistory, loadWeek } from "@/server/planning/week";
import { createSessionClient } from "@/server/supabase/server";
import { CookMore, ExtraPortions } from "./cook-more";
import { MealPen, PenFold } from "./meal-pen";
import { MealSection, MealUndoBar } from "./meal-undo";
import { MoveMeal, type GridMeal } from "./move-meal";
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

/** How many different suggestions a meal can be asked for before they come round again. */
const PROPOSALS = 12;

export default async function WeekPage(props: PageProps<"/woche">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  // Whoever opens the plan on a device for the first time is shown what the household aims
  // for in a week, and can change it: whoever made the household is asked, everyone else
  // is welcomed and shown what was set.
  if (!(await cookies()).has(TARGETS_SEEN)) {
    const me = await loadSelf();
    redirect(me.role === "admin" ? "/woche/ziele?start=1" : "/willkommen");
  }
  const now = today();
  const db = await createSessionClient();
  // The library does not depend on the week: it is read while the week is found.
  const libraryRead = loadLibrary(db, household);
  // What each recipe is made with that has a season: suggestions weigh the week's month.
  const seasonalRead = loadSeasonalFoods(db, household);
  // The running week decides which week the planner opens on, and what there is today.
  const running = mondayOf(now);
  const runningSlots = await loadWeek(db, running);
  const thisWeek = openingWeek(now, runningSlots);
  const week = weekShown(one(params.w), thisWeek, household.firstWeek);
  // The meal someone asked a suggestion for, and how often they asked for another one.
  const askedFor = one(params.frage) ?? "";
  const draw = Math.max(0, Math.floor(Number(one(params.v)) || 0));
  const placingId = one(params.rezept) ?? null;
  // The one meal of a saved plan someone took the pen to.
  const pen = one(params.stift) ?? "";
  // The meal someone is cooking more of: "Mehr kochen" is open under it.
  const cookingMore = one(params.mehr) ?? "";

  const [library, seasonal, slots, nextSlots, history, extras, saved, self] = await Promise.all([
    libraryRead,
    seasonalRead,
    // The running week was read already.
    week === running ? runningSlots : loadWeek(db, week),
    // Leftovers of Sunday's dinner can be eaten in the next week.
    loadWeek(db, addDays(week, 7)),
    loadHistory(db, week),
    loadExtras(db, week),
    isSaved(db, week),
    loadSelf(),
  ]);
  // Whoever opens the plan is greeted by the name they gave themselves, if they gave one.
  const greeting = firstName(self.name);
  const recipeOf = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));
  const placing = placingId ? (recipeOf.get(placingId) ?? null) : null;
  // The second view of a week: what it needs outside its meals.
  const showExtras = one(params.t) === "extra" && !placing;
  const slotAt = (date: IsoDate, meal: Meal) =>
    slots.find((slot) => slot.date === date && slot.meal === meal);
  // The open meals in the days after a meal: where its leftovers can go.
  const taken = new Set([...slots, ...nextSlots].map((slot) => slotKey(slot.date, slot.meal)));
  const laterMeals = (date: IsoDate, meal: Meal) =>
    openMealsAfter({ date, meal }, taken, addDays(date, LEFTOVER_DAYS));
  // A meal cooked for leftovers says on which meal they are eaten: mostly one, more where
  // "Mehr kochen" was used again once its extra portions were back to none.
  const leftoversOn = (slot: PlanSlot | undefined) =>
    [...slots, ...nextSlots]
      .filter((other) => other.kind === "leftovers" && slot && other.ofSlotId === slot.id)
      .map((on) => ({ date: on.date, meal: on.meal }));
  // Leftovers say which meal they are from, where it is in this week.
  const leftoversOf = (slot: PlanSlot | undefined) => {
    const from =
      slot?.kind === "leftovers" && slot.ofSlotId
        ? slots.find((other) => other.id === slot.ofSlotId)
        : undefined;
    return from ? `von ${weekdayShort(from.date)} ${MEAL_NAME[from.meal]}` : undefined;
  };

  // Every meal of the week in a word, for the grid of "Auf einen anderen Tag".
  const moves: GridMeal[] = slots.map((slot) => ({
    id: slot.id,
    date: slot.date,
    meal: slot.meal,
    kind: slot.kind,
    ofSlotId: slot.kind === "leftovers" ? slot.ofSlotId : null,
    name:
      slot.kind === "recipes"
        ? (recipeOf.get(slot.items[0]?.recipeId ?? "")?.title ?? "Rezept")
        : slotText(slot),
  }));
  const balance = weekBalance(slots, (id) => recipeOf.get(id), household.targets);
  const days = weekDates(week);
  // In the running week the sheet starts with today; the days that are over go to its foot.
  const { ahead, past } = daysFromToday(week, now);
  // Nothing is suggested for meals that are over, and coffee on Sunday stays optional.
  const open = days
    .filter((date) => date >= now)
    .flatMap((date) => MEALS.filter((meal) => !slotAt(date, meal)).map((meal) => ({ date, meal })));
  const planned = new Set(
    slots.flatMap((slot) =>
      slot.kind === "recipes" ? slot.items.map((item) => item.recipeId) : [],
    ),
  );
  // The main ingredients and kinds of dish the week has: a second of them counts against.
  const variety = varietyTags(library.tagGroups);
  const context = {
    balance,
    planned,
    history,
    weekStart: week,
    seed: week,
    variety,
    usedTags: tagsOfWeek(
      [...planned].flatMap((id) => recipeOf.get(id) ?? []),
      variety,
    ),
  };
  // Suggestions weigh what is in season in the month the week counts for.
  const suggestable = withSeason(library.recipes, seasonal, monthOf(monthOfWeek(week)));
  // What would complete the week. Nothing of it is put on the plan unasked, and a plan the
  // household saved is done with suggestions.
  const picks = placing || showExtras || saved ? [] : suggestWeek(suggestable, open, context);
  const pickAt = (date: IsoDate, meal: Meal) =>
    picks.find((pick) => pick.date === date && pick.meal === meal)?.suggestion;
  // A few of them are offered in their meal: the ones with the most to say for them.
  const hinted = hintedMeals(picks, week);
  // The answer to "Was könnten wir kochen?": the pick for that meal first, then the next best
  // one each time another is asked for, and round again when the list is through.
  const question = open.find((slot) => `${slot.date}.${slot.meal}` === askedFor);
  let proposal: Suggestion | undefined;
  if (question && !placing && !showExtras) {
    const first = pickAt(question.date, question.meal);
    const ranked = suggest(
      suggestable,
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
  // "What is there to eat today?" is asked of the week that is running, and on the week the
  // planner opens on, which from Saturday on is the next one. Not on any other: tapping
  // forward to next week on a Tuesday showed the card again (audit, 24 November 2026).
  const showToday =
    (week === running || week === thisWeek) &&
    !placing &&
    !showExtras &&
    hasToday(runningSlots, now);

  // A day of the sheet with its meals. One that is over is said so and drawn quieter.
  const dayRow = (date: IsoDate, over: boolean) => (
    <li
      key={date}
      id={`tag-${date}`}
      className="grid scroll-mt-4 gap-x-4 gap-y-2.5 px-4 py-3 sm:grid-cols-2 sm:px-5 sm:py-4 lg:grid-cols-[7.5rem_1fr_1fr]"
    >
      {/* On an iPad upright the day stands above its meals: beside them, each meal had a
          third of the width and a long dish ran into its stepper. The gap clears the
          highlighter, which reaches past the name: "Heute" stood right against it. */}
      <h2 className="flex items-baseline gap-3 sm:col-span-2 lg:col-span-1 lg:block">
        <span
          className={`text-lg font-bold tracking-tight ${date === now ? "marked" : ""} ${over ? "text-muted" : ""}`}
        >
          {weekdayLong(date)}
        </span>
        {date === now ? (
          <span className="text-sm font-semibold text-accent lg:mt-1 lg:block">Heute</span>
        ) : (
          <span className="text-sm text-muted lg:block">{dayAndMonth(date)}</span>
        )}
      </h2>
      {mealsOf(date).map((meal) => (
        <MealCell
          key={meal}
          week={week}
          date={date}
          meal={meal}
          slot={slotAt(date, meal)}
          proposal={question?.date === date && question.meal === meal ? proposal : undefined}
          hint={hinted.has(`${date}.${meal}`) ? pickAt(date, meal) : undefined}
          draw={draw}
          canAsk={date >= now && meal !== "coffee" && !saved}
          recipeOf={recipeOf}
          placing={placing}
          locked={saved && !placing && pen !== `${date}.${meal}`}
          withPen={saved && pen === `${date}.${meal}`}
          later={laterMeals(date, meal)}
          servings={household.defaultServings}
          leftoversOf={leftoversOf(slotAt(date, meal))}
          leftoversOn={leftoversOn(slotAt(date, meal))}
          cookingMore={cookingMore === `${date}.${meal}`}
          moves={moves}
        />
      ))}
    </li>
  );

  const title = (
    <div>
      {greeting ? (
        /*
         * A large title, as on the first screen of an app: the day small above it, the
         * greeting large with the name in the green of the logo, and the week below as
         * the heading of the page.
         */
        <>
          <p className="font-medium text-muted">
            {weekdayLong(now)}, {dayAndMonth(now)}
          </p>
          <p className="greeting mt-1">
            {salutation(hourNow())}, <span className="text-accent">{greeting}</span>
          </p>
          <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-muted">
            Wochenplan
            <span aria-hidden className="mx-2 text-line">
              ·
            </span>
            {/* A week across two months takes a second line on a phone: it breaks at the
                dash, never inside a day ("30. November – / 6. Dezember"). */}
            <span className="text-ink">{weekRange(week).replace(/\. /g, ".\u00a0")}</span>
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
  // Back, the running week and forward as one control; all weeks and the statistics next to
  // it, signs on a phone, so that the row stays one line on every week (22 November 2026).
  const weekNav = (
    <nav
      aria-label="Woche wechseln"
      className="flex items-center gap-1.5 max-sm:text-sm sm:gap-x-3"
    >
      <span className="capsule">
        {/* Not before the week the household started with the app. */}
        {hasWeekBefore(week, household.firstWeek) ? (
          <Link
            href={weekLink(addDays(week, -7))}
            prefetch
            transitionTypes={[BACK]}
            aria-label="Vorige Woche"
          >
            <ArrowIcon back />
          </Link>
        ) : (
          <a aria-disabled="true" aria-label="Vorige Woche" className="opacity-30">
            <ArrowIcon back />
          </a>
        )}
        {week !== thisWeek && (
          <Link
            href={weekLink(thisWeek)}
            prefetch
            transitionTypes={[thisWeek > week ? FORWARD : BACK]}
          >
            Aktuelle
          </Link>
        )}
        <Link
          href={weekLink(addDays(week, 7))}
          prefetch
          transitionTypes={[FORWARD]}
          aria-label="Nächste Woche"
        >
          <ArrowIcon />
        </Link>
      </span>
      <Link
        href={`/woche/verlauf?w=${week}`}
        transitionTypes={[FORWARD]}
        className="link inline-flex min-h-11 items-center gap-1.5 max-sm:px-3"
        aria-label="Alle Wochen"
        title="Alle Wochen"
      >
        <CalendarIcon />
        <span className="max-sm:hidden">Alle Wochen</span>
      </Link>
      <Link
        href="/woche/statistik"
        transitionTypes={[FORWARD]}
        className="link inline-flex min-h-11 items-center gap-1.5 max-sm:px-3"
        aria-label="Statistik"
        title="Statistik"
      >
        <ChartIcon />
        <span className="max-sm:hidden">Statistik</span>
      </Link>
    </nav>
  );

  return (
    <div className="mx-auto max-w-5xl">
      {/* Back from a recipe, the plan stands where it was left: at the meal being planned. */}
      <ListMemory />
      <MealUndoBar />
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
      {/* A week ahead planned to its last meal is celebrated, once. */}
      {week > running && (
        <WeekDone
          week={week}
          planned={weekPlanned(slots, week)}
          meals={slots.filter((slot) => slot.meal !== "coffee").length}
        />
      )}

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
            <Link href={`/woche?w=${week}`} className="link min-h-11">
              Abbrechen
            </Link>
          </span>
        </div>
      ) : (
        /*
         * The two views of the week on the left; on the right what can be done with the
         * whole plan, saving it last. On a phone they wrap below the views.
         */
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
          <nav aria-label="Ansicht" className="segmented">
            <SegmentPill name="pill-woche" at={showExtras ? 1 : 0} of={2} />
            <Link
              href={`/woche?w=${week}`}
              transitionTypes={[SWAP]}
              className="segment"
              aria-current={showExtras ? undefined : "page"}
            >
              Mahlzeiten
            </Link>
            <Link
              href={`/woche?w=${week}&t=extra`}
              transitionTypes={[SWAP]}
              className="segment"
              aria-current={showExtras ? "page" : undefined}
            >
              Außerdem{extras.length > 0 ? ` (${extras.length})` : ""}
            </Link>
          </nav>
          {!showExtras && (
            /* One row at 375px too: the signs are round and as wide as a finger, the words
                hug theirs closer, and nothing stands between them (23 November 2026). */
            <div className="plan-actions flex flex-wrap items-center gap-1.5 sm:ml-auto sm:justify-end sm:gap-2">
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
                  <SubmitButton className="btn btn-small max-sm:px-2" label="Plan vervollständigen">
                    <span className="sm:hidden">Vervollständigen</span>
                    <span className="max-sm:hidden">Plan vervollständigen</span>
                  </SubmitButton>
                </form>
              )}
              {/* The plan to print and pin up: a PDF the size of a postcard. On a phone beside
                  "Vervollständigen" it is its sign alone, the word broke the row at 375px. */}
              {slots.length + extras.length > 0 && (
                <PdfLink
                  href={`/woche/pdf?w=${week}`}
                  name={`Wochenplan ${weekRange(week)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`btn btn-small ${picks.length > 0 ? "max-sm:w-[2.6rem] max-sm:px-0 max-sm:[&>span]:hidden" : ""}`}
                  aria-label="Drucken"
                  title="Drucken"
                >
                  <PrinterIcon />
                  <span>Drucken</span>
                </PdfLink>
              )}
              {/* Done planning: the plan is saved and shown to read. Or the whole week is
                  rubbed out. A saved plan says so by its pens and "Plan bearbeiten": the line
                  "Gespeichert." stood between the buttons and broke their row. */}
              {slots.length + extras.length > 0 &&
                (saved ? (
                  <>
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
                      <SubmitButton
                        className="btn btn-primary btn-small max-sm:px-2"
                        label="Plan speichern"
                      >
                        <span className="sm:hidden">Speichern</span>
                        <span className="max-sm:hidden">Plan speichern</span>
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
            {ahead.map((date) => dayRow(date, false))}
            {/* The days that are over lie at the foot, under a word that says so: the
                household looks at what is coming, not at Monday on a Tuesday. */}
            {past.length > 0 && (
              <li className="px-4 pt-5 pb-1 sm:px-5" aria-hidden>
                <span className="eyebrow">Vorbei</span>
              </li>
            )}
            {past.map((date) => dayRow(date, true))}
          </ol>
        </div>
      )}

      {!placing && !showExtras && !saved && wishes.length > 0 && (
        <Wishes
          week={week}
          wishes={wishes}
          all={one(params.wuensche) === "alle"}
          by={readWishGrouping(one(params["wuensche-nach"]))}
          tagGroups={library.tagGroups}
        />
      )}
    </div>
  );
}

/** How many wishes a kind shows before the rest is folded into "weitere". */
const WISHES_SHOWN = 8;

/** The ways the wishes can be sorted, as the row above them names them. */
const WISH_GROUPING_NAME: Record<WishGrouping, string> = {
  art: "Art",
  aufwand: "Aufwand",
  gericht: "Gericht",
  kueche: "Küche",
  saison: "Saison",
};

/**
 * What someone wants to cook soon, below the plan, sorted by kind so that dozens of them stay
 * a few rows, or by a group of tags: how much work, what kind of dish, cuisine, season. A
 * tap puts one on a meal.
 */
function Wishes({
  week,
  wishes,
  all,
  by,
  tagGroups,
}: {
  week: IsoDate;
  wishes: RecipeSummary[];
  /** Every wish is shown, not only the first of each kind. */
  all: boolean;
  by: WishGrouping;
  tagGroups: readonly TagGroup[];
}) {
  const tagName = new Map(tagGroups.flatMap((group) => group.tags.map((t) => [t.ref, t.name])));
  const groups: { key: string | null; name: string; tone: string; recipes: RecipeSummary[] }[] =
    by === "art"
      ? groupRecipes(wishes, BY_KIND).map((group) => ({
          ...group,
          name: kindGroupName(group.key),
          tone: group.key ? `kind-${group.key}` : "",
        }))
      : groupRecipes(wishes, wishGrouping(by, tagGroups)).map((group) => ({
          ...group,
          name:
            group.key === null
              ? "Ohne Angabe"
              : by === "aufwand"
                ? EFFORT_NAME[group.key as Effort]
                : (tagName.get(group.key) ?? group.key),
          tone: "",
        }));
  const address = (extra: Record<string, string>, way = by) =>
    `/woche?${new URLSearchParams({
      w: week,
      ...(all ? { wuensche: "alle" } : {}),
      ...(way !== "art" ? { "wuensche-nach": way } : {}),
      ...extra,
    })}#wuensche`;
  return (
    <section id="wuensche" aria-label="Möchte ich kochen" className="mt-8 scroll-mt-4">
      <h2 className="eyebrow flex items-center gap-1.5">
        <WishIcon filled />
        Möchte ich kochen
        <span className="font-normal">· {wishes.length}</span>
      </h2>
      <nav aria-label="Wünsche sortieren" className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted">Nach</span>
        {WISH_GROUPINGS.map((way) => (
          <Link
            key={way}
            href={address({}, way)}
            scroll={false}
            className={`chip min-h-11 px-3 text-sm ${by === way ? "chip-on" : ""}`}
            aria-current={by === way ? "true" : undefined}
          >
            {WISH_GROUPING_NAME[way]}
          </Link>
        ))}
      </nav>
      <ul className="mt-3 space-y-2.5">
        {groups.map((group) => {
          const shown = all ? group.recipes : group.recipes.slice(0, WISHES_SHOWN);
          const more = group.recipes.length - shown.length;
          const name = group.name;
          return (
            <li
              key={group.key ?? "rest"}
              aria-label={name}
              className={`${group.tone} flex flex-wrap items-center gap-1.5 sm:grid sm:grid-cols-[8.5rem_1fr] sm:items-start sm:gap-3`}
            >
              <span className="flex min-h-11 items-center gap-1.5 pr-1 text-sm font-semibold text-muted">
                <span className="dot" />
                {name}
              </span>
              <span className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:gap-1.5">
                {shown.map((recipe) => (
                  <Link
                    key={recipe.id}
                    href={`/woche?w=${week}&rezept=${recipe.id}`}
                    className="chip min-h-11 max-w-full border-transparent bg-[var(--kind,var(--color-surface))] px-3 text-sm"
                    aria-label={`${recipe.title} einplanen`}
                  >
                    <span className="truncate">{recipe.title}</span>
                  </Link>
                ))}
                {more > 0 && (
                  <Link
                    href={address({ wuensche: "alle" })}
                    scroll={false}
                    className="chip min-h-11 px-3 text-sm text-muted"
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

/** What a meal holds, as words: "Lachs mit Dill und Dinkelbaguette", "Vesper", "noch offen". */
function slotSaid(slot: PlanSlot | undefined, recipeOf: ReadonlyMap<string, RecipeSummary>) {
  if (!slot) return "noch offen";
  if (slot.kind !== "recipes") return slotText(slot);
  return [
    ...slot.items.map((item) => recipeOf.get(item.recipeId)?.title ?? "Rezept"),
    ...(slot.foods ?? []).map(foodText),
  ].join(" und ");
}

/**
 * Today's meals, and below them Saturday and Sunday in two plain columns, each meal on a
 * line of its own with the dot of its kind: the weekend was one grey sentence the household
 * did not read (October 2026). Today's dishes are named at 19px, the strongest thing on the page
 * after the greeting (`.today-card`, 23 November 2026).
 */
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
  const meal = (date: IsoDate, which: Meal, size: string) => {
    const slot = at(date, which);
    return (
      <li key={which} className="min-w-0">
        <p className="eyebrow">{MEAL_NAME[which]}</p>
        {slot?.kind === "recipes" ? (
          <ul className="mt-0.5 space-y-1">
            {slot.items.map((item) => (
              <li key={item.recipeId}>
                <KindTitle
                  recipe={recipeOf.get(item.recipeId)}
                  id={item.recipeId}
                  week={week}
                  day={date}
                  size={size}
                  servings={{ planned: item.servings, extra: slot.extra }}
                />
              </li>
            ))}
            {(slot.foods?.length ?? 0) > 0 && (
              <li className="text-sm">
                <span className="text-muted">Dazu: </span>
                {slot.foods?.map(foodText).join(", ")}
              </li>
            )}
          </ul>
        ) : slot ? (
          <SlotName size={size} className="font-semibold">
            {slotSaid(slot, recipeOf)}
          </SlotName>
        ) : (
          <p className="text-muted">{slotSaid(slot, recipeOf)}</p>
        )}
      </li>
    );
  };

  return (
    <section aria-label="Heute" className="card today-card px-4 py-3.5 sm:px-5">
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
      {/* On a phone today's dishes stand one under the other, each on a whole line at 19px
          and breaking between its words only: side by side, a column of 125 to 150px cut
          "Kartoffelsupp|e" (audit, 24 November 2026). From sm on they stand side by side. */}
      <ul className="mt-1.5 grid gap-x-4 gap-y-2.5 sm:grid-cols-2 max-sm:[&_a]:hyphens-manual">
        {mealsOn(now).map((which) => meal(now, which, "text-lg"))}
      </ul>
      {weekend.length > 0 && (
        <section aria-label="Am Wochenende" className="mt-3.5">
          <h3 className="eyebrow">Am Wochenende</h3>
          <div className="weekend-days mt-1.5">
            {weekend.map((date) => (
              <div key={date} className="weekend-day">
                <Link href={`/woche?w=${monday}#tag-${date}`} className="font-bold tracking-tight">
                  {weekdayLong(date)}
                </Link>
                <ul className="mt-1 space-y-1.5">
                  {mealsOn(date).map((which) => meal(date, which, "text-sm"))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

/**
 * The size of a dish's name on the week: the name size of the scale where there is room, the
 * text size on a phone, where beside the stepper a name at 19px broke into syllables
 * ("Cur-rysahne", 22 November 2026).
 */
const DISH_SIZE = "text-base sm:text-lg";

/**
 * A meal without a recipe ("Vesper", leftovers, a meal away) with the grey dot of no kind in
 * front, so that it lines up with the names of dishes.
 */
function SlotName({
  size = DISH_SIZE,
  className = "",
  children,
}: {
  /** The size of its words: smaller in a card of the weekend, larger for today. */
  size?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`flex items-start gap-2 ${size} leading-snug ${className}`}>
      <span aria-hidden className="dot dot-first kind-none" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * A recipe's title as a link to it, with the dot of its kind in front. Pictograms on their
 * pastel are for the recipe cards and the shopping notes: on the week they made every row a
 * row of tiles (22 November 2026).
 */
function KindTitle({
  recipe,
  id,
  week,
  day,
  size = DISH_SIZE,
  servings,
}: {
  recipe: RecipeSummary | undefined;
  id: string;
  /** The week of the plan the title stands on: the recipe's page leads back to it. */
  week: IsoDate;
  /** The day it stands on, where the way back lands when it cannot step back. */
  day?: IsoDate;
  /** The size of its words: smaller in a card of the weekend, larger for today. */
  size?: string;
  /**
   * The meal's servings and its extra portions: the recipe's page starts with as much as the
   * meal cooks.
   */
  servings?: { planned: number; extra?: number };
}) {
  const cooked =
    servings &&
    cookedServings(servings.planned, servings.extra, (recipe?.servings?.unit ?? null) === null);
  return (
    <span className={`flex items-start gap-2 leading-snug ${size}`}>
      <span
        aria-hidden
        className={`dot dot-first ${(recipe && recipeTone(recipe)?.className) || "kind-none"}`}
      />
      <Link
        href={`/rezepte/${id}${fromPlan(week, day, cooked)}`}
        prefetch
        transitionTypes={[FORWARD]}
        className="dish-name min-w-0 font-semibold decoration-line underline-offset-4 hover:underline"
      >
        {recipe?.title ?? "Rezept"}
      </Link>
    </span>
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
        Was zu keiner Mahlzeit gehört, etwa ein Kuchen für eine Einladung. Mit Tag wird es für
        diesen Tag eingekauft, ohne Tag beim ersten Einkauf der Woche.
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
                    prefetch
                    transitionTypes={[FORWARD]}
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
                <ServingsStepper
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
    // One quiet row of counts, each kind a small dot in its colour, and the goal beside it:
    // four pastel tiles were the loudest thing on the page (22 November 2026). The row is the
    // way to the goals: "Ziele ändern" below it took a row of its own on a phone.
    <Link href="/woche/ziele" aria-label="Ziele ändern" className="balance-link mt-4 block">
      <ul aria-label="Ausgewogenheit der Woche" className="balance-row">
        {lines.map((line) => (
          <li
            key={line.group}
            className={`kind-${line.group}`}
            data-over={progress(line)?.over || undefined}
          >
            <span className="dot" aria-hidden />
            <span className="font-bold tabular-nums">{line.count}</span>
            <span>{GROUP_NAME[line.group]}</span>
            <span className="text-xs text-muted">{targetText(line)}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

/**
 * How much a meal of a saved plan is cooked for, to read: a person's sign and the number
 * beside the dish, as on the stepper; a recipe's own unit ("1 Springform (Ø 26 cm)") goes
 * below it, where it does not squeeze the name.
 */
function ServingsSaid({ servings, unit }: { servings: number; unit: string | null }) {
  const amount = plannedText(servings, unit);
  if (unit !== null) return <p className="col-span-2 mt-0.5 text-sm text-muted">{amount}</p>;
  return (
    <span
      className="inline-flex items-center gap-1 text-sm leading-snug text-muted tabular-nums"
      title={amount}
    >
      <PersonIcon />
      <span aria-hidden>{servings}</span>
      <span className="sr-only">{amount}</span>
    </span>
  );
}

/**
 * How much a meal is cooked for while it is planned, on a phone: "4 Pers." beside the dish,
 * a recipe's own unit below it. The stepper is in the pen's sheet there, and on the line
 * from the tablet width on (decided on 25 November 2026).
 */
function ServingsQuiet({ servings, unit }: { servings: number; unit: string | null }) {
  const amount = plannedText(servings, unit);
  if (unit !== null) return <p className="text-sm text-muted tablet:hidden">{amount}</p>;
  return (
    <span className="pt-0.5 text-sm whitespace-nowrap text-muted tabular-nums tablet:hidden">
      <span aria-hidden>{servings} Pers.</span>
      <span className="sr-only">{amount}</span>
    </span>
  );
}

/** A meal's action shown as a sign: round, large enough for a finger. */
const ICON_ACTION =
  "-mx-1 flex size-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent";

interface CellProps {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  slot: PlanSlot | undefined;
  /** The answer to "Was könnten wir kochen?", when this meal was asked about. */
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
  /** The open meals after this one where leftovers can go. */
  later: { date: IsoDate; meal: Meal }[];
  /** How many persons the household cooks for. */
  servings: number;
  /** For leftovers: the meal they are from, "von Mo Mittag", where it is known. */
  leftoversOf: string | undefined;
  /** For a meal cooked for leftovers: the meals they are eaten at, where planned. */
  leftoversOn: { date: IsoDate; meal: Meal }[];
  /** "Mehr kochen" is open under this meal. */
  cookingMore: boolean;
  /** Every meal of the week, for "Auf einen anderen Tag". */
  moves: GridMeal[];
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
  later,
  servings,
  leftoversOf,
  leftoversOn,
  cookingMore,
  moves,
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
  // "Mehr kochen" for a meal cooked for persons that has no extra portions yet.
  const canCookMore =
    slot?.kind === "recipes" &&
    !(slot.extra ?? 0) &&
    slot.items.some((item) => !recipeOf.get(item.recipeId)?.servings?.unit);
  // From tablet width on lunch and dinner stand side by side under the day, and from a large
  // screen on beside it; coffee sits below lunch.
  const column =
    meal === "coffee"
      ? "sm:col-start-1 sm:row-start-3 lg:col-start-2 lg:row-start-2"
      : meal === "dinner"
        ? "sm:col-start-2 sm:row-start-2 lg:col-start-3 lg:row-start-1"
        : "sm:col-start-1 sm:row-start-2 lg:col-start-2 lg:row-start-1";

  // The kind of its first dish colours the meal's edge: the week reads at a glance.
  const first = slot?.kind === "recipes" ? recipeOf.get(slot.items[0]?.recipeId ?? "") : undefined;
  // Every planned meal has an edge: grey where its dish has no kind or it has no recipe.
  const edge = first ? (recipeTone(first)?.className ?? "kind-none") : slot ? "kind-none" : "";
  const cell = `meal-cell min-w-0 ${column} ${edge}`;

  // A saved plan is read, not planned: what there is, and a small pen for a change.
  if (locked) {
    return (
      <section aria-label={what} className={cell}>
        <p className="eyebrow flex items-center justify-between gap-2">
          {MEAL_NAME[meal]}
          <Link
            href={`/woche?w=${week}&stift=${date}.${meal}#tag-${date}`}
            scroll={false}
            className="-my-2 flex size-11 items-center justify-center rounded-full text-muted hover:text-accent"
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
                // How much it is cooked for stands beside the dish, as the stepper does while
                // planning: a line below it went unseen (23 November 2026).
                <li
                  key={item.recipeId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3"
                >
                  <KindTitle
                    recipe={recipe}
                    id={item.recipeId}
                    week={week}
                    day={date}
                    servings={{ planned: item.servings, extra: slot.extra }}
                  />
                  <ServingsSaid servings={item.servings} unit={recipe?.servings?.unit ?? null} />
                </li>
              );
            })}
            {(slot.foods?.length ?? 0) > 0 && (
              <li className="text-sm">
                <span className="text-muted">Dazu: </span>
                {slot.foods?.map(foodText).join(", ")}
              </li>
            )}
            {(slot.extra ?? 0) > 0 && (
              <li className="text-sm font-semibold text-accent">
                + {slot.extra === 1 ? "1 Extra-Portion" : `${slot.extra} Extra-Portionen`} für Reste
              </li>
            )}
          </ul>
        )}
        {slot && slot.kind !== "recipes" && (
          <SlotName className={`font-semibold ${slot.kind === "skipped" ? "text-muted" : ""}`}>
            {slotText(slot)}
            {leftoversOf && <span className="font-normal text-muted"> {leftoversOf}</span>}
          </SlotName>
        )}
        {slot?.kind === "free_text" && (slot.foods?.length ?? 0) > 0 && (
          <p className="text-sm text-muted">{slot.foods?.map(foodText).join(", ")}</p>
        )}
        {!slot && <p className="text-muted">Noch offen</p>}
      </section>
    );
  }

  // A saved meal keeps its pen while it is changed: only "Fertig" puts it down.
  const pen = withPen ? `${date}.${meal}` : null;
  // While planning, a planned meal is one line: its dish, how many it is for and one pen;
  // what the row of signs under it held is in the pen's sheet (decided on 25 November 2026).
  const calm = !!slot && !withPen && !placing;
  const body = (
    <>
      {slot?.kind === "recipes" && (
        <ul className={calm ? "space-y-1.5" : "mt-1 space-y-2"}>
          {slot.items.map((item) => {
            const recipe = recipeOf.get(item.recipeId);
            const unit = recipe?.servings?.unit ?? null;
            const stepper = (
              <ServingsStepper
                action={changeServings}
                fields={{ week, date, meal, recipe: item.recipeId, ...(pen && { stift: pen }) }}
                servings={item.servings}
                unit={unit}
                title={recipe?.title ?? "dem Rezept"}
              />
            );
            return (
              // The stepper next to the name; one with a unit of its own goes below it. While
              // planning on a phone the persons are a quiet word there, the stepper is in the
              // pen's sheet; from the tablet width on it stays on the line.
              <li
                key={item.recipeId}
                className={
                  unit
                    ? "space-y-1.5"
                    : `grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 ${calm ? "items-start tablet:items-center" : "items-center"}`
                }
              >
                <KindTitle
                  recipe={recipe}
                  id={item.recipeId}
                  week={week}
                  day={date}
                  servings={{ planned: item.servings, extra: slot.extra }}
                />
                {calm ? (
                  <>
                    <ServingsQuiet servings={item.servings} unit={unit} />
                    <div className="hidden tablet:block">{stepper}</div>
                  </>
                ) : (
                  stepper
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* What goes with the recipes and has none: words on the line while planning, the
          pen's sheet changes it; a tap away from being changed on a saved meal's pen. */}
      {calm && slot?.kind === "recipes" && (slot.foods?.length ?? 0) > 0 && (
        <p className="mt-1 text-sm">
          <span className="text-muted">Dazu: </span>
          {slot.foods?.map(foodText).join(", ")}
        </p>
      )}
      {calm && slot?.kind === "recipes" && (slot.extra ?? 0) > 0 && (
        <p className="mt-1 text-sm font-semibold text-accent">
          + {slot.extra === 1 ? "1 Extra-Portion" : `${slot.extra} Extra-Portionen`} für Reste
          {leftoversOn[0] && (
            <span className="font-normal text-muted"> am {mealPlaceText(leftoversOn[0])}</span>
          )}
        </p>
      )}
      {!calm && slot?.kind === "recipes" && (slot.foods?.length ?? 0) > 0 && (
        <Link
          href={`/woche/lebensmittel?w=${week}&d=${date}&m=${meal}`}
          className="mt-1.5 flex min-h-11 items-center text-sm"
          aria-label={`${what}: dazu ${slot.foods?.map(foodText).join(", ")}, ändern`}
        >
          <span>
            <span className="text-muted">Dazu: </span>
            {slot.foods?.map(foodText).join(", ")}
          </span>
        </Link>
      )}
      {!calm && slot?.kind === "recipes" && (slot.extra ?? 0) > 0 && (
        <ExtraPortions
          week={week}
          date={date}
          meal={meal}
          extra={slot.extra ?? 0}
          leftoversOn={leftoversOn[0] ?? null}
          what={what}
          pen={pen}
        />
      )}

      {slot && slot.kind !== "recipes" && (
        <SlotName
          className={`${calm ? "" : "mt-1"} font-semibold ${slot.kind === "skipped" ? "text-muted" : ""}`}
        >
          {slotText(slot)}
          {leftoversOf && <span className="font-normal text-muted"> {leftoversOf}</span>}
        </SlotName>
      )}
      {slot?.kind === "free_text" && (slot.foods?.length ?? 0) > 0 && (
        <p className="text-sm text-muted">{slot.foods?.map(foodText).join(", ")}</p>
      )}
      {/*
        A typed meal the cookbook has no recipe for: the page can be photographed right now,
        while the week is planned, or the recipe pasted or typed, and it takes the place of
        the text.
      */}
      {slot?.kind === "free_text" && !namedMeal(slot.label) && !placing && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-note px-3 py-1.5 text-sm">
          <span className="text-note-ink">Noch kein Rezept dazu</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Photo, pasted text or typed: chosen on the next page, the camera one tap on. */}
            <Link
              href={`/rezepte/hinzufuegen?${new URLSearchParams({ d: date, m: meal })}`}
              className="btn btn-small min-h-11 border-note-line bg-white/60"
              aria-label={`${what}: Rezept hinzufügen`}
            >
              Rezept hinzufügen
            </Link>
            <form action={needsNoRecipe}>
              {where}
              <SubmitButton
                className="min-h-11 font-semibold text-note-ink underline underline-offset-4"
                label={`${what}: braucht kein Rezept`}
              >
                Braucht keins
              </SubmitButton>
            </form>
          </span>
        </div>
      )}
    </>
  );
  // What the row of signs held, each a row of the pen's sheet. The persons are on the line
  // from the tablet width on.
  const penRows = slot && (
    <>
      {slot.kind === "recipes" && (
        <div className="pen-row-block tablet:hidden">
          <PersonIcon />
          <ul className="min-w-0 flex-1 space-y-2">
            {slot.items.map((item) => {
              const recipe = recipeOf.get(item.recipeId);
              return (
                <li key={item.recipeId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {slot.items.length > 1
                      ? (recipe?.title ?? "Rezept")
                      : recipe?.servings?.unit
                        ? "Menge"
                        : "Personen"}
                  </span>
                  <ServingsStepper
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
        </div>
      )}
      <Link href={choose("replace")} className="pen-row">
        <BookIcon />
        Anderes Gericht
      </Link>
      {slot.kind === "recipes" && (
        <Link href={choose("add")} className="pen-row">
          <PlusIcon />
          Etwas dazu
        </Link>
      )}
      {(slot.kind === "free_text" ||
        (slot.kind === "recipes" && (slot.foods?.length ?? 0) > 0)) && (
        <Link href={`/woche/lebensmittel?w=${week}&d=${date}&m=${meal}`} className="pen-row">
          <ListIcon />
          Lebensmittel
        </Link>
      )}
      {slot.kind === "recipes" && (slot.extra ?? 0) > 0 && (
        <div className="pen-row-block">
          <StackIcon />
          <ExtraPortions
            week={week}
            date={date}
            meal={meal}
            extra={slot.extra ?? 0}
            leftoversOn={leftoversOn[0] ?? null}
            what={what}
            pen={null}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
          />
        </div>
      )}
      {canCookMore && (
        <PenFold icon={<StackIcon />} label="Mehr kochen für Reste">
          <CookMore
            week={week}
            date={date}
            meal={meal}
            servings={servings}
            later={later}
            pen={null}
          />
        </PenFold>
      )}
      {meal !== "coffee" && (
        <PenFold icon={<MoveIcon />} label="Auf einen anderen Tag">
          <MoveMeal week={week} date={date} meal={meal} days={weekDates(week)} meals={moves} />
        </PenFold>
      )}
      <form action={clearSlot} data-does="clear">
        {where}
        <SubmitButton className="pen-row text-danger">
          <TrashIcon />
          Entfernen
        </SubmitButton>
      </form>
    </>
  );
  return (
    <MealSection
      label={what}
      className={`${cell} ${calm ? "max-sm:grid max-sm:grid-cols-[3.5rem_minmax(0,1fr)]" : ""}`}
      week={week}
      date={date}
      meal={meal}
      said={`${weekdayShort(date)} ${MEAL_NAME[meal]}`}
      was={slot ? contentOf(slot) : null}
      leftovers={leftoversOn.map((on) => `${on.date}.${on.meal}`)}
    >
      {/* On a phone the kind stands beside the dish, so that a meal is one line; where lunch
          and dinner stand side by side, above it, as on an open meal. */}
      <p
        className={`eyebrow flex items-center justify-between gap-2 ${calm ? "max-sm:pt-[0.3rem]" : ""}`}
      >
        {MEAL_NAME[meal]}
        {withPen && (
          // As tall as a finger, as the pen it stands for: at 36 by 17 it was the smallest
          // way out of the meal (audit, 24 November 2026).
          <Link
            href={`/woche?w=${week}#tag-${date}`}
            scroll={false}
            className="link link-quiet -my-2 inline-flex min-h-11 items-center px-2"
          >
            Fertig
          </Link>
        )}
      </p>

      {calm && slot ? (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">{body}</div>
          <MealPen slot={slot.id} what={what}>
            {penRows}
          </MealPen>
        </div>
      ) : (
        body
      )}

      {/*
       * A suggestion, asked for or offered unasked: a line with a dashed rule under it, so
       * that it does not read as planned; a box with a dashed edge inside the sheet was a box
       * in a box (22 November 2026). The rule says what it is, a screen reader hears it as
       * "Vorschlag". Nothing is planned until "Gute Idee!"; from its tap on it reads as
       * planned (`.suggestion`, `data-does="plan"`).
       */}
      {!slot && shown && !placing && (
        <div
          role="group"
          aria-label="Vorschlag"
          className={`suggestion ${recipeTone(shown.recipe)?.className ?? ""}`}
        >
          <div className="suggestion-title">
            <KindTitle recipe={shown.recipe} id={shown.recipe.id} week={week} day={date} />
          </div>
          {shown.reasons.length > 0 && (
            <p className="mt-1 text-sm text-muted">{whyText(shown.reasons)}</p>
          )}
          {/* One row, also on a phone: "Lieber was anderes" took a second one. */}
          <div className="mt-2 flex items-center gap-2">
            <form action={planRecipe} data-does="plan">
              {where}
              <input type="hidden" name="recipe" value={shown.recipe.id} />
              <input type="hidden" name="mode" value="replace" />
              {/* Green words on the green's pastel: as a solid green button it stood up to five
                  times on an empty week, and "Speichern" was no longer the one (D9, audit, 24
                  November 2026). Still apart from the grey "Was anderes". */}
              <SubmitButton
                className="btn btn-small bg-accent-soft text-accent"
                label={`${what}: ${shown.recipe.title} einplanen`}
              >
                Gute Idee!
              </SubmitButton>
            </form>
            {/* An idea offered unasked is the first answer; the next one is the second. */}
            <Link href={ask(proposal ? draw + 1 : 1)} scroll={false} className="btn btn-small">
              Was anderes
            </Link>
          </div>
        </div>
      )}

      {/* While a recipe is placed, the row names it: it shows where the recipe lands as soon
          as its button is tapped (`data-landing`, `data-does="place"` or "add"). */}
      {!calm && (
        <div
          className={`meal-actions mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 ${placing ? (recipeTone(placing)?.className ?? "kind-none") : ""}`}
          data-landing={placing?.title}
        >
          {placing ? (
            <form action={planRecipe} data-does={slot?.kind === "recipes" ? "add" : "place"}>
              {where}
              <input type="hidden" name="recipe" value={placing.id} />
              <input
                type="hidden"
                name="mode"
                value={slot?.kind === "recipes" ? "add" : "replace"}
              />
              <SubmitButton className="btn btn-primary btn-small" label={`${what}: hier einplanen`}>
                {slot?.kind === "recipes" ? "Dazu einplanen" : slot ? "Ersetzen" : "Hier einplanen"}
              </SubmitButton>
            </form>
          ) : slot ? (
            <>
              {/* Signs instead of words, so that the row stays one line: what each does is in
                its label, and in its title for a mouse. */}
              <Link
                href={choose("replace")}
                className={ICON_ACTION}
                aria-label={`${what} ändern`}
                title="Ändern"
              >
                <PenIcon />
              </Link>
              {slot.kind === "recipes" && (
                <Link
                  href={choose("add")}
                  className={ICON_ACTION}
                  aria-label={`${what}: etwas dazu`}
                  title="Etwas dazu"
                >
                  <PlusIcon />
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
              <form action={clearSlot} data-does="clear">
                {where}
                <SubmitButton
                  className={`${ICON_ACTION} hover:text-danger`}
                  label={`${what} leeren`}
                >
                  <TrashIcon />
                </SubmitButton>
              </form>
              {/* Cooked for more than the household: leftovers for a later meal. Once cooked
                more, the extra portions stand under the recipes instead. A cake for one tin
                is not cooked "more". */}
              {canCookMore && (
                <Link
                  href={`/woche?w=${week}${cookingMore ? "" : `&mehr=${date}.${meal}`}${pen ? `&stift=${pen}` : ""}#tag-${date}`}
                  scroll={false}
                  className={`link link-quiet inline-flex min-h-11 items-center rounded-full px-2 text-sm whitespace-nowrap ${cookingMore ? "bg-accent-soft text-accent" : "text-muted"}`}
                  aria-label={`${what}: mehr kochen`}
                  aria-expanded={cookingMore}
                >
                  Mehr kochen
                </Link>
              )}
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
                  aria-label={`${what}: Was könnten wir kochen?`}
                >
                  Was könnten wir kochen?
                </Link>
              )}
            </>
          )}
        </div>
      )}
      {canCookMore && cookingMore && !calm && !placing && (
        <CookMore
          week={week}
          date={date}
          meal={meal}
          servings={servings}
          later={later}
          close={`/woche?w=${week}${pen ? `&stift=${pen}` : ""}#tag-${date}`}
          pen={pen}
        />
      )}
    </MealSection>
  );
}
