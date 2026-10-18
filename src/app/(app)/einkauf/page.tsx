import type { Metadata } from "next";
import Link from "next/link";
import { NoteIcon, TickIcon } from "@/components/icons";
import { PrintButton } from "@/components/print-button";
import { KeepForTheShop } from "@/components/service-worker";
import { SheetHoles } from "@/components/sheet-holes";
import { SubmitButton } from "@/components/submit-button";
import type { CatalogIndex, Shop } from "@/domain/catalog";
import {
  addDays,
  isIsoDate,
  mondayOf,
  planningWeek,
  weekRange,
  type IsoDate,
} from "@/domain/dates";
import { familyName } from "@/domain/family";
import { groupAtHome, noteToBuyOn, type AtHomeGroup } from "@/domain/shopping-list/at-home";
import { marketsOfNote } from "@/domain/shopping-list/supermarkets";
import { noteId, type ShoppingDay } from "@/domain/shopping-list/trips";
import { noteName, PLACE_NAME, whenText } from "@/lib/list-text";
import { hasErrandFrom, pagesForTheShop } from "@/lib/offline-pages";
import { printRules } from "@/lib/note-paper";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadShoppingNotes, type NoteList } from "@/server/shopping/list";
import { loadRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";
import { buyAfterAll } from "./actions";
import { NoteHead, NoteSheet } from "./note-sheet";

export const metadata: Metadata = { title: "Einkaufszettel" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** How many lines a note shows of itself while it lies among the others. */
const PREVIEW = 7;

/**
 * The shopping notes of a week. Every errand has a note of its own: the supermarket on
 * Monday, the market on Saturday. They lie next to each other as small notes; one is picked
 * up to work through it.
 */
export default async function ShoppingPage(props: PageProps<"/einkauf">) {
  const params = await props.searchParams;
  const household = await requireHousehold();
  const now = today();
  const asked = one(params.w);
  const thisWeek = planningWeek(now);
  const week = asked && isIsoDate(asked) ? mondayOf(asked) : thisWeek;
  const db = await createSessionClient();
  const [{ notes, atHome, index, members, supermarkets, alsoOn, readAt }, noted] =
    await Promise.all([loadShoppingNotes(db, household, week), loadRestock(db, household, now)]);
  const picked = notes.find((note) => note.id === one(params.zettel));
  // The notes of the running week are kept on the device for the shop, and the next errand
  // with them when it lies in the week after.
  const trips = notes.map((note) => note.trip);
  const keep =
    week === thisWeek &&
    pagesForTheShop(
      week,
      trips,
      now,
      hasErrandFrom(trips, now)
        ? []
        : (await loadShoppingNotes(db, household, addDays(week, 7))).notes.map((note) => note.trip),
    );

  if (picked) {
    // The notes of the week a line can be moved to, where it is in time (`moveTargets`).
    const others = notes.map((note) => note.trip);
    return (
      <div className="mx-auto max-w-5xl">
        {/* Printed, the note has the size and the layout of its PDF. */}
        <style>{printRules()}</style>
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`/einkauf?w=${week}`} className="link">
            ← Alle Zettel
          </Link>
          <span className="flex gap-2">
            {picked.open > 0 && <PrintButton />}
            <a href={`/einkauf/pdf?w=${week}&zettel=${picked.id}`} className="btn btn-small">
              Als PDF
            </a>
          </span>
        </div>
        <NoteSheet
          note={picked}
          week={week}
          index={index}
          others={others}
          today={now}
          members={members}
          supermarkets={supermarkets}
          alsoOn={alsoOn}
          renderedAt={readAt}
        />
        {keep && <KeepForTheShop pages={keep} readAt={readAt} />}
      </div>
    );
  }

  const open = notes.reduce((sum, note) => sum + note.open, 0);
  const atHomeGroups = groupAtHome(atHome, index);
  // "Bei den Stührmanns": the household's name where it is a family name.
  const family = familyName(household.name);
  const done = notes.reduce((sum, note) => sum + note.done, 0);
  const nothing = open + done + atHome.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Einkaufszettel</p>
          <h1 className="title mt-1">{weekRange(week)}</h1>
          {!nothing && (
            <p className="mt-1 text-muted">
              {open} offen{done > 0 ? `, ${done} erledigt` : ""}
            </p>
          )}
        </div>
        <nav aria-label="Woche wechseln" className="flex flex-wrap gap-2">
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
          <Link href={`/woche?w=${week}`} className="btn btn-small">
            Zum Wochenplan
          </Link>
        </nav>
      </div>

      {nothing && (
        <p className="mt-6 text-muted">
          {family
            ? `Bei den ${family} steht für diese Woche noch nichts auf den Einkaufszetteln.`
            : "Für diese Woche steht noch nichts auf den Einkaufszetteln."}{" "}
          Sie füllen sich aus dem{" "}
          <Link href={`/woche?w=${week}`} className="link underline">
            Wochenplan
          </Link>
          .
        </p>
      )}

      <ul aria-label="Zettel" className="tiles mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((note) => (
          <li key={note.id}>
            <NoteTile
              note={note}
              week={week}
              today={now}
              markets={
                note.trip.place === "supermarket" ? marketsOfNote(note.view, supermarkets) : []
              }
            />
          </li>
        ))}
        {noted.length > 0 && (
          <li>
            <a
              href="#merkzettel"
              className="note lift flex h-full min-h-56 flex-col px-4 pt-6 pb-4"
            >
              <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <NoteIcon />
                Merkzettel
              </span>
              <span className="muted text-sm">Was zu Hause ausgegangen ist</span>
              <span className="note-lines mt-2 block flex-1">
                {noted.slice(0, PREVIEW).map((item) => (
                  <span key={item.id} className="block truncate py-1">
                    {item.text}
                  </span>
                ))}
              </span>
              <span className="muted mt-2 text-sm">
                {noted.length === 1 ? "1 Eintrag" : `${noted.length} Einträge`}, noch auf keinem
                Zettel
              </span>
            </a>
          </li>
        )}
      </ul>

      {atHomeGroups.length > 0 && (
        <AtHomeList
          groups={atHomeGroups}
          week={week}
          today={now}
          days={household.shoppingDays}
          index={index}
        />
      )}

      {open > 0 && (
        <nav
          aria-label="Als PDF"
          className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-4"
        >
          <span className="eyebrow mr-1">Als PDF</span>
          <a href={`/einkauf/pdf?w=${week}`} className="chip">
            Alle Zettel
          </a>
          {notes
            .filter((note) => note.open > 0)
            .map((note) => (
              <a key={note.id} href={`/einkauf/pdf?w=${week}&zettel=${note.id}`} className="chip">
                {noteName(note.trip)}
              </a>
            ))}
        </nav>
      )}
      {keep && <KeepForTheShop pages={keep} readAt={readAt} />}
    </div>
  );
}

/**
 * "Haben wir schon": what the week needs and is at home, each thing once by kind of grocery.
 * "Doch kaufen" puts it on the note that buys it next.
 */
function AtHomeList({
  groups: atHomeGroups,
  week,
  today: now,
  days,
  index,
}: {
  groups: AtHomeGroup[];
  week: IsoDate;
  today: IsoDate;
  days: readonly ShoppingDay[];
  index: CatalogIndex;
}) {
  return (
    <details className="card mt-8 px-4 py-2">
      <summary className="flex min-h-11 items-center justify-between gap-3 font-semibold">
        <span>Haben wir schon</span>
        <span className="text-sm font-normal text-muted tabular-nums">
          {atHomeGroups.reduce((sum, group) => sum + group.items.length, 0)}
        </span>
      </summary>
      <p className="text-sm text-muted">
        Wird für die Woche gebraucht, steht aber auf keinem Zettel. „Doch kaufen“ schreibt es auf
        den Zettel, der es als Nächstes kauft.
      </p>
      <div className="mt-3 gap-x-10 sm:columns-2 lg:columns-3">
        {atHomeGroups.map(({ aisleGroup, items }) => (
          <section
            key={aisleGroup.id}
            aria-label={aisleGroup.name}
            className="mb-4 break-inside-avoid-column"
          >
            <h3 className="eyebrow">{aisleGroup.name}</h3>
            <ul className="mt-1">
              {items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3 border-b border-rule py-0.5"
                >
                  <span className="min-w-0">{item.label}</span>
                  <form action={buyAfterAll}>
                    <input type="hidden" name="week" value={week} />
                    <input type="hidden" name="note" value={noteId(item.lines[0].trip)} />
                    <input type="hidden" name="back" value="all" />
                    {item.lines.map(({ trip, line }) => {
                      const fresh =
                        index.aisleGroupById.get(line.line.aisleGroupId)?.freshPlace ?? null;
                      const target = noteToBuyOn(trip, now, days, fresh);
                      const origins = [
                        ...new Set(
                          line.line.contributions.map((part) => noteId(part.origin ?? trip)),
                        ),
                      ];
                      return (
                        <input
                          key={`${noteId(trip)}|${line.line.key}`}
                          type="hidden"
                          name="line"
                          value={[noteId(trip), line.line.key, noteId(target), origins].join("|")}
                        />
                      );
                    })}
                    <SubmitButton
                      className="link min-h-10 text-sm whitespace-nowrap"
                      label={`${item.label} doch kaufen`}
                    >
                      Doch kaufen
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

/** A note as it lies among the others: its heading, its first lines, and how much is open. */
function NoteTile({
  note,
  week,
  today: now,
  markets,
}: {
  note: NoteList;
  week: IsoDate;
  today: IsoDate;
  /** The supermarkets a supermarket note is taken to, the main one first. */
  markets: Shop[];
}) {
  const lines = note.view.groups.flatMap((group) => group.lines);
  const more = lines.length - PREVIEW;
  return (
    <Link
      href={`/einkauf?w=${week}&zettel=${note.id}`}
      className="sheet lift relative flex h-full min-h-56 flex-col"
      aria-label={`${PLACE_NAME[note.trip.place]}, ${whenText(note.trip)}: ${
        note.completed ? "erledigt" : `${note.open} offen`
      }`}
    >
      <SheetHoles />
      <span className={`flex flex-1 flex-col px-4 pt-3 pb-4 ${note.completed ? "done-note" : ""}`}>
        <NoteHead note={note} today={now} markets={markets} />
        <span className="mt-3 block flex-1 text-[0.95rem]">
          {lines.slice(0, PREVIEW).map((entry) => (
            <span
              key={entry.line.key}
              className={`block truncate border-b border-rule py-1 ${
                entry.checked ? "text-muted line-through" : ""
              }`}
            >
              {entry.text}
            </span>
          ))}
          {lines.length === 0 && (
            <span className="block py-1 text-muted">
              {note.trip.place === "drugstore" ? "Noch nichts notiert" : "Nichts zu kaufen"}
            </span>
          )}
        </span>
        <span className="mt-2 flex items-baseline justify-between gap-3 text-sm text-muted">
          <span>{more > 0 ? `und ${more} weitere` : ""}</span>
          {lines.length > 0 && (
            <span className="tabular-nums">
              {note.open} offen{note.done > 0 ? `, ${note.done} erledigt` : ""}
            </span>
          )}
        </span>
      </span>
      {note.completed && <Stamp by={note.completed.by} />}
    </Link>
  );
}

/** The stamp on an errand that is done, with the name of whoever did it. */
function Stamp({ by }: { by: string | null }) {
  return (
    <span className="stamp">
      <span className="flex items-center gap-1.5 text-lg font-bold">
        <TickIcon />
        Erledigt
      </span>
      {by && <span className="block text-sm">von {by}</span>}
    </span>
  );
}
