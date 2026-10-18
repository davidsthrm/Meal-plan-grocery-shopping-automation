import { TickIcon } from "@/components/icons";
import { PictogramIcon } from "@/components/pictogram";
import { SheetHoles } from "@/components/sheet-holes";
import { ShopLogo } from "@/components/shop-logo";
import { StoreView, type StoreNote } from "@/components/store-view";
import { SubmitButton } from "@/components/submit-button";
import {
  CompleteNote,
  SyncStatus,
  TickButton,
  TickCount,
  TickRefresh,
  type NotePage,
} from "@/components/ticks";
import type { AisleGroup, CatalogIndex, Shop } from "@/domain/catalog";
import { addDays, type IsoDate } from "@/domain/dates";
import { quantityText } from "@/domain/quantity";
import { dayProblems } from "@/domain/shopping-list/change-day";
import { DRUGSTORE_ITEMS, FOR_WHOM_MAX, QUANTITY_MAX } from "@/domain/shopping-list/drugstore";
import { lineOnNote } from "@/domain/shopping-list/duplicates";
import { formatPurchase } from "@/domain/shopping-list/format";
import type { ViewLine } from "@/domain/shopping-list/present";
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
  buyAtSupermarket,
  changeNoteDay,
  markAtHome,
  moveListLine,
  noteLine,
  kindOfEntry,
  removeListEntry,
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

/** Where a line is also on another note, and whether it can be bought there instead. */
interface Elsewhere {
  trip: ShoppingTrip;
  /** Buying it there is too late or would not keep: then it is only said. */
  movable: boolean;
}

/** A note picked up: every line, to tick, to annotate, and to move to another note. */
export function NoteSheet({
  note,
  week,
  index,
  others,
  today: now,
  members,
  supermarkets,
  alsoOn,
  renderedAt,
}: {
  note: NoteList;
  week: IsoDate;
  index: CatalogIndex;
  /** The notes a line can be moved to. */
  others: ShoppingTrip[];
  today: IsoDate;
  /** Whom a line on the drugstore's note can be for. */
  members: string[];
  /** The household's supermarkets, the main one first. */
  supermarkets: Shop[];
  /** The other notes of the week each line is on too (`lineOnNote`). */
  alsoOn: ReadonlyMap<string, ShoppingTrip[]>;
  /** When the server drew the page, by its clock: ticks of this device after it count more. */
  renderedAt: number;
}) {
  const { trip, view } = note;
  const page: NotePage = { week, note: note.id, renderedAt };
  const pageLines = view.groups
    .flatMap((group) => group.lines)
    .map((entry) => ({ key: entry.line.key, checked: entry.checked }));
  const drugstore = trip.place === "drugstore";
  const covers = coversText(view);
  // The kinds of grocery a typed line the catalog does not know can be put under.
  const kinds = [...index.aisleGroupById.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  // The errand on another day: which of the days around it would work, and why the others
  // would not.
  const lines = view.groups.flatMap((group) => group.lines).map((entry) => entry.line);
  const days = [-3, -2, -1, 1, 2, 3]
    .map((offset) => addDays(trip.date, offset))
    .map((day) => ({ day, problems: dayProblems(lines, day, now, index) }));
  // A supermarket note has a section per supermarket where the household moved something
  // to another one. Everything else is one walk through one shop.
  const favourites = trip.place === "supermarket" ? supermarkets : [];
  const sections = sectionsByShop(view, favourites);
  const named = sections.some((section) => section.shop && section.shop !== favourites[0]);
  const markets = marketsOfNote(view, favourites);
  // The same note for the shop: large rows, nothing but ticking.
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
        lines: entries.map((entry) => ({
          key: entry.line.key,
          checked: entry.checked,
          text: entry.text,
          shop: chosenShop(index, entry),
        })),
      })),
    })),
  };
  const elsewhere = (entry: ViewLine): Elsewhere[] =>
    (alsoOn.get(lineOnNote(trip, entry.line.key)) ?? []).map((other) => ({
      trip: other,
      movable: dayProblems([entry.line], other.date, now, index).length === 0,
    }));

  return (
    <section
      aria-label={`${PLACE_NAME[trip.place]}, ${whenText(trip)}`}
      className="sheet zoom-in mt-4 print:mt-0"
    >
      <SheetHoles />
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
                        week={week}
                        page={page}
                        note={trip}
                        shop={chosenShop(index, line)}
                        others={others}
                        drugstore={drugstore}
                        elsewhere={elsewhere(line)}
                        supermarkets={favourites}
                        kinds={kinds}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        ))}

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
  page,
  note,
  shop,
  others,
  drugstore,
  elsewhere,
  supermarkets,
  kinds,
}: {
  view: ViewLine;
  week: IsoDate;
  page: NotePage;
  note: ShoppingTrip;
  /** The shop, where the line names one on purpose. */
  shop: string | null;
  others: ShoppingTrip[];
  /** A line of the drugstore's note: written by hand, nothing to add to it but its removal. */
  drugstore: boolean;
  /** The other notes of the week the same thing is on. */
  elsewhere: Elsewhere[];
  /** The supermarkets the line can be bought at, the main one first. Empty elsewhere. */
  supermarkets: Shop[];
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
  // The notes the parts of the line would be on by themselves: a moved part is told apart.
  const origins = [...new Set(line.contributions.map((entry) => noteId(entry.origin ?? note)))];
  const needed = line.trip === "later" ? neededText(view) : "";
  const planned = line.purchase ? formatPurchase(line.purchase) : "ohne Menge";
  // A line only written by hand has no plan behind it: its amount is what was written.
  const written = typed.length > 0 && typed.length === line.contributions.length;
  const origin = written ? "Geschrieben" : "Plan";
  // The amount can be written in the line's own unit and a few common ones.
  const units = [...new Set([...(view.purchase ? [view.purchase.unit] : []), ...AMOUNT_UNITS])];
  const boughtAt = supermarketOf(view, supermarkets);

  return (
    <li className="tick-line flex items-start gap-3 print:gap-2 print:py-0.5">
      <TickButton
        page={page}
        line={{ key: line.key, checked: view.checked }}
        label={view.text}
        className="print:hidden"
      />
      <span aria-hidden className="mt-1 hidden size-3 shrink-0 border border-black print:block" />
      <div className="min-w-0 flex-1">
        <details>
          <summary className="tick-text flex min-h-10 items-center py-1 print:min-h-0 print:py-0">
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
          <div className="mt-1 mb-2 grid gap-x-6 gap-y-3 rounded-lg bg-accent-soft/50 p-3 text-sm sm:grid-cols-2 print:hidden">
            <div className="space-y-1">
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
            </div>
            {!drugstore && (
              <div className="space-y-2">
                <form action={amountLine} className="flex flex-wrap items-center gap-2">
                  {where}
                  <input
                    name="quantity"
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={8}
                    defaultValue={quantityText(view.purchase?.quantity ?? null)}
                    className="field w-20"
                    aria-label={`Menge von ${line.label}`}
                    placeholder="Menge"
                  />
                  <select
                    name="unit"
                    defaultValue={view.purchase?.unit ?? "Stück"}
                    className="field w-28"
                    aria-label={`Einheit von ${line.label}`}
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                  <SubmitButton className="btn btn-small">Menge ändern</SubmitButton>
                </form>
                {view.edited && (
                  <form action={amountLine}>
                    {where}
                    <input type="hidden" name="reset" value="1" />
                    <SubmitButton className="link min-h-9">
                      {written ? "Wie geschrieben" : "Wie geplant"}: {planned}
                    </SubmitButton>
                  </form>
                )}
                <form action={noteLine} className="flex gap-2">
                  {where}
                  <label className="flex-1">
                    <span className="sr-only">Notiz zu {line.label}</span>
                    {/* Not "note": that field names the shopping note the form belongs to. */}
                    <input
                      name="text"
                      defaultValue={view.note ?? ""}
                      maxLength={80}
                      className="field"
                      placeholder="Notiz, z. B. Marke oder Angebot"
                    />
                  </label>
                  <SubmitButton className="btn btn-small">Merken</SubmitButton>
                </form>
                {/* Typed, and unknown to the catalog: it stood under "Sonstiges" until the
                    household said what it is. The same text written again goes there too. */}
                {line.ingredientId === null && typed.length > 0 && (
                  <form action={kindOfEntry} className="flex gap-2">
                    {where}
                    <input type="hidden" name="entry" value={typed[0].id} />
                    <label className="flex flex-1 items-center gap-2">
                      <span className="shrink-0 text-muted">Gehört zu</span>
                      <select name="kind" defaultValue={line.aisleGroupId} className="field">
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
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              {!drugstore && (
                <form action={markAtHome}>
                  {where}
                  <input type="hidden" name="atHome" value="1" />
                  <SubmitButton className="btn btn-small" label={`${line.label} haben wir schon`}>
                    Haben wir schon
                  </SubmitButton>
                </form>
              )}
              {/* Another of the household's supermarkets for this week: a button like the
                  others, with the market's logo. */}
              {supermarkets.length > 1 &&
                supermarkets
                  .filter((market) => market.id !== boughtAt?.id)
                  .map((market) => (
                    <form key={market.id} action={buyAtSupermarket}>
                      {where}
                      <input type="hidden" name="shop" value={market.id} />
                      <SubmitButton
                        className="btn btn-small gap-2 pl-2"
                        label={`${line.label} bei ${market.name} kaufen`}
                      >
                        <ShopLogo shop={market} size={22} />
                        Bei {market.name} kaufen
                      </SubmitButton>
                    </form>
                  ))}
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
              <div
                role="group"
                aria-label={`${line.label} verschieben`}
                className="flex flex-wrap items-center gap-2 sm:col-span-2"
              >
                <span className="text-muted">Lieber woanders kaufen:</span>
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
            )}
          </div>
        </details>
        {/* The same thing on another note of the week: said, and bought there in one go
            where that is not too late. */}
        {elsewhere.length > 0 && !view.checked && (
          <ul className="-mt-1 mb-1 space-y-0.5 text-sm text-muted print:hidden">
            {elsewhere.map((other) => (
              <li key={noteId(other.trip)} className="flex flex-wrap items-center gap-x-2">
                <span>Auch auf: {noteName(other.trip)}</span>
                {other.movable && (
                  <form action={moveListLine}>
                    {where}
                    <input type="hidden" name="origins" value={origins.join(",")} />
                    <input type="hidden" name="to" value={noteId(other.trip)} />
                    <SubmitButton
                      className="link min-h-9 text-sm"
                      label={`${line.label} mit ${noteName(other.trip)} kaufen`}
                    >
                      Dort mitkaufen
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
