import { TickIcon } from "@/components/icons";
import {
  ActionRow,
  LineActions,
  MovedAwayRow,
  NotBoughtRow,
  type ActionLine,
} from "@/components/line-actions";
import { PictogramIcon } from "@/components/pictogram";
import { SheetHoles } from "@/components/sheet-holes";
import { ShopLogo } from "@/components/shop-logo";
import { StoreView, type StoreNote } from "@/components/store-view";
import { SubmitButton } from "@/components/submit-button";
import {
  CompleteNote,
  SyncStatus,
  TickCount,
  TickRefresh,
  type NotePage,
} from "@/components/ticks";
import type { AisleGroup, CatalogIndex, Shop } from "@/domain/catalog";
import { addDays, type IsoDate } from "@/domain/dates";
import { quantityText } from "@/domain/quantity";
import { blocks, dayProblems, lineWindow, noteDays } from "@/domain/shopping-list/change-day";
import { decisionOf, plannedOf } from "@/domain/shopping-list/decisions";
import { DRUGSTORE_ITEMS, FOR_WHOM_MAX, QUANTITY_MAX } from "@/domain/shopping-list/drugstore";
import { formatAmount, formatPurchase } from "@/domain/shopping-list/format";
import type { ViewLine } from "@/domain/shopping-list/present";
import {
  choiceOf,
  itemKey,
  suggestShops,
  type PastChoice,
  type ShopChoice,
} from "@/domain/shopping-list/shop-choice";
import {
  marketsOfNote,
  namesText,
  sectionsByShop,
  supermarketOf,
} from "@/domain/shopping-list/supermarkets";
import { noteId, type ShoppingTrip } from "@/domain/shopping-list/trips";
import type { Unit } from "@/domain/units";
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
import { chosenShop, type NoteList } from "@/server/shopping/list";
import {
  addDrugstoreEntry,
  addListEntry,
  amountLine,
  changeNoteDay,
  markAtHome,
  noteLine,
  kindOfEntry,
  putAwayListNote,
} from "./actions";

/** The heading every note has: where, and when. */
export function NoteHead({
  note,
  today: now,
  markets = [],
}: {
  note: NoteList;
  today?: IsoDate;
  /**
   * The supermarkets a supermarket note is taken to, the main one first (`marketsOfNote`):
   * their logos and names stand there instead of the cart and "Supermarkt", "Aldi & Rewe".
   */
  markets?: Shop[];
}) {
  const { trip } = note;
  const look = PLACE_LOOK[trip.place];
  const shops = trip.place === "supermarket" ? markets : [];
  return (
    <span className={`flex items-center gap-3 ${look.tone}`}>
      {shops.length > 0 ? (
        <span className="flex shrink-0 -space-x-2 print:hidden">
          {shops.slice(0, 3).map((shop) => (
            <ShopLogo key={shop.id} shop={shop} size={shops.length > 1 ? 36 : 44} />
          ))}
        </span>
      ) : (
        <span className="badge size-11 print:hidden">
          <PictogramIcon name={look.pictogram} className="h-[66%] w-[66%]" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-bold tracking-tight">
          {shops.length > 0 ? namesText(shops.map((shop) => shop.name)) : PLACE_NAME[trip.place]}
        </span>
        <span className="block text-sm font-normal text-muted print:text-black">
          {now && trip.date === now ? "Heute" : whenText(trip)}
        </span>
      </span>
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

/** The units an amount can be written in by hand, the line's own first. */
const AMOUNT_UNITS: readonly Unit[] = ["Stück", "g", "kg", "ml", "l", "Bund", "Packung"];

/** What a row's actions need to know of a line: the plan, the shops to offer, the units. */
interface RowContext {
  trip: ShoppingTrip;
  index: CatalogIndex;
  supermarkets: Shop[];
  choices: ShopChoice[];
  history: ReadonlyMap<string, PastChoice[]>;
}

export function actionLineOf(view: ViewLine, context: RowContext): ActionLine {
  const { trip, index, supermarkets, choices, history } = context;
  const item = itemKey(view.line);
  const stands = choiceOf(
    trip.place,
    trip.place === "supermarket" ? (supermarketOf(view, supermarkets)?.id ?? null) : null,
    choices,
  );
  const { suggested, others } = suggestShops(view.line, choices, history.get(item) ?? [], index);
  return {
    key: view.line.key,
    checked: view.checked,
    decision: decisionOf(view),
    label: view.line.label,
    text: view.text,
    purchase: view.purchase,
    units: [...new Set([...(view.purchase ? [view.purchase.unit] : []), ...AMOUNT_UNITS])],
    about: { planned: plannedOf(view, trip), item, shop: stands?.id ?? null },
    suggested: suggested.map((choice) => choice.id),
    others: others.map((choice) => choice.id),
    movable: trip.place !== "drugstore",
    window: lineWindow(view.line, index),
    hint: chosenShop(index, view),
  };
}

/** A note picked up: every line, to tick, to annotate, and to move to another note. */
export function NoteSheet({
  note,
  week,
  index,
  today: now,
  members,
  supermarkets,
  renderedAt,
  choices,
  history,
}: {
  note: NoteList;
  week: IsoDate;
  index: CatalogIndex;
  /** Every shop a line can be moved to, and where the household bought what before. */
  choices: ShopChoice[];
  history: ReadonlyMap<string, PastChoice[]>;
  today: IsoDate;
  /** Whom a line on the drugstore's note can be for. */
  members: string[];
  /** The household's supermarkets, the main one first. */
  supermarkets: Shop[];
  /** When the server drew the page, by its clock: ticks of this device after it count more. */
  renderedAt: number;
}) {
  const { trip, view } = note;
  const page: NotePage = { week, note: note.id, renderedAt };
  const pageLines = view.groups
    .flatMap((group) => group.lines)
    .map((entry) => ({ key: entry.line.key, checked: entry.checked, decision: decisionOf(entry) }));
  const drugstore = trip.place === "drugstore";
  const covers = coversText(view);
  // The kinds of grocery a typed line the catalog does not know can be put under.
  const kinds = [...index.aisleGroupById.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  // The errand on another day, earlier or later: which days work, which would leave
  // something too long before its meal (said, not stopped), and why the others do not.
  const lines = view.groups.flatMap((group) => group.lines).map((entry) => entry.line);
  const days = noteDays(trip.date, now).map((day) => {
    const problems = dayProblems(lines, { date: day, place: trip.place }, now, index);
    return {
      day,
      blocked: problems.filter(blocks),
      warned: problems.filter((problem) => !blocks(problem)),
    };
  });
  // A supermarket note has a section per supermarket where the household moved something
  // to another one. Everything else is one walk through one shop.
  const favourites = trip.place === "supermarket" ? supermarkets : [];
  const sections = sectionsByShop(view, favourites);
  const named = sections.some((section) => section.shop && section.shop !== favourites[0]);
  const markets = marketsOfNote(view, favourites);
  // What the actions of a row need, on the note and in the view for the shop alike.
  const context: RowContext = { trip, index, supermarkets: favourites, choices, history };
  const notBought = view.notBought.map((entry) => ({
    line: actionLineOf(entry.view, context),
    amount: entry.amount ? formatAmount(entry.amount) : null,
    reason: entry.view.removedReason,
  }));
  const moved = note.movedAway.map(({ line, to }) => ({
    line: {
      key: line.key,
      label: line.label,
      about: {
        planned: {
          name: line.label,
          quantity: line.purchase?.quantity ?? null,
          unit: line.purchase?.unit ?? null,
          date: trip.date,
          place: trip.place,
          shopId: null,
        },
        item: itemKey(line),
        shop: null,
      },
    },
    to,
  }));
  // The same note for the shop: large rows, a tap buys.
  const forShop: StoreNote = {
    title:
      markets.length > 0 ? namesText(markets.map((shop) => shop.name)) : PLACE_NAME[trip.place],
    when: whenText(trip),
    markets:
      trip.place === "supermarket"
        ? markets.map(({ id, name, logoUrl }) => ({ id, name, logoUrl }))
        : [],
    look: PLACE_LOOK[trip.place],
    sections: sections.map((section) => ({
      shop:
        named && section.shop
          ? { id: section.shop.id, name: section.shop.name, logoUrl: section.shop.logoUrl }
          : null,
      groups: section.groups.map(({ aisleGroup, lines: entries }) => ({
        name: aisleGroup.name,
        lines: entries.map((entry) => actionLineOf(entry, context)),
      })),
    })),
    notBought,
    moved,
  };

  return (
    <section
      aria-label={`${PLACE_NAME[trip.place]}, ${whenText(trip)}`}
      className="sheet zoom-in mt-4 print:mt-0"
    >
      <SheetHoles />
      <LineActions page={page} note={trip} today={now} choices={choices}>
        <div className="px-4 pt-4 pb-5 sm:px-6 print:p-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h1>
              <NoteHead note={note} markets={markets} />
            </h1>
            {pageLines.length > 0 && (
              <p className="text-sm text-muted tabular-nums print:hidden">
                <TickCount page={page} lines={pageLines} />
              </p>
            )}
          </div>
          {covers !== "" && <p className="mt-2 text-sm text-muted print:text-black">{covers}</p>}
          <TickRefresh />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
            <StoreView page={page} note={forShop} />
            <SyncStatus className="text-sm" />
          </div>
          {note.completed && (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-accent print:hidden"
            >
              <TickIcon />
              <span>
                <span className="block font-semibold">
                  Erledigt{note.completed.by ? ` von ${note.completed.by}` : ""}
                </span>
                {notBought.length > 0 && (
                  <span className="block text-sm text-ink">{notBoughtText(notBought.length)}</span>
                )}
              </span>
            </p>
          )}
          {view.groups.length === 0 && (
            <p className="mt-4 text-muted print:hidden">
              {drugstore
                ? "Noch nichts notiert. Was aus der Drogerie gebraucht wird, kommt von Hand hierher."
                : "Nichts zu kaufen."}
            </p>
          )}
          {/* Opened by hand and still empty: it can go again. */}
          {note.openedByHand && view.groups.length === 0 && notBought.length === 0 && (
            <form action={putAwayListNote} className="mt-2 print:hidden">
              <Where week={week} note={note.id} />
              <SubmitButton className="link min-h-11 text-sm">Leeren Zettel wegwerfen</SubmitButton>
            </form>
          )}

          {sections.map((section) => (
            <section
              key={section.shop?.id ?? "alle"}
              aria-label={named && section.shop ? section.shop.name : undefined}
              className="mt-4"
            >
              {named && section.shop && (
                <h2 className="mb-2 flex items-center gap-2 border-b border-line pb-1.5 text-base font-bold tracking-tight print:text-black">
                  <span className="print:hidden">
                    <ShopLogo shop={section.shop} size={32} />
                  </span>
                  {section.shop.name}
                </h2>
              )}
              {/* One column on screen, so that an opened line has the sheet's whole width;
                on paper the columns of `printRules`. */}
              <div className="note-columns gap-x-10">
                {section.groups.map(({ aisleGroup, lines }) => (
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
                          action={actionLineOf(line, context)}
                          week={week}
                          note={trip}
                          shop={chosenShop(index, line)}
                          drugstore={drugstore}
                          kinds={kinds}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          ))}

          {moved.length > 0 && (
            <section aria-label="Verschoben" className="mb-5 print:hidden">
              <h3 className="eyebrow">Verschoben</h3>
              <ul className="mt-1">
                {moved.map((entry) => (
                  <MovedAwayRow key={`${entry.line.key}-${noteId(entry.to)}`} {...entry} />
                ))}
              </ul>
            </section>
          )}

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

          <div className="mt-5 print:hidden">
            <CompleteNote page={page} lines={pageLines} />
          </div>

          {notBought.length > 0 && (
            <section aria-label="Nicht gekaufte Einträge" className="mt-6 print:hidden">
              <h2 className="text-base font-bold tracking-tight">Nicht gekaufte Einträge</h2>
              <ul className="mt-1">
                {notBought.map((entry) => (
                  <NotBoughtRow key={entry.line.key} {...entry} />
                ))}
              </ul>
            </section>
          )}

          {lines.length > 0 && !drugstore && (
            <details className="mt-3 print:hidden">
              <summary className="link inline-flex min-h-11 items-center">
                An einem anderen Tag einkaufen
              </summary>
              <div
                className="mt-1 flex flex-wrap gap-2"
                role="group"
                aria-label="Geht an diesen Tagen"
              >
                {days
                  .filter((option) => option.blocked.length === 0)
                  .map(({ day }) => (
                    <form key={day} action={changeNoteDay}>
                      <Where week={week} note={note.id} />
                      <input type="hidden" name="day" value={day} />
                      <SubmitButton
                        className="chip"
                        label={`Einkauf verlegen auf ${dayTitle({ date: day })}`}
                      >
                        {dayWord(day, now)}
                      </SubmitButton>
                    </form>
                  ))}
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {days.map(({ day, blocked, warned }) =>
                  blocked.length > 0 ? (
                    <li key={day}>
                      <span className="font-semibold text-ink">{dayName(day)} geht nicht:</span>{" "}
                      {problemText(blocked[0])}
                      {moreText(blocked.length)}
                    </li>
                  ) : warned.length > 0 ? (
                    <li key={day} className="text-warn">
                      <span className="font-semibold">{dayName(day)}:</span>{" "}
                      {problemText(warned[0])}
                      {moreText(warned.length)}
                    </li>
                  ) : null,
                )}
              </ul>
            </details>
          )}
        </div>
      </LineActions>
    </section>
  );
}

/** " Dasselbe gilt für 2 weitere Zeilen.", after the first of `count` problems of a day. */
function moreText(count: number): string {
  if (count < 2) return "";
  return ` Dasselbe gilt für ${count - 1} ${count === 2 ? "weitere Zeile" : "weitere Zeilen"}.`;
}

/** "Heute", "Morgen", or the day: a chip for doing the errand on another day. */
function dayWord(day: IsoDate, today: IsoDate): string {
  if (day === today) return "Heute";
  if (day === addDays(today, 1)) return "Morgen";
  return dayName(day);
}

/** "2 Einträge nicht gekauft". */
export function notBoughtText(count: number): string {
  return count === 1 ? "1 Eintrag nicht gekauft" : `${count} Einträge nicht gekauft`;
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

/**
 * One line of a note: a box to tick, the text, and behind it what it is for and what can be
 * changed about it. Moving it and "Haben wir schon" are the arrow and the shelf at the end
 * of the line, and only there: the same buttons once more in the opened line made it a wall
 * of buttons (October 2026).
 */
function Line({
  view,
  action,
  week,
  note,
  shop,
  drugstore,
  kinds,
}: {
  view: ViewLine;
  /** The line as its actions know it: shelf or bin, pen and arrow, swipe and the menu. */
  action: ActionLine;
  week: IsoDate;
  note: ShoppingTrip;
  /** The shop, where the line names one on purpose. */
  shop: string | null;
  /** A line of the drugstore's note: written by hand, nothing to add to it but its removal. */
  drugstore: boolean;
  /** The kinds of grocery, in the order of a walk through the shop. */
  kinds: AisleGroup[];
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
  const needed = line.trip === "later" ? neededText(view) : "";
  const planned = line.purchase ? formatPurchase(line.purchase) : "ohne Menge";
  // A line only written by hand has no plan behind it: its amount is what was written.
  const written = typed.length > 0 && typed.length === line.contributions.length;
  const origin = written ? "Geschrieben" : "Plan";
  // The amount can be written in the line's own unit and a few common ones.
  const units = [...new Set([...(view.purchase ? [view.purchase.unit] : []), ...AMOUNT_UNITS])];

  return (
    <ActionRow
      line={action}
      variant="note"
      // At home, a line is not bought: the shelf in place of the shop's bin. What the
      // drugstore's note holds is written by hand and has no "Haben wir schon".
      atHome={drugstore ? undefined : { action: markAtHome, fields: where }}
      removable={drugstore || written}
      className="print:py-0.5"
    >
      <details>
        <summary className="tick-text flex min-h-11 items-center py-1 print:min-h-0 print:py-0">
          <span>
            {view.text}
            {shop && <span className="text-sm text-muted print:text-black"> · {shop}</span>}
            {view.edited && (
              <span className="text-sm text-muted print:hidden">
                {" "}
                ({origin}: {planned})
              </span>
            )}
          </span>
        </summary>
        <div className="line-details mt-1 mb-2 rounded-lg bg-accent-soft/50 p-3 text-sm print:hidden">
          {(line.contributions.length > 0 || needed !== "" || exact !== "") && (
            <section aria-label="Wofür" className="space-y-1">
              {/* The day is said here, not on the line: on every line it was too much. */}
              {needed !== "" && <p className="font-semibold">Gebraucht {needed}</p>}
              <ul>
                {line.contributions.map((entry, at) => (
                  <li key={at}>
                    {sourceText(entry)}
                    {entry.origin && noteId(entry.origin) !== here && (
                      <span className="text-muted"> · verschoben von {noteName(entry.origin)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {exact !== "" && <p className="text-muted">Genau: {exact}</p>}
            </section>
          )}
          {!drugstore && (
            <div className="line-details-forms space-y-2">
              <form action={amountLine} className="detail-row">
                {where}
                <span className="detail-label">Menge</span>
                {/* Where the button does not fit beside them, it goes below. */}
                <span className="flex min-w-[10.5rem] flex-1 gap-2">
                  <input
                    name="quantity"
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={8}
                    defaultValue={quantityText(view.purchase?.quantity ?? null)}
                    className="field w-16 shrink-0"
                    aria-label={`Menge von ${line.label}`}
                  />
                  <select
                    name="unit"
                    defaultValue={view.purchase?.unit ?? "Stück"}
                    className="field min-w-0 flex-1"
                    aria-label={`Einheit von ${line.label}`}
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </span>
                <SubmitButton className="btn btn-small" label="Menge ändern">
                  Ändern
                </SubmitButton>
              </form>
              {view.edited && (
                <form action={amountLine} className="detail-row">
                  {where}
                  <input type="hidden" name="reset" value="1" />
                  <SubmitButton className="link min-h-11">
                    {written ? "Wie geschrieben" : "Wie geplant"}: {planned}
                  </SubmitButton>
                </form>
              )}
              <form action={noteLine} className="detail-row">
                {where}
                <label className="contents">
                  <span className="detail-label">Notiz</span>
                  {/* Not "note": that field names the shopping note the form belongs to. */}
                  <input
                    name="text"
                    defaultValue={view.note ?? ""}
                    maxLength={80}
                    className="field min-w-0 flex-1"
                    placeholder="z. B. Marke"
                    aria-label={`Notiz zu ${line.label}`}
                  />
                </label>
                <SubmitButton className="btn btn-small">Merken</SubmitButton>
              </form>
              {/* Typed, and unknown to the catalog: it stood under "Sonstiges" until the
                    household said what it is. The same text written again goes there too. */}
              {line.ingredientId === null && typed.length > 0 && (
                <form action={kindOfEntry} className="detail-row">
                  {where}
                  <input type="hidden" name="entry" value={typed[0].id} />
                  <label className="contents">
                    <span className="detail-label">Gehört zu</span>
                    <select
                      name="kind"
                      defaultValue={line.aisleGroupId}
                      className="field min-w-0 flex-1"
                    >
                      {kinds.map((kind) => (
                        <option key={kind.id} value={kind.id}>
                          {kind.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton className="btn btn-small">Einordnen</SubmitButton>
                </form>
              )}
            </div>
          )}
        </div>
      </details>
    </ActionRow>
  );
}
