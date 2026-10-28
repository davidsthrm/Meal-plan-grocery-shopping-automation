import Link from "next/link";
import { dayAndMonth, daysBetween, type IsoDate } from "@/domain/dates";
import type { RecipeSummary } from "@/domain/library/summary";
import { EFFORT_NAME } from "@/domain/library/tags";
import { BALANCE_GROUPS } from "@/domain/recommend/balance";
import type { DiscoveryStats } from "@/domain/stats/discovery";
import type { EffortCounts, MealKind, MealStats, RankedRecipe } from "@/domain/stats/meals";
import type { Bucket, Period } from "@/domain/stats/period";
import { StarIcon } from "@/components/icons";
import { PictogramIcon } from "@/components/pictogram";
import { RecipeBadge } from "@/components/recipe-card";
import {
  BarList,
  Columns,
  Figure,
  NotYet,
  Ring,
  ShareBar,
  StatCard,
  num,
  percent,
  type Part,
} from "@/components/stats-charts";
import { FROM_STATISTICS } from "@/lib/origin";
import { GROUP_NAME, recipeTone, targetText } from "@/lib/plan-text";

export const KIND_NAME: Record<MealKind, string> = {
  ...GROUP_NAME,
  sweet: "Kuchen & Süßes",
  other: "Sonstiges",
};

const KIND_TONE: Record<MealKind, string> = {
  vegetarian: "kind-vegetarian",
  fish: "kind-fish",
  poultry: "kind-poultry",
  red_meat: "kind-red_meat",
  sweet: "kind-sweet",
  other: "kind-other",
};

const MEAL_KINDS: readonly MealKind[] = [...BALANCE_GROUPS, "sweet", "other"];

function kindParts(counts: Record<MealKind, number>): Part[] {
  return MEAL_KINDS.map((kind) => ({
    key: kind,
    label: KIND_NAME[kind],
    value: counts[kind],
    tone: KIND_TONE[kind],
  }));
}

const times = (count: number) => `${count}×`;
const weeksAgo = (date: IsoDate, today: IsoDate) => {
  const weeks = Math.floor(daysBetween(date, today) / 7);
  return weeks === 1 ? "vor einer Woche" : `vor ${weeks} Wochen`;
};

export function MealsView({
  stats,
  discovery,
  period,
  today,
  recipes,
  periodHref,
}: {
  stats: MealStats;
  /** What the family tried that was new to it, and its badges. */
  discovery: DiscoveryStats;
  period: Period;
  today: IsoDate;
  recipes: ReadonlyMap<string, RecipeSummary>;
  /** Where a bar of the trend leads: the statistics of its week or month. */
  periodHref: (opens: Bucket["opens"]) => string;
}) {
  const recipeRow = (entry: RecipeSummary | undefined, ranked: RankedRecipe, meta: string) => ({
    key: ranked.id,
    label: ranked.title,
    value: ranked.count,
    valueText: times(ranked.count),
    meta,
    leading: entry ? <RecipeBadge recipe={entry} /> : undefined,
    tone: entry ? recipeTone(entry)?.className : undefined,
    href: `/rezepte/${ranked.id}${FROM_STATISTICS}`,
  });
  const variety = stats.variety.enough ? stats.variety.value : null;
  const without = stats.without.enough ? stats.without.value : null;

  return (
    <div className="space-y-4">
      <div className="stat-figures">
        <Figure
          value={String(stats.cooked)}
          label={stats.cooked === 1 ? "Mahlzeit gekocht" : "Mahlzeiten gekocht"}
          detail={`${stats.entered} von ${stats.mealsPossible} Mittag- und Abendessen eingetragen`}
        />
        <Figure
          value={variety ? String(variety.distinct) : "–"}
          label="Verschiedene Gerichte"
          detail={variety ? `in ${variety.meals} Mahlzeiten` : "ab 4 Mahlzeiten"}
          tone="kind-fish"
        />
        <Figure
          value={String(stats.meatFree.days)}
          label={stats.meatFree.days === 1 ? "Tag ohne Fleisch" : "Tage ohne Fleisch"}
          detail={
            stats.meatFree.ofDays > 0
              ? `von ${stats.meatFree.ofDays} · längste Serie ${stats.meatFree.longestRun}`
              : null
          }
          tone="kind-vegetarian"
        />
        <Figure
          value={without ? String(without.total) : "–"}
          label="Ohne Rezept"
          detail={
            without && without.rows[0]
              ? `am häufigsten ${without.rows[0].label}`
              : "Vesper, Reste, auswärts"
          }
          tone="kind-poultry"
        />
      </div>
      {stats.ahead > 0 && (
        <p className="text-sm text-muted">
          Dazu {stats.ahead === 1 ? "ist 1 Mahlzeit" : `sind ${stats.ahead} Mahlzeiten`} schon für
          später in diesem Zeitraum geplant.
        </p>
      )}

      <StatCard title="Ziele der Woche" counts="Jede Woche mit Plan, gemessen an euren Zielen">
        {stats.goals.enough ? (
          <>
            <ShareBar parts={kindParts(stats.kinds)} label="Gekochte Mahlzeiten nach Art" />
            <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stats.goals.value.summary.map((line) => {
                const weeks = stats.goals.enough ? stats.goals.value.weeks : [];
                const hasGoal = line.min !== null || line.max !== null;
                return (
                  <li key={line.group} className={`stat-figure ${KIND_TONE[line.group]}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{GROUP_NAME[line.group]}</span>
                      <span className="text-sm opacity-80">
                        {hasGoal ? `Ziel ${targetText({ ...line, count: 0 })}` : "Kein Ziel"}
                      </span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                      <span>
                        <span className="flex items-baseline gap-1.5">
                          <span className="stat-number">{num(line.average)}</span>
                          <span className="text-sm">pro Woche</span>
                        </span>
                        {hasGoal && (
                          <span className="mt-1 block text-sm">
                            {line.weeks === 0
                              ? "Die Woche läuft noch"
                              : `${line.met} von ${line.weeks} ${line.weeks === 1 ? "Woche" : "Wochen"} im Ziel`}
                          </span>
                        )}
                      </span>
                      {period.kind === "year" ? (
                        <span className="goal-strip" aria-hidden>
                          {weeks.map((week) => (
                            <span
                              key={week.weekStart}
                              data-ok={
                                hasGoal && week.lines.find((each) => each.group === line.group)!.ok
                              }
                            />
                          ))}
                        </span>
                      ) : (
                        <span className="-mr-2 -mb-2 flex flex-wrap justify-end">
                          {weeks.map((week) => {
                            const entry = week.lines.find((each) => each.group === line.group)!;
                            return (
                              <Link
                                key={week.weekStart}
                                href={`/woche?w=${week.weekStart}`}
                                className="goal-dot"
                                data-ok={hasGoal && entry.ok}
                                data-running={week.running}
                                aria-label={`Woche ab ${dayAndMonth(week.weekStart)}: ${entry.count} ${GROUP_NAME[line.group]}${
                                  hasGoal ? (entry.ok ? ", im Ziel" : ", nicht im Ziel") : ""
                                }${week.running ? ", läuft noch" : ""}`}
                              >
                                <span />
                              </Link>
                            );
                          })}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-sm text-muted">
              {period.kind === "year"
                ? "Ein Strich je Woche: voll im Ziel, blass daneben."
                : "Ein Punkt je Woche: voll im Ziel, leer daneben, gestrichelt läuft noch. Ein Tipp öffnet die Woche."}
            </p>
          </>
        ) : (
          <NotYet>In diesem Zeitraum gibt es noch keine Woche mit Plan.</NotYet>
        )}
      </StatCard>

      <StatCard
        title="Verlauf"
        counts={
          period.kind === "year"
            ? "Mahlzeiten mit Rezept je Monat, nach Art"
            : period.kind === "month"
              ? "Mahlzeiten mit Rezept je Woche, nach Art"
              : "Die letzten acht Wochen, nach Art"
        }
      >
        {stats.trend.enough ? (
          <>
            <Columns
              unit={["Mahlzeit", "Mahlzeiten"]}
              columns={stats.trend.value.map((bar) => ({
                key: bar.key,
                label: bar.label,
                href: periodHref(bar.opens),
                current: period.kind === "week" && bar.key === period.key,
                parts: kindParts(bar.counts),
              }))}
            />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden>
              {MEAL_KINDS.filter(
                (kind) =>
                  stats.trend.enough && stats.trend.value.some((bar) => bar.counts[kind] > 0),
              ).map((kind) => (
                <li key={kind} className={`inline-flex items-center gap-1.5 ${KIND_TONE[kind]}`}>
                  <span className="dot chart-dot" />
                  {KIND_NAME[kind]}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <NotYet>
            Der Verlauf braucht Mahlzeiten aus mindestens {stats.trend.need}{" "}
            {period.kind === "year" ? "Monaten" : "Wochen"}, bisher{" "}
            {stats.trend.have === 1
              ? period.kind === "year"
                ? "einem"
                : "einer"
              : stats.trend.have}
            .
          </NotYet>
        )}
      </StatCard>

      {/* As wide as the large cards: three figures and the badges need the room. */}
      <DiscoveryCard discovery={discovery} />

      <div className="stat-columns">
        <StatCard title="Am häufigsten gekocht">
          {stats.top.enough ? (
            <BarList
              rows={stats.top.value.map((entry) =>
                recipeRow(recipes.get(entry.id), entry, `zuletzt am ${dayAndMonth(entry.last)}`),
              )}
            />
          ) : (
            <NotYet>Noch hat sich kein Gericht wiederholt.</NotYet>
          )}
        </StatCard>

        <StatCard
          title="Zum ersten Mal gekocht"
          counts="Gerichte, die vorher nie auf dem Plan standen"
        >
          {!stats.newTried.enough ? (
            <NotYet>
              Neu heißt neu gegenüber dem, was vorher gekocht wurde. Dafür braucht es{" "}
              {stats.newTried.need} Wochen Plan vor diesem Zeitraum, bisher {stats.newTried.have}.
            </NotYet>
          ) : stats.newTried.value.length === 0 ? (
            <NotYet>In diesem Zeitraum war alles schon einmal dran.</NotYet>
          ) : (
            <BarList
              rows={stats.newTried.value.map((entry) =>
                recipeRow(recipes.get(entry.id), entry, `zuerst am ${dayAndMonth(entry.last)}`),
              )}
            />
          )}
        </StatCard>

        <StatCard
          title="Mal wieder kochen?"
          counts="Seit über acht Wochen nicht auf dem Plan, Favoriten zuerst"
        >
          {!stats.again.enough ? (
            <NotYet>
              Erst wenn der Plan acht Wochen zurückreicht, bisher{" "}
              {Math.floor(stats.again.have / 7) === 1
                ? "eine Woche"
                : `${Math.floor(stats.again.have / 7)} Wochen`}
              .
            </NotYet>
          ) : stats.again.value.length === 0 ? (
            <NotYet>Alles, was ihr schon gekocht habt, war in den letzten acht Wochen dran.</NotYet>
          ) : (
            <BarList
              rows={stats.again.value.map((entry) => ({
                ...recipeRow(
                  recipes.get(entry.id),
                  entry,
                  `zuletzt ${weeksAgo(entry.last, today)}${recipes.get(entry.id)?.isFavorite ? " · Favorit" : ""}`,
                ),
                valueText: `${entry.count}× gekocht`,
              }))}
            />
          )}
        </StatCard>

        <StatCard
          title="Ohne Rezept"
          counts={
            without ? `${without.total} von ${stats.entered} Mittag- und Abendessen` : undefined
          }
        >
          {!stats.without.enough ? (
            <NotYet>
              Ab {stats.without.need} eingetragenen Mahlzeiten, bisher {stats.entered}.
            </NotYet>
          ) : stats.without.value.rows.length === 0 ? (
            <NotYet>Jede Mahlzeit hatte ein Rezept.</NotYet>
          ) : (
            <BarList
              rows={stats.without.value.rows.map((row) => ({
                key: `${row.kind}-${row.label}`,
                label: row.label,
                value: row.count,
                valueText: `${row.count}× · ${percent(row.count, stats.entered)}`,
                tone: row.kind === "leftovers" ? "kind-poultry" : "kind-other",
                href: `/woche?w=${row.lastWeek}`,
                ariaLabel: `${row.label}: ${row.count}-mal, zuletzt in der Woche ab ${dayAndMonth(row.lastWeek)}`,
              }))}
            />
          )}
        </StatCard>

        <StatCard title="Aus diesen Kochbüchern" counts="Rezepte auf dem Plan, je Buch oder Heft">
          {stats.books.enough ? (
            <BarList
              rows={stats.books.value.map((row) => ({
                key: row.book ?? "-",
                label: row.book ?? "Ohne Kochbuch",
                value: row.meals,
                valueText: times(row.meals),
                leading: (
                  <span className="badge kind-place size-10">
                    <PictogramIcon name="buch" className="h-[64%] w-[64%]" />
                  </span>
                ),
                meta:
                  row.book === null
                    ? `${row.recipes} ${row.recipes === 1 ? "Rezept" : "Rezepte"}`
                    : `${row.everCooked} von ${row.inLibrary} schon einmal gekocht · ${percent(row.everCooked, row.inLibrary)}`,
                href: row.book ? `/rezepte?buch=${encodeURIComponent(row.book)}` : undefined,
              }))}
            />
          ) : (
            <NotYet>Noch nichts mit Rezept gekocht.</NotYet>
          )}
        </StatCard>

        <StatCard title="Hauptzutaten" counts="Mahlzeiten je Hauptzutat">
          {stats.mainIngredients.enough ? (
            <BarList
              rows={stats.mainIngredients.value.map((row) => ({
                key: row.ref,
                label: row.name,
                value: row.count,
                valueText: times(row.count),
                href: `/rezepte?tag=${encodeURIComponent(row.ref)}`,
              }))}
            />
          ) : (
            <NotYet>
              Ab {stats.mainIngredients.need} Mahlzeiten mit einer Hauptzutat, bisher{" "}
              {stats.mainIngredients.have}.
            </NotYet>
          )}
        </StatCard>

        <StatCard title="Wie viel Arbeit" counts="Aufwand der Mittag- und Abendessen">
          {stats.effort.enough ? (
            <div className="space-y-5">
              <EffortBar title="Montag bis Freitag" counts={stats.effort.value.workday} />
              <EffortBar title="Wochenende" counts={stats.effort.value.weekend} />
            </div>
          ) : (
            <NotYet>
              Ab {stats.effort.need} gekochten Mahlzeiten, bisher {stats.effort.have}.
            </NotYet>
          )}
        </StatCard>

        <StatCard title="Mit der Saison" counts="Mahlzeiten, die zur Saison ihres Monats passten">
          {stats.season.enough ? (
            <div className="flex flex-wrap items-center gap-5">
              <Ring
                part={stats.season.value.fitting}
                whole={stats.season.value.meals}
                label="Passend zur Saison"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {stats.season.value.fitting} von {stats.season.value.meals} Mahlzeiten
                </p>
                {stats.season.value.foods.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {stats.season.value.foods.map((food) => (
                      <li key={food.name} className="kind-vegetarian">
                        <span className="tag">
                          {food.name} {times(food.count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/rezepte/saison"
                  className="link mt-2 inline-flex min-h-11 items-center"
                >
                  Was hat gerade Saison?
                </Link>
              </div>
            </div>
          ) : (
            <NotYet>
              Ab {stats.season.need} gekochten Mahlzeiten, bisher {stats.season.have}.
            </NotYet>
          )}
        </StatCard>

        <StatCard title="Küchen" counts="Mahlzeiten je Küche">
          {stats.cuisines.enough ? (
            <BarList
              rows={stats.cuisines.value.map((row) => ({
                key: row.ref,
                label: row.name,
                value: row.count,
                valueText: times(row.count),
                href: `/rezepte?tag=${encodeURIComponent(row.ref)}`,
              }))}
            />
          ) : (
            <NotYet>
              Ab {stats.cuisines.need} Mahlzeiten mit einer Küche, bisher {stats.cuisines.have}.
            </NotYet>
          )}
        </StatCard>

        <StatCard title="Mehr gekocht, Reste gegessen">
          {stats.leftovers.extraPortions === 0 && stats.leftovers.leftoverMeals === 0 ? (
            <NotYet>Keine Extra-Portionen und keine Reste in diesem Zeitraum.</NotYet>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Figure
                value={String(stats.leftovers.extraPortions)}
                label={stats.leftovers.extraPortions === 1 ? "Extra-Portion" : "Extra-Portionen"}
                detail="mit „Mehr kochen“"
                tone="kind-poultry"
              />
              <Figure
                value={String(stats.leftovers.leftoverMeals)}
                label={stats.leftovers.leftoverMeals === 1 ? "Mahlzeit Reste" : "Mahlzeiten Reste"}
                detail={
                  stats.leftovers.linked > 0
                    ? `${stats.leftovers.linked} davon von einer geplanten Mahlzeit`
                    : null
                }
                tone="kind-other"
              />
            </div>
          )}
        </StatCard>

        <StatCard title="Kaffee & Kuchen" counts="Sonntage mit Kuchen auf dem Plan">
          {stats.coffee.sundays === 0 ? (
            <NotYet>Noch kein Sonntag in diesem Zeitraum.</NotYet>
          ) : (
            <>
              <p className="kind-sweet flex items-baseline gap-2">
                <span className="stat-number text-(--kind-ink)">{stats.coffee.withCake}</span>
                <span>
                  von {stats.coffee.sundays} {stats.coffee.sundays === 1 ? "Sonntag" : "Sonntagen"}
                </span>
              </p>
              {stats.coffee.cakes.length > 0 && (
                <div className="mt-3">
                  <BarList
                    rows={stats.coffee.cakes.map((entry) =>
                      recipeRow(
                        recipes.get(entry.id),
                        entry,
                        `zuletzt am ${dayAndMonth(entry.last)}`,
                      ),
                    )}
                  />
                </div>
              )}
            </>
          )}
        </StatCard>

        <StatCard title="Neu im Kochbuch" counts="Rezepte, die in diesem Zeitraum dazukamen">
          {stats.library.added === 0 ? (
            <NotYet>Keine neuen Rezepte in diesem Zeitraum.</NotYet>
          ) : (
            <Link href="/import/rezepte?sortierung=neu" className="bar-row">
              <span className="badge kind-place size-10">
                <PictogramIcon name="buch" className="h-[64%] w-[64%]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {stats.library.added} {stats.library.added === 1 ? "Rezept" : "Rezepte"} dazu
                </span>
                <span className="block text-sm text-muted">
                  {stats.library.addedCooked} davon schon gekocht ·{" "}
                  {percent(stats.library.addedCooked, stats.library.added)}
                </span>
              </span>
            </Link>
          )}
        </StatCard>
      </div>
    </div>
  );
}

const EFFORT_TONE = {
  schnell: "effort-schnell",
  alltag: "effort-alltag",
  aufwendig: "effort-aufwendig",
  unknown: "kind-other",
} as const;

function EffortBar({ title, counts }: { title: string; counts: EffortCounts }) {
  const parts: Part[] = (["schnell", "alltag", "aufwendig", "unknown"] as const).map((effort) => ({
    key: effort,
    label: effort === "unknown" ? "Unbekannt" : EFFORT_NAME[effort],
    value: counts[effort],
    tone: EFFORT_TONE[effort],
  }));
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">
        {title} <span className="font-normal text-muted">· {total} Mahlzeiten</span>
      </p>
      {total > 0 ? <ShareBar parts={parts} label={title} /> : <NotYet>Nichts gekocht.</NotYet>}
    </div>
  );
}

/**
 * What the family discovered: dishes new to it, how much of the library was ever cooked, the
 * cuisines of the period, and badges for trying something new, each saying how far it is.
 */
function DiscoveryCard({ discovery }: { discovery: DiscoveryStats }) {
  const share = discovery.library === 0 ? 0 : discovery.everCooked / discovery.library;
  return (
    <StatCard title="Entdeckt" counts="Neu Gekochtes, das Kochbuch und die Küchen">
      <div className="stat-figures discovery-figures">
        <Figure
          value={String(discovery.newDishes)}
          label={discovery.newDishes === 1 ? "Gericht zum ersten Mal" : "Gerichte zum ersten Mal"}
          tone="kind-vegetarian"
        />
        <Figure
          value={`${Math.round(share * 100)} %`}
          label="vom Kochbuch je gekocht"
          detail={`${discovery.everCooked} von ${discovery.library} Rezepten`}
          href="/rezepte/regal"
        />
        <Figure
          value={`${discovery.cuisines.cooked} von ${discovery.cuisines.of}`}
          label="Küchen gekocht"
          tone="kind-fish"
        />
      </div>
      <ul className="badges mt-4" aria-label="Abzeichen">
        {discovery.badges.map((badge) => (
          <li key={badge.key} className="badge-row" data-earned={badge.earned}>
            <span className="badge-medal" aria-hidden>
              <StarIcon filled={badge.earned} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">
                {badge.title}
                {badge.earned && <span className="sr-only"> (geschafft)</span>}
              </span>
              <span className="block text-sm text-muted">{badge.detail}</span>
            </span>
            {!badge.earned && (
              <span className="badge-progress" aria-hidden>
                <i style={{ width: `${badge.progress * 100}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </StatCard>
  );
}
