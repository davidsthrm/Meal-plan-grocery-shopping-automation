import type { Metadata } from "next";
import Link from "next/link";
import { NoteIcon, TickIcon } from "@/components/icons";
import { PictogramIcon } from "@/components/pictogram";
import { PrintButton } from "@/components/print-button";
import { SheetHoles } from "@/components/sheet-holes";
import { SubmitButton } from "@/components/submit-button";
import type { CatalogIndex } from "@/domain/catalog";
import {
  addDays,
  isIsoDate,
  mondayOf,
  planningWeek,
  weekRange,
  type IsoDate,
} from "@/domain/dates";
import { dayProblems } from "@/domain/shopping-list/change-day";
import { DRUGSTORE_ITEMS, FOR_WHOM_MAX, QUANTITY_MAX } from "@/domain/shopping-list/drugstore";
import type { ViewLine } from "@/domain/shopping-list/present";
import { noteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import {
  coversText,
  dayName,
  dayTitle,
  exactText,
  neededText,
  noteName,
  PLACE_LOOK,
  PLACE_NAME,
  problemText,
  sourceText,
  whenText,
} from "@/lib/list-text";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { chosenShop, loadShoppingNotes, type NoteList } from "@/server/shopping/list";
import { loadRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";
import {
  addDrugstoreEntry,
  addListEntry,
  changeNoteDay,
  checkLine,
  completeListNote,
  markAtHome,
  moveListLine,
  noteLine,
  removeListEntry,
} from "./actions";

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
  const [{ notes, atHome, index, members }, noted] = await Promise.all([
    loadShoppingNotes(db, household, week),
    loadRestock(db, household, now),
  ]);
  const picked = notes.find((note) => note.id === one(params.zettel));

  if (picked) {
    // A line can be moved to every other note of the week that sells food. The drugstore's
    // note is written by hand and keeps what is written on it.
    const others =
      picked.trip.place === "drugstore"
        ? []
        : notes
            .map((note) => note.trip)
            .filter((trip) => noteId(trip) !== picked.id && trip.place !== "drugstore");
    return (
      <div className="mx-auto max-w-3xl">
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
        />
      </div>
    );
  }

  const open = notes.reduce((sum, note) => sum + note.open, 0);
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
          Für diese Woche steht noch nichts auf den Einkaufszetteln. Sie füllen sich aus dem{" "}
          <Link href={`/woche?w=${week}`} className="link underline">
            Wochenplan
          </Link>
          .
        </p>
      )}

      <ul aria-label="Zettel" className="tiles mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((note) => (
          <li key={note.id}>
            <NoteTile note={note} week={week} today={now} />
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

      {atHome.length > 0 && (
        <details className="card mt-8 px-4 py-2">
          <summary className="flex min-h-11 items-center justify-between gap-3 font-semibold">
            <span>Haben wir schon</span>
            <span className="text-sm font-normal text-muted tabular-nums">{atHome.length}</span>
          </summary>
          <p className="text-sm text-muted">
            Wird für die Woche gebraucht, steht aber auf keinem Zettel.
          </p>
          <ul className="mt-2 gap-x-10 sm:columns-2 lg:columns-3">
            {atHome.map(({ trip, line }) => (
              <li
                key={`${noteId(trip)}|${line.line.key}`}
                className="flex break-inside-avoid items-center justify-between gap-3 border-b border-rule py-1"
              >
                <span className="min-w-0">
                  {line.text}
                  <span className="text-sm text-muted"> · {noteName(trip)}</span>
                </span>
                <form action={markAtHome}>
                  <input type="hidden" name="week" value={week} />
                  <input type="hidden" name="note" value={noteId(trip)} />
                  <input type="hidden" name="back" value="all" />
                  <input type="hidden" name="key" value={line.line.key} />
                  <input type="hidden" name="atHome" value="0" />
                  <SubmitButton
                    className="link min-h-10 text-sm whitespace-nowrap"
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
    </div>
  );
}

/** The heading every note has: where, and when. */
function NoteHead({ note, today: now }: { note: NoteList; today?: IsoDate }) {
  const { trip } = note;
  const look = PLACE_LOOK[trip.place];
  return (
    <span className={`flex items-center gap-3 ${look.tone}`}>
      <span className="badge size-11">
        <PictogramIcon name={look.pictogram} className="h-[66%] w-[66%]" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-bold tracking-tight">
          {PLACE_NAME[trip.place]}
        </span>
        <span className="block text-sm font-normal text-muted print:text-black">
          {now && trip.date === now ? "Heute" : whenText(trip)}
        </span>
      </span>
    </span>
  );
}

/** A note as it lies among the others: its heading, its first lines, and how much is open. */
function NoteTile({ note, week, today: now }: { note: NoteList; week: IsoDate; today: IsoDate }) {
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
        <NoteHead note={note} today={now} />
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

/** The fields that say which note of which week a form on the note is about. */
function Where({ week, note }: { week: IsoDate; note: string }) {
  return (
    <>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="note" value={note} />
      <input type="hidden" name="back" value="note" />
    </>
  );
}

/** A note picked up: every line, to tick, to annotate, and to move to another note. */
function NoteSheet({
  note,
  week,
  index,
  others,
  today: now,
  members,
}: {
  note: NoteList;
  week: IsoDate;
  index: CatalogIndex;
  /** The notes a line can be moved to. */
  others: ShoppingTrip[];
  today: IsoDate;
  /** Whom a line on the drugstore's note can be for. */
  members: string[];
}) {
  const { trip, view } = note;
  const drugstore = trip.place === "drugstore";
  const covers = coversText(view);
  // The errand on another day: which of the days around it would work, and why the others
  // would not.
  const lines = view.groups.flatMap((group) => group.lines).map((entry) => entry.line);
  const days = [-3, -2, -1, 1, 2, 3]
    .map((offset) => addDays(trip.date, offset))
    .map((day) => ({ day, problems: dayProblems(lines, day, now, index) }));
  return (
    <section
      aria-label={`${PLACE_NAME[trip.place]}, ${whenText(trip)}`}
      className="sheet zoom-in mt-4"
    >
      <SheetHoles />
      <div className="px-4 pt-4 pb-5 sm:px-6 print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1>
            <NoteHead note={note} />
          </h1>
          {note.open + note.done > 0 && (
            <p className="text-sm text-muted tabular-nums print:hidden">
              {note.open} offen{note.done > 0 ? `, ${note.done} erledigt` : ""}
            </p>
          )}
        </div>
        {covers !== "" && <p className="mt-2 text-sm text-muted print:text-black">{covers}</p>}
        {note.completed && (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 font-semibold text-accent print:hidden"
          >
            <TickIcon />
            Erledigt{note.completed.by ? ` von ${note.completed.by}` : ""}
          </p>
        )}
        {view.groups.length === 0 && (
          <p className="mt-4 text-muted print:hidden">
            {drugstore
              ? "Noch nichts notiert. Was aus der Drogerie gebraucht wird, kommt von Hand hierher."
              : "Nichts zu kaufen."}
          </p>
        )}

        <div className="mt-4 gap-x-10 sm:columns-2 print:columns-2">
          {view.groups.map(({ aisleGroup, lines }) => (
            <section
              key={aisleGroup.id}
              aria-label={aisleGroup.name}
              className="mb-5 break-inside-avoid-column"
            >
              <h2 className="eyebrow print:font-bold print:text-black">{aisleGroup.name}</h2>
              <ul className="ruled mt-1">
                {lines.map((line) => (
                  <Line
                    key={line.line.key}
                    view={line}
                    week={week}
                    note={trip}
                    shop={chosenShop(index, line)}
                    others={others}
                    drugstore={drugstore}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        {drugstore ? (
          <DrugstoreForm week={week} note={note.id} members={members} />
        ) : (
          <>
            <form action={addListEntry} className="mt-2 flex gap-2 print:hidden">
              <Where week={week} note={note.id} />
              <label className="flex-1">
                <span className="sr-only">Auf den Zettel schreiben</span>
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
            <datalist id="zutaten">
              {index.catalog.ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.name} />
              ))}
            </datalist>
          </>
        )}

        {note.open > 0 && (
          <form action={completeListNote} className="mt-5 print:hidden">
            <Where week={week} note={note.id} />
            <SubmitButton className="btn btn-primary w-full sm:w-auto">
              <TickIcon />
              Einkauf erledigt
            </SubmitButton>
          </form>
        )}

        {lines.length > 0 && !drugstore && (
          <details className="mt-3 print:hidden">
            <summary className="link inline-flex min-h-10 items-center">
              An einem anderen Tag einkaufen
            </summary>
            <div
              className="mt-1 flex flex-wrap gap-2"
              role="group"
              aria-label="Geht an diesen Tagen"
            >
              {days
                .filter((option) => option.problems.length === 0)
                .map(({ day }) => (
                  <form key={day} action={changeNoteDay}>
                    <Where week={week} note={note.id} />
                    <input type="hidden" name="day" value={day} />
                    <SubmitButton
                      className="chip"
                      label={`Einkauf verlegen auf ${dayTitle({ date: day })}`}
                    >
                      {dayName(day)}
                    </SubmitButton>
                  </form>
                ))}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {days
                .filter((option) => option.problems.length > 0)
                .map(({ day, problems }) => (
                  <li key={day}>
                    <span className="font-semibold text-ink">{dayName(day)} geht nicht:</span>{" "}
                    {problemText(problems[0])}
                    {problems.length > 1 &&
                      ` Dasselbe gilt für ${problems.length - 1} ${
                        problems.length === 2 ? "weitere Zeile" : "weitere Zeilen"
                      }.`}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * Writing on the drugstore's note: what, with typical drugstore items suggested while typing,
 * how many, and for whom if it is for someone in particular.
 */
function DrugstoreForm({
  week,
  note,
  members,
}: {
  week: IsoDate;
  note: string;
  members: string[];
}) {
  return (
    <form
      action={addDrugstoreEntry}
      className="mt-2 grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_10rem_auto] print:hidden"
    >
      <Where week={week} note={note} />
      <label>
        <span className="label">Was</span>
        <input
          name="item"
          required
          maxLength={80}
          list="drogerie"
          autoComplete="off"
          className="field"
          placeholder="z. B. Duschgel"
        />
      </label>
      <label>
        <span className="label">Menge</span>
        <input
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={QUANTITY_MAX}
          defaultValue={1}
          className="field"
        />
      </label>
      <label className="col-span-2 sm:col-span-1">
        <span className="label">Für wen</span>
        <input
          name="forWhom"
          maxLength={FOR_WHOM_MAX}
          list="familie"
          autoComplete="off"
          className="field"
          placeholder="optional"
        />
      </label>
      <SubmitButton className="btn col-span-2 self-end sm:col-span-1">Hinzufügen</SubmitButton>
      <datalist id="drogerie">
        {DRUGSTORE_ITEMS.map((item) => (
          <option key={item.name} value={item.name} />
        ))}
      </datalist>
      <datalist id="familie">
        {members.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </form>
  );
}

/** One line of a note: a box to tick, the text, and behind it where it comes from. */
function Line({
  view,
  week,
  note,
  shop,
  others,
  drugstore,
}: {
  view: ViewLine;
  week: IsoDate;
  note: ShoppingTrip;
  /** The shop, where the line names one on purpose. */
  shop: string | null;
  others: ShoppingTrip[];
  /** A line of the drugstore's note: written by hand, nothing to add to it but its removal. */
  drugstore: boolean;
}) {
  const { line } = view;
  const here = noteId(note);
  const where = (
    <>
      <Where week={week} note={here} />
      <input type="hidden" name="key" value={line.key} />
    </>
  );
  const exact = exactText(view);
  const typed = line.contributions.flatMap((entry) =>
    entry.source.type === "manual" ? [{ id: entry.source.entryId, text: entry.originalText }] : [],
  );
  // The notes the parts of the line would be on by themselves: a moved part is told apart.
  const origins = [...new Set(line.contributions.map((entry) => noteId(entry.origin ?? note)))];
  const needed = line.trip === "later" ? neededText(view) : "";

  return (
    <li className="flex items-start gap-3 print:gap-2 print:py-0.5">
      <form action={checkLine} className="print:hidden">
        {where}
        <input type="hidden" name="checked" value={view.checked ? "0" : "1"} />
        <SubmitButton
          className="tickbox"
          label={`${view.text}: ${view.checked ? "wieder offen" : "erledigt"}`}
          on={view.checked}
        >
          <TickIcon />
        </SubmitButton>
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
          </span>
        </summary>
        <div className="mt-1 mb-2 space-y-3 rounded-lg bg-accent-soft/50 p-3 text-sm print:hidden">
          {/* The day is said here, not on the line: on every line it was too much. */}
          {needed !== "" && <p className="font-semibold">Gebraucht {needed}</p>}
          {exact !== "" && <p>Genau: {exact}</p>}
          <ul className="text-muted">
            {line.contributions.map((entry, at) => (
              <li key={at}>
                {sourceText(entry)}
                {entry.origin && noteId(entry.origin) !== here && (
                  <> · verschoben von {noteName(entry.origin)}</>
                )}
              </li>
            ))}
          </ul>
          {!drugstore && (
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
          )}
          <div className="flex flex-wrap gap-2">
            {!drugstore && (
              <form action={markAtHome}>
                {where}
                <input type="hidden" name="atHome" value="1" />
                <SubmitButton className="btn btn-small" label={`${line.label} haben wir schon`}>
                  Haben wir schon
                </SubmitButton>
              </form>
            )}
            {typed.map((entry) => (
              <form key={entry.id} action={removeListEntry}>
                <Where week={week} note={here} />
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
          {others.length > 0 && (
            <div role="group" aria-label={`${line.label} verschieben`}>
              <p className="mb-1.5 text-muted">Lieber woanders kaufen:</p>
              <div className="flex flex-wrap gap-2">
                {others.map((other) => (
                  <form key={noteId(other)} action={moveListLine}>
                    {where}
                    <input type="hidden" name="origins" value={origins.join(",")} />
                    <input type="hidden" name="to" value={noteId(other)} />
                    <SubmitButton
                      className="chip min-h-9 text-sm"
                      label={`${line.label} verschieben: ${noteName(other)}`}
                    >
                      {noteName(other)}
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
