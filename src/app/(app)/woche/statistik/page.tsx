import type { Metadata } from "next";
import { SegmentPill } from "@/components/segment-pill";
import { BACK, FORWARD, SWAP } from "@/lib/transitions";
import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { planningWeek, weekRange } from "@/domain/dates";
import {
  PERIOD_KINDS,
  PERIOD_PARAM,
  hasPeriodAfter,
  hasPeriodBefore,
  periodOf,
  periodTitle,
  periodWeeksText,
  readPeriod,
  shiftPeriod,
  type Period,
  type PeriodKind,
} from "@/domain/stats/period";
import { ArrowIcon } from "@/components/icons";
import { PictogramIcon } from "@/components/pictogram";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { countingFrom, loadMealStats, loadShoppingStats } from "@/server/stats";
import { createSessionClient } from "@/server/supabase/server";
import { MealsView } from "./meals-view";
import { ShoppingView } from "./shopping-view";

export const metadata: Metadata = { title: "Statistik" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Area = "essen" | "einkauf";

const KIND_LABEL: Record<PeriodKind, string> = { week: "Woche", month: "Monat", year: "Jahr" };
const BEFORE: Record<PeriodKind, string> = {
  week: "Vorige Woche",
  month: "Voriger Monat",
  year: "Voriges Jahr",
};
const AFTER: Record<PeriodKind, string> = {
  week: "Nächste Woche",
  month: "Nächster Monat",
  year: "Nächstes Jahr",
};

/**
 * How the family eats and shops, counted from its plans and its shopping notes: a month at
 * first, a week or a year on a tap. Everything counted links to what it counts.
 */
export default async function StatisticsPage(props: PageProps<"/woche/statistik">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const now = today();
  const area: Area = one(params.bereich) === "einkauf" ? "einkauf" : "essen";
  const asked = readPeriod(one(params.zeit), one(params.am), now);
  const db = await createSessionClient();
  // Not before the household's first week, and nothing after today's period.
  const first = await countingFrom(db, household);
  const counted = { firstWeek: first, targets: household.targets };
  const period =
    first !== null && asked.end < first
      ? periodOf(asked.kind, first)
      : asked.start > now
        ? periodOf(asked.kind, now)
        : asked;

  const href = (to: { kind: PeriodKind; key: string }, inArea: Area = area) =>
    `/woche/statistik?zeit=${PERIOD_PARAM[to.kind]}&am=${to.key}${
      inArea === "einkauf" ? "&bereich=einkauf" : ""
    }`;
  const current = periodOf(period.kind, now);

  const view =
    area === "essen" ? (
      await loadMealStats(db, counted, period, now).then(({ stats, discovery, library }) => (
        <MealsView
          stats={stats}
          discovery={discovery}
          period={period}
          today={now}
          recipes={new Map(library.recipes.map((recipe) => [recipe.id, recipe]))}
          periodHref={(opens) => href(opens)}
        />
      ))
    ) : (
      <ShoppingView
        stats={await loadShoppingStats(db, counted, period, now)}
        period={period}
        today={now}
        periodHref={(opens) => href(opens)}
      />
    );

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink
        href={period.kind === "week" ? `/woche?w=${period.key}` : `/woche?w=${planningWeek(now)}`}
      >
        Wochenplan
      </BackLink>
      <h1 className="title mt-3">Statistik</h1>

      {/* What is counted: the meals or the shopping. */}
      <nav aria-label="Bereich" className="segmented mt-5">
        <SegmentPill name="pill-bereich" at={area === "essen" ? 0 : 1} of={2} />
        {(
          [
            ["essen", "Essen", "teller"],
            ["einkauf", "Einkauf", "wagen"],
          ] as const
        ).map(([key, label, picture]) => (
          <Link
            key={key}
            href={href(period, key)}
            transitionTypes={[SWAP]}
            className="segment gap-2"
            aria-current={area === key ? "page" : undefined}
          >
            <PictogramIcon name={picture} className="size-5 stroke-[2.2]" />
            {label}
          </Link>
        ))}
      </nav>

      {/* For when: a week, a month or a year, and which one. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <nav aria-label="Zeitraum" className="segmented sm:w-auto">
          <SegmentPill
            name="pill-zeitraum"
            at={PERIOD_KINDS.indexOf(period.kind)}
            of={PERIOD_KINDS.length}
          />
          {PERIOD_KINDS.map((kind) => (
            <Link
              key={kind}
              href={href(periodOf(kind, pick(period, now)))}
              transitionTypes={[SWAP]}
              className="segment"
              aria-current={period.kind === kind ? "page" : undefined}
            >
              {KIND_LABEL[kind]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Zeitraum wechseln" className="capsule">
          {hasPeriodBefore(period, first) ? (
            <Link
              href={href(shiftPeriod(period, -1))}
              transitionTypes={[BACK]}
              aria-label={BEFORE[period.kind]}
            >
              <ArrowIcon back />
            </Link>
          ) : (
            <a aria-disabled="true" aria-label={BEFORE[period.kind]} className="opacity-30">
              <ArrowIcon back />
            </a>
          )}
          {period.key !== current.key && (
            <Link href={href(current)} transitionTypes={[FORWARD]}>
              Aktuell
            </Link>
          )}
          {hasPeriodAfter(period, now) ? (
            <Link
              href={href(shiftPeriod(period, 1))}
              transitionTypes={[FORWARD]}
              aria-label={AFTER[period.kind]}
            >
              <ArrowIcon />
            </Link>
          ) : (
            <a aria-disabled="true" aria-label={AFTER[period.kind]} className="opacity-30">
              <ArrowIcon />
            </a>
          )}
        </nav>
      </div>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-3">
        <span className="text-2xl font-bold tracking-tight">{periodTitle(period)}</span>
        <span className="text-muted">
          {period.kind === "week" ? weekRange(period.start) : periodWeeksText(period)}
        </span>
      </p>

      {/* A new period or area fades in where the old one stood, so the change is seen. */}
      <div key={`${area}-${period.kind}-${period.key}`} className="stats-in mt-4">
        {view}
      </div>
    </div>
  );
}

/**
 * The day a switch to another kind of period keeps: today where it lies in the period
 * being looked at, otherwise its middle.
 */
function pick(period: Period, now: string): string {
  if (now >= period.start && now <= period.end) return now;
  return period.weeks[Math.floor(period.weeks.length / 2)];
}
