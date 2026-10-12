import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { SubmitButton } from "@/components/submit-button";
import {
  addDays,
  dayAndMonth,
  isIsoDate,
  mondayOf,
  planningWeek,
  weekdayLong,
  weekRange,
  type IsoDate,
} from "@/domain/dates";
import type { ViewLine } from "@/domain/shopping-list/present";
import { exactText, neededText, sourceText } from "@/lib/list-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { chosenShop, loadShoppingList } from "@/server/shopping/list";
import { createSessionClient } from "@/server/supabase/server";
import { addListEntry, checkLine, markAtHome, noteLine, removeListEntry } from "./actions";

export const metadata: Metadata = { title: "Einkaufsliste" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The shopping list of a week: what its meals, its extras and its hand-written lines add up
 * to, grouped by kind of grocery.
 */
export default async function ShoppingPage(props: PageProps<"/einkauf">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const asked = one(params.w);
  const thisWeek = planningWeek(today());
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : thisWeek;
  const list = await loadShoppingList(await createSessionClient(), household, week);
  const { view } = list;

  const toBuy = [...view.groups.flatMap((group) => group.lines), ...view.later];
  const done = toBuy.filter((line) => line.checked).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Einkaufsliste</p>
          <h1 className="title mt-1">{weekRange(week)}</h1>
          <p className="mt-1 text-muted print:text-black">
            Einkauf am {weekdayLong(list.shoppingDate)}, {dayAndMonth(list.shoppingDate)}
            {toBuy.length > 0 && (
              <span className="print:hidden">
                {" "}
                · {toBuy.length - done} offen{done > 0 ? `, ${done} erledigt` : ""}
              </span>
            )}
          </p>
        </div>
        <nav aria-label="Woche wechseln" className="flex gap-2 print:hidden">
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

      <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-line py-3 print:hidden">
        <Link href={`/woche?w=${week}`} className="btn btn-small">
          Zum Wochenplan
        </Link>
        {toBuy.length > 0 && (
          <>
            <PrintButton />
            <a href={`/einkauf/pdf?w=${week}`} className="btn btn-small">
              Als PDF
            </a>
          </>
        )}
      </div>

      <form action={addListEntry} className="mt-5 flex gap-2 print:hidden">
        <input type="hidden" name="week" value={week} />
        <label className="flex-1">
          <span className="sr-only">Etwas dazuschreiben</span>
          <input
            name="text"
            maxLength={120}
            list="zutaten"
            autoComplete="off"
            className="field"
            placeholder="Etwas dazuschreiben, z. B. Milch WS 1.29"
          />
        </label>
        <SubmitButton>Hinzufügen</SubmitButton>
      </form>
      <datalist id="zutaten">
        {list.index.catalog.ingredients.map((ingredient) => (
          <option key={ingredient.id} value={ingredient.name} />
        ))}
      </datalist>

      {!list.hasContent && (
        <p className="mt-8 text-muted">
          Für diese Woche steht noch nichts auf der Liste. Sie füllt sich aus dem{" "}
          <Link href={`/woche?w=${week}`} className="link underline">
            Wochenplan
          </Link>
          .
        </p>
      )}

      <div className="mt-6 gap-x-10 sm:columns-2 print:columns-2">
        {view.groups.map(({ aisleGroup, lines }) => (
          <section
            key={aisleGroup.id}
            aria-label={aisleGroup.name}
            className="mb-6 break-inside-avoid-column"
          >
            <h2 className="border-b border-line pb-1 text-lg font-bold tracking-tight print:border-black">
              {aisleGroup.name}
            </h2>
            <ul className="mt-2">
              {lines.map((line) => (
                <Line key={line.line.key} view={line} week={week} shop={chosenShop(list, line)} />
              ))}
            </ul>
          </section>
        ))}

        {view.later.length > 0 && (
          <section aria-label="Später frisch kaufen" className="mb-6 break-inside-avoid-column">
            <h2 className="border-b border-line pb-1 text-lg font-bold tracking-tight print:border-black">
              Später frisch kaufen
            </h2>
            <ul className="mt-3">
              {view.later.map((line) => (
                <Line key={line.line.key} view={line} week={week} shop={chosenShop(list, line)} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {view.atHome.length > 0 && (
        <details className="card mt-2 p-4 print:hidden">
          <summary className="font-semibold">Haben wir schon ({view.atHome.length})</summary>
          <p className="mt-2 text-sm text-muted">
            Wird für die Woche gebraucht, steht aber nicht auf der Liste.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {view.atHome.map((line) => (
              <li key={line.line.key} className="flex items-center justify-between gap-3 py-1">
                <span>{line.text}</span>
                <form action={markAtHome}>
                  <input type="hidden" name="week" value={week} />
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
  );
}

/** One line of the list: a box to tick, the text, and behind it where it comes from. */
function Line({
  view,
  week,
  shop,
}: {
  view: ViewLine;
  week: IsoDate;
  /** The shop, where the line names one on purpose. */
  shop: string | null;
}) {
  const { line } = view;
  const where = (
    <>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="key" value={line.key} />
    </>
  );
  const exact = exactText(view);
  const typed = line.contributions.flatMap((entry) =>
    entry.source.type === "manual" ? [{ id: entry.source.entryId, text: entry.originalText }] : [],
  );

  return (
    <li className="flex items-start gap-3 py-1.5 print:gap-2 print:py-0.5">
      <form action={checkLine} className="print:hidden">
        {where}
        <input type="hidden" name="checked" value={view.checked ? "0" : "1"} />
        <SubmitButton
          className={`flex size-8 items-center justify-center rounded-md border text-lg leading-none ${
            view.checked
              ? "border-accent bg-accent text-accent-ink"
              : "border-muted bg-surface text-transparent"
          }`}
          label={`${view.text}: ${view.checked ? "wieder offen" : "erledigt"}`}
        >
          ✓
        </SubmitButton>
      </form>
      <span aria-hidden className="mt-1 hidden size-3 shrink-0 border border-black print:block" />
      <details className="min-w-0 flex-1">
        <summary className={`py-1 print:py-0 ${view.checked ? "text-muted line-through" : ""}`}>
          {view.text}
          {shop && <span className="text-sm text-muted print:text-black"> · {shop}</span>}
          {line.trip === "later" && (
            <span className="text-sm text-muted print:text-black"> · {neededText(view)}</span>
          )}
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
                <input type="hidden" name="week" value={week} />
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
