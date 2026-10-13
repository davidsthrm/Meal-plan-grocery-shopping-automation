import type { Metadata } from "next";
import Link from "next/link";
import { TickIcon } from "@/components/icons";
import { PrintButton } from "@/components/print-button";
import { RestockNote } from "@/components/restock-note";
import { SubmitButton } from "@/components/submit-button";
import type { CatalogIndex } from "@/domain/catalog";
import {
  addDays,
  isIsoDate,
  mondayOf,
  planningWeek,
  weekdayShort,
  weekRange,
  type IsoDate,
} from "@/domain/dates";
import type { ViewLine } from "@/domain/shopping-list/present";
import {
  coversText,
  dayTitle,
  exactText,
  KIND_NAME,
  neededText,
  sourceText,
} from "@/lib/list-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { chosenShop, loadShoppingLists, type DayList } from "@/server/shopping/list";
import { loadRestock, placeRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";
import { addListEntry, checkLine, markAtHome, noteLine, removeListEntry } from "./actions";

export const metadata: Metadata = { title: "Einkaufszettel" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Where a form of the page leads back to: the week, and the shopping day if one is shown. */
interface Place {
  week: IsoDate;
  /** The one shopping day shown, or null for all of them. */
  shown: IsoDate | null;
}

/**
 * The shopping lists of a week, one per shopping day: what its meals, its extras and its
 * hand-written lines need on that day, grouped by kind of grocery.
 */
export default async function ShoppingPage(props: PageProps<"/einkauf">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const now = today();
  const asked = one(params.w);
  const thisWeek = planningWeek(now);
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : thisWeek;
  const db = await createSessionClient();
  const [lists, noted] = await Promise.all([
    loadShoppingLists(db, household, week),
    loadRestock(db),
  ]);
  const { days, index } = lists;

  // One day is shown when it is asked for, and on a shopping day that day. "alle" shows all.
  const tag = one(params.tag);
  const wanted = tag === undefined ? now : tag;
  const shown = days.find((day) => day.trip.date === wanted)?.trip.date ?? null;
  const visible = days.filter((day) => shown === null || day.trip.date === shown);
  const place: Place = { week, shown };
  const here = `/einkauf?w=${week}${shown ? `&tag=${shown}` : tag === "alle" ? "&tag=alle" : ""}`;
  const moved = (one(params.auf) ?? "").split(".").filter(isIsoDate);

  const open = days.reduce((sum, day) => sum + day.open, 0);
  const done = days.reduce((sum, day) => sum + day.done, 0);
  const nothing = days.every((day) => day.open + day.done + day.view.atHome.length === 0);
  const printable = visible.some((day) => day.open > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 print:hidden">
        <div>
          <p className="eyebrow">Einkaufszettel</p>
          <h1 className="title mt-1">{weekRange(week)}</h1>
          {!nothing && (
            <p className="mt-1 text-muted">
              {open} offen{done > 0 ? `, ${done} erledigt` : ""}
            </p>
          )}
        </div>
        <nav aria-label="Woche wechseln" className="flex gap-2">
          <Link href={`/einkauf?w=${addDays(week, -7)}`} className="btn btn-small">
            <span aria-hidden>←</span> Vorige
          </Link>
          {week !== thisWeek && (
            <Link href={`/einkauf?w=${thisWeek}`} className="btn btn-small">
              Aktuelle
            </Link>
          )}
          <Link href={`/einkauf?w=${addDays(week, 7)}`} className="btn btn-small">
            Nächste <span aria-hidden>→</span>
          </Link>
        </nav>
      </div>

      <nav
        aria-label="Einkaufstag"
        className="mt-5 flex flex-wrap items-center gap-2 border-y border-line py-3 print:hidden"
      >
        <Link
          href={`/einkauf?w=${week}&tag=alle`}
          className={`chip ${shown === null ? "chip-on" : ""}`}
          aria-current={shown === null ? "page" : undefined}
        >
          Alle Tage
        </Link>
        {days.map(({ trip, open: left }) => (
          <Link
            key={trip.date}
            href={`/einkauf?w=${week}&tag=${trip.date}`}
            className={`chip ${shown === trip.date ? "chip-on" : ""}`}
            aria-current={shown === trip.date ? "page" : undefined}
            aria-label={`${dayTitle(trip)}, ${left} offen`}
          >
            {weekdayShort(trip.date)} {Number(trip.date.slice(8))}.
            {trip.kind === "market" && " Markt"}
            {left > 0 && <span className="font-normal text-muted tabular-nums">{left}</span>}
          </Link>
        ))}
        <span className="ml-auto flex flex-wrap gap-2">
          <Link href={`/woche?w=${week}`} className="btn btn-small">
            Zum Wochenplan
          </Link>
          {printable && (
            <>
              <PrintButton />
              <a
                href={`/einkauf/pdf?w=${week}${shown ? `&tag=${shown}` : ""}`}
                className="btn btn-small"
              >
                Als PDF
              </a>
            </>
          )}
        </span>
      </nav>

      {(noted.length > 0 || moved.length > 0) && (
        <div className="mx-auto mt-7 max-w-xl">
          <RestockNote
            items={placeRestock(noted, index, household, now)}
            back={here}
            moved={moved}
            suggestions={[]}
          />
        </div>
      )}

      {nothing && (
        <p className="mt-8 text-muted print:hidden">
          Für diese Woche steht noch nichts auf den Einkaufszetteln. Sie füllen sich aus dem{" "}
          <Link href={`/woche?w=${week}`} className="link underline">
            Wochenplan
          </Link>
          .
        </p>
      )}

      <div className="mt-7 space-y-9 print:mt-0 print:space-y-0">
        {visible.map((day) => (
          <DaySheet key={day.trip.date} day={day} place={place} index={index} />
        ))}
      </div>
      <datalist id="zutaten">
        {index.catalog.ingredients.map((ingredient) => (
          <option key={ingredient.id} value={ingredient.name} />
        ))}
      </datalist>
    </div>
  );
}

/** The fields that say which list of which week a form is about. */
function Where({ place, day }: { place: Place; day: IsoDate }) {
  return (
    <>
      <input type="hidden" name="week" value={place.week} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="shown" value={place.shown ?? ""} />
    </>
  );
}

/** The list of one shopping day, as a sheet of a pad. On paper each starts a new page. */
function DaySheet({ day, place, index }: { day: DayList; place: Place; index: CatalogIndex }) {
  const { trip, view } = day;
  const covers = coversText(view);
  const empty = view.groups.length === 0 && view.later.length === 0;

  return (
    <section
      aria-label={dayTitle(trip)}
      id={`tag-${trip.date}`}
      className="sheet scroll-mt-4 print:break-before-page print:first:break-before-auto"
    >
      <div className="px-4 pt-4 pb-5 sm:px-6 print:p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-xl font-bold tracking-tight print:text-2xl">{dayTitle(trip)}</h2>
          {day.open + day.done > 0 && (
            <p className="text-sm text-muted tabular-nums print:hidden">
              {day.open} offen{day.done > 0 ? `, ${day.done} erledigt` : ""}
            </p>
          )}
        </div>
        <p className="text-sm text-muted print:text-black">
          {KIND_NAME[trip.kind]}
          {covers !== "" && ` · ${covers}`}
        </p>

        {empty && <p className="mt-4 text-muted print:hidden">Nichts zu kaufen.</p>}

        <div className="mt-4 gap-x-10 sm:columns-2 print:columns-2">
          {view.groups.map(({ aisleGroup, lines }) => (
            <section
              key={aisleGroup.id}
              aria-label={aisleGroup.name}
              className="mb-5 break-inside-avoid-column"
            >
              <h3 className="eyebrow print:font-bold print:text-black">{aisleGroup.name}</h3>
              <ul className="ruled mt-1">
                {lines.map((line) => (
                  <Line
                    key={line.line.key}
                    view={line}
                    place={place}
                    day={trip.date}
                    shop={chosenShop(index, line)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {view.later.length > 0 && (
            <section aria-label="Kurz vorher besorgen" className="mb-5 break-inside-avoid-column">
              <h3 className="eyebrow print:font-bold print:text-black">Kurz vorher besorgen</h3>
              <ul className="ruled mt-1">
                {view.later.map((line) => (
                  <Line
                    key={line.line.key}
                    view={line}
                    place={place}
                    day={trip.date}
                    shop={chosenShop(index, line)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        <form action={addListEntry} className="mt-2 flex gap-2 print:hidden">
          <Where place={place} day={trip.date} />
          <label className="flex-1">
            <span className="sr-only">Auf den Zettel für {dayTitle(trip)} schreiben</span>
            <input
              name="text"
              maxLength={120}
              list="zutaten"
              autoComplete="off"
              className="field"
              placeholder="Dazuschreiben"
            />
          </label>
          <SubmitButton>Hinzufügen</SubmitButton>
        </form>

        {view.atHome.length > 0 && (
          <details className="mt-4 print:hidden">
            <summary className="link inline-flex min-h-10 items-center text-sm">
              Haben wir schon ({view.atHome.length})
            </summary>
            <p className="mt-1 text-sm text-muted">
              Wird gebraucht, steht aber nicht auf dem Zettel.
            </p>
            <ul className="mt-2 divide-y divide-rule">
              {view.atHome.map((line) => (
                <li key={line.line.key} className="flex items-center justify-between gap-3 py-1">
                  <span>{line.text}</span>
                  <form action={markAtHome}>
                    <Where place={place} day={trip.date} />
                    <input type="hidden" name="key" value={line.line.key} />
                    <input type="hidden" name="atHome" value="0" />
                    <SubmitButton
                      className="link min-h-10 text-sm"
                      label={`${line.line.label} doch kaufen`}
                    >
                      Doch kaufen
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/** One line of a list: a box to tick, the text, and behind it where it comes from. */
function Line({
  view,
  place,
  day,
  shop,
}: {
  view: ViewLine;
  place: Place;
  day: IsoDate;
  /** The shop, where the line names one on purpose. */
  shop: string | null;
}) {
  const { line } = view;
  const where = (
    <>
      <Where place={place} day={day} />
      <input type="hidden" name="key" value={line.key} />
    </>
  );
  const exact = exactText(view);
  const typed = line.contributions.flatMap((entry) =>
    entry.source.type === "manual" ? [{ id: entry.source.entryId, text: entry.originalText }] : [],
  );

  return (
    <li className="flex items-start gap-3 print:gap-2 print:py-0.5">
      <form action={checkLine} className="print:hidden">
        {where}
        <input type="hidden" name="checked" value={view.checked ? "0" : "1"} />
        <TickBox
          on={view.checked}
          label={`${view.text}: ${view.checked ? "wieder offen" : "erledigt"}`}
        />
      </form>
      <span aria-hidden className="mt-1 hidden size-3 shrink-0 border border-black print:block" />
      <details className="min-w-0 flex-1">
        <summary
          className={`flex min-h-10 items-center py-1 print:min-h-0 print:py-0 ${
            view.checked ? "text-muted line-through" : ""
          }`}
        >
          <span>
            {view.text}
            {shop && <span className="text-sm text-muted print:text-black"> · {shop}</span>}
            {line.trip === "later" && (
              <span className="text-sm text-muted print:text-black"> · {neededText(view)}</span>
            )}
          </span>
        </summary>
        <div className="mt-1 mb-2 space-y-2 rounded-lg bg-accent-soft/50 p-3 text-sm print:hidden">
          {exact !== "" && <p>Genau: {exact}</p>}
          <ul className="text-muted">
            {line.contributions.map((entry, at) => (
              <li key={at}>{sourceText(entry)}</li>
            ))}
          </ul>
          <form action={noteLine} className="flex gap-2">
            {where}
            <label className="flex-1">
              <span className="sr-only">Notiz zu {line.label}</span>
              <input
                name="note"
                defaultValue={view.note ?? ""}
                maxLength={80}
                className="field"
                placeholder="Notiz, z. B. Marke oder Angebot"
              />
            </label>
            <SubmitButton className="btn btn-small">Merken</SubmitButton>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={markAtHome}>
              {where}
              <input type="hidden" name="atHome" value="1" />
              <SubmitButton className="btn btn-small" label={`${line.label} haben wir schon`}>
                Haben wir schon
              </SubmitButton>
            </form>
            {typed.map((entry) => (
              <form key={entry.id} action={removeListEntry}>
                <Where place={place} day={day} />
                <input type="hidden" name="entry" value={entry.id} />
                <SubmitButton
                  className="btn btn-small btn-danger"
                  label={`${entry.text} entfernen`}
                >
                  Eintrag entfernen
                </SubmitButton>
              </form>
            ))}
          </div>
        </div>
      </details>
    </li>
  );
}

/** The box of a line, with the tick of a pen in it when the line is done. */
function TickBox({ on, label }: { on: boolean; label: string }) {
  return (
    <SubmitButton className="tickbox" label={label} on={on}>
      <TickIcon />
    </SubmitButton>
  );
}
