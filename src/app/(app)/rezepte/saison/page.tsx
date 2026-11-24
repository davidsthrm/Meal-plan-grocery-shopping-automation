import type { Metadata } from "next";
import { BACK, FORWARD } from "@/lib/transitions";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { ArrowIcon } from "@/components/icons";
import { ListMemory } from "@/components/list-return";
import { RecipeCard } from "@/components/recipe-card";
import { NO_FILTER } from "@/domain/library/filter";
import {
  availability,
  MONTH_NAME,
  MONTHS,
  monthInSeason,
  monthOf,
  monthsText,
  nextMonth,
  type FoodKind,
  type Month,
  type SeasonalFood,
} from "@/domain/season/calendar";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadLibrary } from "@/server/library";
import { filterHref } from "@/components/recipe-filters";
import { CALENDAR, loadSeasonalFoods, withSeason } from "@/server/season";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Saison" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The colour of a kind's months: green for what grows in a bed, warm for fruit and mushrooms. */
const KIND_TONE: Record<FoodKind, string> = {
  gemuese: "kind-vegetarian",
  salat: "kind-vegetarian",
  kraeuter: "kind-vegetarian",
  obst: "kind-sweet",
  pilze: "kind-poultry",
};
/** The first letters of the months, for the small calendar of each food. */
const LETTER: Record<Month, string> = {
  1: "J",
  2: "F",
  3: "M",
  4: "A",
  5: "M",
  6: "J",
  7: "J",
  8: "A",
  9: "S",
  10: "O",
  11: "N",
  12: "D",
};
/** How many recipes with a food are shown, and how many of those that fit the month. */
const WITH_FOOD = 24;
const FITTING = 12;

/**
 * "Was hat gerade Saison?": what is harvested in Germany this month, what arrives, what
 * leaves and what comes from storage, each with the recipes of the library that use it. A
 * month before or after is a tap away, to plan ahead. Each part is one ruled list; a food's
 * recipes open under its row, where it was tapped. Until November 2026 every food was a card
 * with a square of its kind (a carrot for a pumpkin), its months in words were cut off, the
 * page was about 4000px long on a phone, and a tap jumped to its top for the recipes.
 */
export default async function SeasonPage(props: PageProps<"/rezepte/saison">) {
  const params = await props.searchParams;
  const now = monthOf(today());
  const asked = Number(one(params.monat));
  const month = (MONTHS as readonly number[]).includes(asked) ? (asked as Month) : now;
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [library, foods] = await Promise.all([
    loadLibrary(db, household),
    loadSeasonalFoods(db, household),
  ]);
  const categoryName = new Map(library.categories.map((category) => [category.key, category.name]));
  const nameOf = (key: string | null) => (key ? (categoryName.get(key) ?? null) : null);

  // Per food, the recipes made with it.
  const recipesWith = new Map<string, typeof library.recipes>();
  for (const recipe of library.recipes) {
    for (const food of foods.get(recipe.id) ?? []) {
      recipesWith.set(food.key, [...(recipesWith.get(food.key) ?? []), recipe]);
    }
  }
  const season = monthInSeason(CALENDAR, month);
  const chosen = CALENDAR.find((food) => food.key === one(params.zutat)) ?? null;
  const withChosen = chosen
    ? (recipesWith.get(chosen.key) ?? []).sort(
        (a, b) =>
          Number(b.isFavorite) - Number(a.isFavorite) || a.title.localeCompare(b.title, "de"),
      )
    : [];
  const fitting = withSeason(library.recipes, foods, month)
    .filter((recipe) => recipe.season?.fits)
    .sort(
      (a, b) =>
        (b.season?.points ?? 0) - (a.season?.points ?? 0) || a.title.localeCompare(b.title, "de"),
    );
  const link = (to: Month, food?: string) =>
    `/rezepte/saison?${new URLSearchParams({
      ...(to === now ? {} : { monat: String(to) }),
      ...(food ? { zutat: food } : {}),
    })}`;

  const sections: { title: string; foods: SeasonalFood[] }[] = [
    { title: `Neu im ${MONTH_NAME[month]}`, foods: season.arriving },
    { title: "Gerade reif", foods: season.ripe },
    { title: "Letzte Wochen", foods: season.leaving },
    { title: "Vom Lager", foods: season.stored },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <ListMemory />
      <BackLink href="/rezepte">Entdecken</BackLink>
      <p className="eyebrow mt-1">Saisonkalender · Anbau in Deutschland</p>
      <h1 className="title mt-1">
        {month === now ? "Was hat gerade Saison?" : `Saison im ${MONTH_NAME[month]}`}
      </h1>

      <nav aria-label="Monat" className="mt-4 flex flex-wrap items-center gap-3">
        <span className="capsule">
          <Link
            href={link(nextMonth(month, -1))}
            transitionTypes={[BACK]}
            aria-label={MONTH_NAME[nextMonth(month, -1)]}
          >
            <ArrowIcon back />
          </Link>
          <Link href={link(month)} aria-current="page">
            {MONTH_NAME[month]}
          </Link>
          <Link
            href={link(nextMonth(month))}
            transitionTypes={[FORWARD]}
            aria-label={MONTH_NAME[nextMonth(month)]}
          >
            <ArrowIcon />
          </Link>
        </span>
        {month !== now && (
          <Link href={link(now)} className="link inline-flex min-h-11 items-center">
            Zurück zum {MONTH_NAME[now]}
          </Link>
        )}
      </nav>

      {sections
        .filter((section) => section.foods.length > 0)
        .map((section) => (
          <section key={section.title} className="mt-8" aria-label={section.title}>
            <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
            <ul className="season-list mt-2">
              {/* What the library cooks with first: those are the ones to tap. */}
              {[...section.foods]
                .sort(
                  (a, b) =>
                    (recipesWith.get(b.key)?.length ?? 0) - (recipesWith.get(a.key)?.length ?? 0),
                )
                .flatMap((food) => {
                  const count = recipesWith.get(food.key)?.length ?? 0;
                  const on = chosen?.key === food.key;
                  const row = (
                    <li key={food.key} className={KIND_TONE[food.kind]}>
                      <Link
                        href={link(month, on ? undefined : food.key)}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className="season-row"
                      >
                        <span className="season-name">
                          {food.name}
                          {count > 0 && (
                            <span className="font-normal text-muted tabular-nums">
                              {" "}
                              · {count === 1 ? "1 Rezept" : `${count} Rezepte`}
                            </span>
                          )}
                        </span>
                        <MonthBar food={food} month={month} />
                        <span className="season-words">{monthsInWords(food)}</span>
                      </Link>
                    </li>
                  );
                  if (!on) return [row];
                  return [
                    row,
                    <li key={`${food.key}-rezepte`} className="season-open">
                      <section aria-label={`Rezepte mit ${food.name}`}>
                        {withChosen.length === 0 ? (
                          <p className="text-muted">Noch kein Rezept im Kochbuch.</p>
                        ) : (
                          <div className="shelf">
                            {withChosen.slice(0, WITH_FOOD).map((recipe) => (
                              <RecipeCard
                                key={recipe.id}
                                recipe={recipe}
                                category={nameOf(recipe.category)}
                                className="w-60"
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    </li>,
                  ];
                })}
            </ul>
          </section>
        ))}

      {fitting.length > 0 && (
        <section className="mt-10" aria-label="Passt zur Saison">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">
              Passt in den {MONTH_NAME[month]}{" "}
              <span className="text-base font-normal text-muted tabular-nums">
                {fitting.length}
              </span>
            </h2>
            {month === now && (
              <Link
                href={filterHref("/rezepte", { ...NO_FILTER, season: true })}
                className="link inline-flex min-h-11 shrink-0 items-center text-sm"
              >
                Alle anzeigen
              </Link>
            )}
          </div>
          <div className="shelf mt-1">
            {fitting.slice(0, FITTING).map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                category={nameOf(recipe.category)}
                note={
                  recipe.season?.foods.length
                    ? `Mit ${recipe.season.foods.slice(0, 3).join(", ")}`
                    : undefined
                }
                className="w-60"
              />
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-muted">
        Was hier nicht wächst, wie Zitronen oder Bananen, steht nicht im Kalender.
      </p>
    </div>
  );
}

/** A food's year at a glance: twelve months, filled where it is harvested, paler where stored. */
function MonthBar({ food, month }: { food: SeasonalFood; month: Month }) {
  return (
    <span className="season-bar" aria-hidden>
      {MONTHS.map((entry) => (
        <span
          key={entry}
          className="season-cell"
          data-state={availability(food, entry) ?? "none"}
          data-now={entry === month ? "true" : undefined}
        >
          {LETTER[entry]}
        </span>
      ))}
    </span>
  );
}

/** "Oktober bis Dezember · Lager Januar bis März": as long as it is, never cut off. */
function monthsInWords(food: SeasonalFood): string {
  const fresh = monthsText(food.fresh);
  return food.stored ? `${fresh} · Lager ${monthsText(food.stored)}` : fresh;
}
