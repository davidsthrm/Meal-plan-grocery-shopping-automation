import type { Metadata } from "next";
import { BACK, FORWARD } from "@/lib/transitions";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { ListMemory } from "@/components/list-return";
import { PictogramIcon } from "@/components/pictogram";
import { RecipeCard } from "@/components/recipe-card";
import { NO_FILTER } from "@/domain/library/filter";
import type { Pictogram } from "@/domain/library/pictogram";
import {
  availability,
  FOOD_KIND_NAME,
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
import { loadLibrary } from "@/server/library";
import { filterHref } from "@/components/recipe-filters";
import { CALENDAR, loadSeasonalFoods, withSeason } from "@/server/season";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Saison" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The picture of a food: its own where there is one, else its kind's. */
const KIND_PICTURE: Record<FoodKind, Pictogram> = {
  gemuese: "gemuese",
  salat: "salat",
  obst: "apfel",
  kraeuter: "spross",
  pilze: "pilz",
};
const FOOD_PICTURE: Record<string, Pictogram> = { tomaten: "tomate", kartoffeln: "kartoffel" };
/** The pastel of a kind: green for what grows in a bed, warm for fruit and mushrooms. */
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
 * month before or after is a tap away, to plan ahead.
 */
export default async function SeasonPage(props: PageProps<"/rezepte/saison">) {
  const params = await props.searchParams;
  const now = monthOf(today());
  const asked = Number(one(params.monat));
  const month = (MONTHS as readonly number[]).includes(asked) ? (asked as Month) : now;
  const db = await createSessionClient();
  const [library, foods] = await Promise.all([loadLibrary(db), loadSeasonalFoods(db)]);
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

  const sections: { title: string; foods: SeasonalFood[]; note: string }[] = [
    { title: `Neu im ${MONTH_NAME[month]}`, foods: season.arriving, note: "Die Ernte beginnt." },
    { title: "Gerade reif", foods: season.ripe, note: "Frisch vom Feld oder vom Baum." },
    {
      title: "Letzte Wochen",
      foods: season.leaving,
      note: `Nach dem ${MONTH_NAME[month]} ist die Ernte vorbei.`,
    },
    { title: "Vom Lager", foods: season.stored, note: "Aus der Ernte davor, gut gelagert." },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <ListMemory />
      <Link href="/rezepte" className="link inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowIcon back />
        Entdecken
      </Link>
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

      {chosen && (
        <section id="rezepte" className="mt-7" aria-label={`Rezepte mit ${chosen.name}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">
              Mit {chosen.name}{" "}
              <span className="text-base font-normal text-muted tabular-nums">
                {withChosen.length}
              </span>
            </h2>
            <Link
              href={link(month)}
              scroll={false}
              className="link inline-flex min-h-11 items-center text-sm"
            >
              Schließen
            </Link>
          </div>
          {withChosen.length === 0 ? (
            <p className="mt-2 text-muted">Noch kein Rezept im Kochbuch.</p>
          ) : (
            <div className="shelf mt-1">
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
      )}

      {sections
        .filter((section) => section.foods.length > 0)
        .map((section) => (
          <section key={section.title} className="mt-8" aria-label={section.title}>
            <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
            <p className="text-sm text-muted">{section.note}</p>
            <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {/* What the library cooks with first: those are the ones to tap. */}
              {[...section.foods]
                .sort(
                  (a, b) =>
                    (recipesWith.get(b.key)?.length ?? 0) - (recipesWith.get(a.key)?.length ?? 0),
                )
                .map((food) => {
                  const count = recipesWith.get(food.key)?.length ?? 0;
                  const on = chosen?.key === food.key;
                  return (
                    <li key={food.key}>
                      <Link
                        href={`${link(month, on ? undefined : food.key)}${on ? "" : "#rezepte"}`}
                        scroll={!on}
                        aria-current={on ? "true" : undefined}
                        className={`card lift flex h-full items-center gap-3 px-3 py-2.5 ${KIND_TONE[food.kind]} ${on ? "ring-2 ring-accent" : ""}`}
                      >
                        <span className="badge h-11 w-11">
                          <PictogramIcon
                            name={FOOD_PICTURE[food.key] ?? KIND_PICTURE[food.kind]}
                            className="h-[68%] w-[68%]"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-semibold">{food.name}</span>
                            <span className="shrink-0 text-sm text-muted tabular-nums">
                              {count === 0 ? "–" : count === 1 ? "1 Rezept" : `${count} Rezepte`}
                            </span>
                          </span>
                          <MonthBar food={food} month={month} />
                        </span>
                      </Link>
                    </li>
                  );
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
        {FOOD_KIND_NAME.gemuese}, {FOOD_KIND_NAME.salat}, {FOOD_KIND_NAME.obst},{" "}
        {FOOD_KIND_NAME.kraeuter} und {FOOD_KIND_NAME.pilze} aus Freiland und Lager in Deutschland.
        Was hier nicht wächst, wie Zitronen oder Bananen, steht nicht im Kalender.
      </p>
    </div>
  );
}

/** A food's year at a glance: twelve months, filled where it is harvested, paler where stored. */
function MonthBar({ food, month }: { food: SeasonalFood; month: Month }) {
  const fresh = monthsText(food.fresh);
  const stored = food.stored ? monthsText(food.stored) : "";
  return (
    <span className="mt-1 block">
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
      <span className="mt-0.5 block truncate text-xs text-muted">
        {fresh}
        {stored && ` · Lager ${stored}`}
      </span>
    </span>
  );
}
