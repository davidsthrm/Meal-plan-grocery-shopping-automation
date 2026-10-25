import Link from "next/link";
import type { Place } from "@/domain/catalog";
import { dayAndMonth, mondayOf, weekdayLong, type IsoDate } from "@/domain/dates";
import { initialOf } from "@/domain/family";
import type { Bucket, Period } from "@/domain/stats/period";
import type { ShoppingStats } from "@/domain/stats/shopping";
import { PictogramIcon } from "@/components/pictogram";
import { ShopLogo } from "@/components/shop-logo";
import {
  BarList,
  Columns,
  Figure,
  NotYet,
  StatCard,
  num,
  percent,
} from "@/components/stats-charts";
import { PLACE_LOOK, PLACE_NAME, dayName } from "@/lib/list-text";

const PLACES: readonly Place[] = ["supermarket", "market", "butcher", "bakery", "drugstore"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const toneOf = (place: Place) => PLACE_LOOK[place].tone || "kind-supermarket";

/** The shopping notes of a week, or one note picked up. */
function notesHref(date: IsoDate, place?: Place): string {
  return `/einkauf?w=${mondayOf(date)}${place ? `&zettel=${date}.${place}` : ""}`;
}

function PlaceBadge({ place, size = "size-10" }: { place: Place; size?: string }) {
  return (
    <span className={`badge ${toneOf(place)} ${size}`}>
      <PictogramIcon name={PLACE_LOOK[place].pictogram} className="h-[64%] w-[64%]" />
    </span>
  );
}

export function ShoppingView({
  stats,
  period,
  today,
  periodHref,
}: {
  stats: ShoppingStats;
  period: Period;
  today: IsoDate;
  periodHref: (opens: Bucket["opens"]) => string;
}) {
  const deviations = stats.deviations.enough ? stats.deviations.value : null;
  const errands = stats.errands.length;
  return (
    <div className="space-y-4">
      <div className="stat-figures">
        <Figure
          value={String(errands)}
          label={errands === 1 ? "Einkauf" : "Einkäufe"}
          detail={errands > 0 ? `${num(stats.perWeek)} pro Woche` : "noch keiner abgehakt"}
        />
        <Figure
          value={String(stats.bought)}
          label={stats.bought === 1 ? "Eintrag gekauft" : "Einträge gekauft"}
          detail={errands > 0 ? `${num(stats.bought / errands)} pro Einkauf` : null}
          tone="kind-vegetarian"
        />
        <Figure
          value={String(stats.places.length)}
          label={stats.places.length === 1 ? "Geschäft" : "Geschäfte"}
          detail={stats.places.map((row) => PLACE_NAME[row.place]).join(", ") || null}
          tone="kind-fish"
        />
        <Figure
          value={deviations ? percent(deviations.removed, deviations.decided) : "–"}
          label="Nicht gekauft"
          detail={
            deviations
              ? `${deviations.removed} von ${deviations.decided} entschiedenen Einträgen`
              : null
          }
          tone="kind-red_meat"
        />
      </div>

      {period.kind !== "year" && (
        <StatCard
          title="Einkaufskalender"
          counts="Jeder Tag, an dem etwas abgehakt wurde, mit dem Geschäft"
        >
          {errands === 0 ? (
            <NotYet>
              In diesem Zeitraum wurde noch nichts in der App abgehakt. Ein Einkauf vom Papierzettel
              zählt hier nicht.
            </NotYet>
          ) : (
            <Calendar days={stats.days} today={today} errands={stats.errands} />
          )}
        </StatCard>
      )}

      <StatCard
        title="Verlauf"
        counts={
          period.kind === "year"
            ? "Einkäufe je Monat, nach Geschäft"
            : period.kind === "month"
              ? "Einkäufe je Woche, nach Geschäft"
              : "Die letzten acht Wochen, nach Geschäft"
        }
      >
        {stats.trend.enough ? (
          <>
            <Columns
              unit={["Einkauf", "Einkäufe"]}
              columns={stats.trend.value.map((bar) => ({
                key: bar.key,
                label: bar.label,
                href: periodHref(bar.opens),
                current: period.kind === "week" && bar.key === period.key,
                parts: PLACES.map((place) => ({
                  key: place,
                  label: PLACE_NAME[place],
                  value: bar.counts[place],
                  tone: toneOf(place),
                })),
              }))}
            />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden>
              {PLACES.filter((place) => stats.places.some((row) => row.place === place)).map(
                (place) => (
                  <li key={place} className={`inline-flex items-center gap-1.5 ${toneOf(place)}`}>
                    <span className="dot chart-dot" />
                    {PLACE_NAME[place]}
                  </li>
                ),
              )}
            </ul>
          </>
        ) : (
          <NotYet>
            Der Verlauf braucht Einkäufe aus mindestens {stats.trend.need}{" "}
            {period.kind === "year" ? "Monaten" : "Wochen"}, bisher {stats.trend.have}.
          </NotYet>
        )}
      </StatCard>

      <div className="stat-columns">
        <StatCard title="Wo eingekauft wird" counts="Einkäufe und gekaufte Einträge je Geschäft">
          {stats.places.length === 0 ? (
            <NotYet>Noch kein Einkauf abgehakt.</NotYet>
          ) : (
            <>
              <BarList
                rows={stats.places.map((row) => ({
                  key: row.place,
                  label: PLACE_NAME[row.place],
                  value: row.errands,
                  valueText: `${row.errands}×`,
                  meta: `${row.bought} Einträge · ${num(row.bought / row.errands)} pro Einkauf`,
                  leading: <PlaceBadge place={row.place} />,
                  tone: toneOf(row.place),
                  href: notesHref(
                    [...stats.errands].reverse().find((errand) => errand.place === row.place)!.date,
                  ),
                }))}
              />
              {stats.supermarkets.enough && stats.supermarkets.value.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-semibold text-muted">Im Supermarkt</h3>
                  <div className="mt-2">
                    <BarList
                      rows={stats.supermarkets.value.map((row) => ({
                        key: row.shop.id,
                        label: row.shop.name,
                        value: row.bought,
                        valueText: `${row.bought} Einträge`,
                        leading: <ShopLogo shop={row.shop} size={40} />,
                      }))}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </StatCard>

        <StatCard title="Am häufigsten gekauft" counts="Auf wie vielen Einkäufen, nicht wie viel">
          {stats.top.enough ? (
            <BarList
              rows={stats.top.value.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.count,
                valueText: `${row.count}×`,
                meta: `zuletzt ${dayName(row.last.date)} ${PLACE_NAME[row.last.place]}`,
                href: notesHref(row.last.date, row.last.place),
              }))}
            />
          ) : (
            <NotYet>Noch wurde nichts auf zwei Einkäufen gekauft.</NotYet>
          )}
        </StatCard>

        <StatCard title="Einkaufstage" counts="Einkäufe je Wochentag">
          {stats.weekdays.enough ? (
            <Weekdays counts={stats.weekdays.value} />
          ) : (
            <NotYet>
              Ab {stats.weekdays.need} Einkäufen, bisher {stats.weekdays.have}.
            </NotYet>
          )}
        </StatCard>

        <StatCard title="Wer kauft ein" counts="Wer einen Einkauf als Letztes abgehakt hat">
          {stats.who.enough ? (
            stats.who.value.length === 0 ? (
              <NotYet>Die Häkchen tragen keinen Namen.</NotYet>
            ) : (
              <BarList
                rows={stats.who.value.map((row) => ({
                  key: row.name,
                  label: row.name,
                  value: row.errands,
                  valueText: `${row.errands}×`,
                  meta: `${row.ticks} Häkchen`,
                  leading: <span className="account size-10 text-base">{initialOf(row.name)}</span>,
                  tone: "kind-place",
                }))}
              />
            )
          ) : (
            <NotYet>
              Ab {stats.who.need} Einkäufen, bisher {stats.who.have}.
            </NotYet>
          )}
        </StatCard>

        <StatCard title="Anders als geplant" counts="Was im Laden anders kam">
          {deviations ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ["Weggelassen", deviations.removed],
                  ["Teilweise gekauft", deviations.partial],
                  ["Anderes Produkt", deviations.substituted],
                  ["Verschoben", deviations.moved],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {deviations.mostRemoved.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-semibold text-muted">
                    Am häufigsten weggelassen
                  </h3>
                  <div className="mt-2">
                    <BarList
                      rows={deviations.mostRemoved.map((row) => ({
                        key: row.key,
                        label: row.label,
                        value: row.count,
                        valueText: `${row.count}×`,
                        tone: "kind-red_meat",
                        href: notesHref(row.last.date, row.last.place),
                      }))}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <NotYet>Noch keine Entscheidung im Laden.</NotYet>
          )}
        </StatCard>

        <StatCard title="Selbst geschrieben" counts="Einträge, die nicht aus dem Plan kamen">
          {stats.typed.enough ? (
            <>
              <p className="flex items-baseline gap-2">
                <span className="stat-number text-accent">{stats.typed.value.count}</span>
                <span>{stats.typed.value.count === 1 ? "Eintrag" : "Einträge"} von Hand</span>
              </p>
              <div className="mt-3">
                <BarList
                  rows={stats.typed.value.top.map((row) => ({
                    key: row.key,
                    label: row.label,
                    value: row.count,
                    valueText: `${row.count}×`,
                    href: notesHref(row.last.date, row.last.place),
                  }))}
                />
              </div>
            </>
          ) : (
            <NotYet>Alles kam aus dem Plan.</NotYet>
          )}
        </StatCard>

        <StatCard title="dm" counts="Was auf dem Zettel für die Drogerie stand">
          {stats.drugstore.enough ? (
            <>
              <BarList
                rows={stats.drugstore.value.top.map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.count,
                  valueText: `${row.count}×`,
                  tone: "kind-fish",
                  href: notesHref(row.last.date, row.last.place),
                }))}
              />
              {stats.drugstore.value.forWhom.length > 0 && (
                <p className="mt-3 text-sm text-muted">
                  Für:{" "}
                  {stats.drugstore.value.forWhom
                    .map((entry) => `${entry.name} ${entry.count}×`)
                    .join(", ")}
                </p>
              )}
            </>
          ) : (
            <NotYet>Noch nichts für dm aufgeschrieben.</NotYet>
          )}
        </StatCard>
      </div>

      <p className="text-sm text-muted">
        Gezählt wird, was in der App abgehakt, weggelassen oder aufgeschrieben wurde. Ein Einkauf
        vom Papierzettel hinterlässt nichts zum Zählen.
      </p>
    </div>
  );
}

/** The period's days in weeks, each with a sign for every place shopped at. */
function Calendar({
  days,
  today,
  errands,
}: {
  days: ShoppingStats["days"];
  today: IsoDate;
  errands: ShoppingStats["errands"];
}) {
  return (
    <div>
      <div className="calendar mb-1.5" aria-hidden>
        {WEEKDAYS.map((day) => (
          <span key={day} className="text-center text-xs font-semibold text-muted">
            {day}
          </span>
        ))}
      </div>
      <ol className="calendar">
        {days.map((day) => {
          const outside = day.date > today;
          const content = (
            <>
              <span>{Number(day.date.slice(8))}</span>
              <span className="calendar-signs">
                {day.places.map((place) => (
                  <span key={place} className={toneOf(place)}>
                    <PictogramIcon name={PLACE_LOOK[place].pictogram} />
                  </span>
                ))}
              </span>
            </>
          );
          const label = `${weekdayLong(day.date)}, ${dayAndMonth(day.date)}: ${
            day.places.length > 0
              ? day.places.map((place) => PLACE_NAME[place]).join(", ")
              : "kein Einkauf"
          }`;
          const only = day.places.length === 1 ? day.places[0] : undefined;
          return (
            <li key={day.date} className="min-w-0">
              {day.places.length > 0 ? (
                <Link
                  href={notesHref(day.date, only)}
                  className="calendar-day"
                  data-today={day.date === today}
                  aria-label={label}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className="calendar-day"
                  data-outside={outside}
                  data-today={day.date === today}
                  aria-label={label}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-muted">
        {errands.length} {errands.length === 1 ? "Einkauf" : "Einkäufe"} an{" "}
        {new Set(errands.map((errand) => errand.date)).size} Tagen
      </p>
    </div>
  );
}

/** Seven columns, Monday to Sunday: on which days the household shops. */
function Weekdays({ counts }: { counts: readonly number[] }) {
  const most = Math.max(1, ...counts);
  return (
    <ol className="columns" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {counts.map((count, at) => (
        <li
          key={WEEKDAYS[at]}
          className="column"
          aria-label={`${WEEKDAYS[at]}: ${count} ${count === 1 ? "Einkauf" : "Einkäufe"}`}
        >
          <span className="column-value tabular-nums">{count > 0 ? count : ""}</span>
          <span className="column-plot weekday-plot">
            <span
              className="column-stack kind-place"
              style={{ height: `${(count / most) * 100}%` }}
            >
              <span className="column-part h-full" />
            </span>
          </span>
          <span className="column-label">{WEEKDAYS[at]}</span>
        </li>
      ))}
    </ol>
  );
}
