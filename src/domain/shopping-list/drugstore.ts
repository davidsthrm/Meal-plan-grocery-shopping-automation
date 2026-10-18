import { normalizeName, type AisleGroup } from "../catalog";
import type { IsoDate } from "../dates";
import type { AisleView, ViewLine } from "./present";
import { byLabel, resolveLine } from "./present";
import { noteId, type ShoppingTrip } from "./trips";
import type { LineState, ShoppingLine } from "./types";

/**
 * The note for the drugstore (dm). The meal plan puts nothing on it: the household writes on
 * it what it needs, with a quantity and, if it likes, for whom. What is written is sorted
 * into the sections of a drugstore, so the note reads as one walk through the shop.
 */

/** The sections of a drugstore, in the order the note lists them. */
export const DRUGSTORE_SECTIONS = [
  { key: "koerper", name: "Körperpflege" },
  { key: "haare", name: "Haare" },
  { key: "zaehne", name: "Zähne" },
  { key: "gesicht", name: "Gesicht & Kosmetik" },
  { key: "hygiene", name: "Hygiene" },
  { key: "baby", name: "Baby & Kind" },
  { key: "gesundheit", name: "Gesundheit" },
  { key: "haushalt", name: "Haushalt" },
  { key: "sonstiges", name: "Sonstiges" },
] as const;
export type DrugstoreSection = (typeof DRUGSTORE_SECTIONS)[number]["key"];

/** A typical drugstore item: suggested while typing, and sorted into its section. */
export interface DrugstoreItem {
  name: string;
  section: DrugstoreSection;
  /** Other words for the same thing. */
  synonyms?: string[];
}

const item = (section: DrugstoreSection, name: string, ...synonyms: string[]): DrugstoreItem => ({
  name,
  section,
  synonyms,
});

/** What a household typically buys at the drugstore. */
export const DRUGSTORE_ITEMS: readonly DrugstoreItem[] = [
  item("koerper", "Duschgel", "Duschbad", "Duschcreme"),
  item("koerper", "Deo", "Deodorant", "Deoroller", "Deospray"),
  item("koerper", "Seife", "Handseife"),
  item("koerper", "Flüssigseife", "Seifenspender"),
  item("koerper", "Bodylotion", "Körperlotion", "Körpermilch"),
  item("koerper", "Handcreme"),
  item("koerper", "Rasierer", "Einwegrasierer"),
  item("koerper", "Rasierklingen", "Klingen"),
  item("koerper", "Rasierschaum", "Rasiergel"),
  item("koerper", "Badezusatz", "Badeschaum"),
  item("haare", "Shampoo", "Haarshampoo"),
  item("haare", "Spülung", "Haarspülung", "Conditioner"),
  item("haare", "Haarkur", "Haarmaske"),
  item("haare", "Haargel", "Gel"),
  item("haare", "Haarspray"),
  item("haare", "Haargummis", "Haargummi", "Zopfgummis"),
  item("haare", "Haarbürste", "Kamm"),
  item("zaehne", "Zahnpasta", "Zahncreme"),
  item("zaehne", "Kinderzahnpasta", "Kinderzahncreme"),
  item("zaehne", "Zahnbürste", "Zahnbürsten"),
  item("zaehne", "Aufsteckbürsten", "Zahnbürstenaufsätze", "Bürstenköpfe"),
  item("zaehne", "Zahnseide"),
  item("zaehne", "Interdentalbürsten"),
  item("zaehne", "Mundspülung", "Mundwasser"),
  item("gesicht", "Gesichtscreme", "Tagescreme", "Nachtcreme"),
  item("gesicht", "Sonnencreme", "Sonnenschutz", "Sonnenspray"),
  item("gesicht", "Lippenpflege", "Labello", "Lippenbalsam"),
  item("gesicht", "Abschminktücher"),
  item("gesicht", "Wattepads", "Wattepad"),
  item("gesicht", "Wattestäbchen"),
  item("gesicht", "Make-up", "Makeup"),
  item("gesicht", "Mascara", "Wimperntusche"),
  item("gesicht", "Nagellackentferner"),
  item("hygiene", "Tampons"),
  item("hygiene", "Binden"),
  item("hygiene", "Slipeinlagen"),
  item("baby", "Windeln", "Pampers"),
  item("baby", "Feuchttücher", "Feuchte Tücher"),
  item("baby", "Babycreme", "Wundschutzcreme"),
  item("baby", "Quetschies", "Quetschbeutel"),
  item("gesundheit", "Pflaster", "Pflasterstrips"),
  item("gesundheit", "Taschentücher", "Tempos"),
  item("gesundheit", "Vitamine", "Vitamintabletten"),
  item("gesundheit", "Magnesium"),
  item("gesundheit", "Nasenspray"),
  item("gesundheit", "Erkältungsbad"),
  item("gesundheit", "Halsbonbons"),
  item("gesundheit", "Kondome"),
  item("haushalt", "Waschmittel", "Flüssigwaschmittel", "Colorwaschmittel"),
  item("haushalt", "Weichspüler"),
  item("haushalt", "Spülmaschinentabs", "Tabs", "Geschirrspültabs"),
  item("haushalt", "Spülmittel"),
  item("haushalt", "Klarspüler"),
  item("haushalt", "Spülmaschinensalz", "Regeneriersalz"),
  item("haushalt", "Allzweckreiniger"),
  item("haushalt", "WC-Reiniger", "Klostein", "WC-Steine"),
  item("haushalt", "Glasreiniger"),
  item("haushalt", "Entkalker"),
  item("haushalt", "Schwämme", "Spülschwamm", "Schwamm"),
  item("haushalt", "Toilettenpapier", "Klopapier"),
  item("haushalt", "Küchenrolle", "Küchentücher"),
  item("haushalt", "Müllbeutel", "Mülltüten"),
  item("haushalt", "Gefrierbeutel"),
  item("haushalt", "Frischhaltefolie"),
  item("haushalt", "Alufolie"),
  item("haushalt", "Backpapier"),
  item("haushalt", "Batterien"),
];

/**
 * The section a written item belongs to. The longest known name or other word inside what was
 * written wins: "Kinderzahnpasta" is the children's one, "Zahnpasta sensitiv" is toothpaste.
 * What the list does not know is "Sonstiges".
 */
export function drugstoreSection(text: string): DrugstoreSection {
  const written = normalizeName(text);
  let best: { section: DrugstoreSection; length: number } | null = null;
  for (const entry of DRUGSTORE_ITEMS) {
    for (const name of [entry.name, ...(entry.synonyms ?? [])]) {
      const key = normalizeName(name);
      if (key !== "" && written.includes(key) && key.length > (best?.length ?? 0)) {
        best = { section: entry.section, length: key.length };
      }
    }
  }
  return best?.section ?? "sonstiges";
}

/** Whether something is bought at the drugstore: an item of its list, or one of its words. */
export function isDrugstoreItem(text: string): boolean {
  return drugstoreSection(text) !== "sonstiges";
}

/** A line written onto the drugstore note: what, how many, and for whom. */
export interface DrugstoreEntry {
  id: string;
  text: string;
  /** How many. Null when nobody said. */
  quantity: number | null;
  /** Who it is for: "Lena". Null when it is for everyone. */
  forWhom: string | null;
  /**
   * The note it was written on, where that is an earlier one: it was not bought then and
   * came along. Left out for an entry on its own note.
   */
  from?: ShoppingTrip;
}

/** How many, as it is written out: "zwei Zahnpasta", "eine Zahnbürste". */
const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einen: 1,
  eins: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fuenf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwoelf: 12,
};

/**
 * An entry as one line of text gives it, the way the Merkzettel holds it: a number in front
 * is how many, in digits or in words ("2 Zahnpasta", "2x Duschgel", "zwei Zahnpasta"), the
 * rest is what.
 */
export function drugstoreEntryFromText(text: string): { text: string; quantity: number | null } {
  const written = text.trim().replace(/\s+/g, " ");
  const match = /^(\d{1,2}|[a-zäöüß]+)\s*(?:x|×|mal|stück|stk\.?)?\s+(.+)$/i.exec(written);
  if (match) {
    const word = normalizeName(match[1]);
    const quantity = /^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word] ?? null);
    if (quantity !== null && quantity >= 1 && quantity <= QUANTITY_MAX) {
      return { text: match[2].trim(), quantity };
    }
  }
  return { text: written, quantity: null };
}

/**
 * What is still open on drugstore notes whose day is over, and so goes onto the next one:
 * nothing written there is forgotten because nobody went that week. `done` says whether the
 * entry was ticked on any of the notes it stood on.
 */
export function carriedOver(
  entries: readonly (DrugstoreEntry & { from: ShoppingTrip; done: boolean })[],
  today: IsoDate,
): DrugstoreEntry[] {
  return entries
    .filter((entry) => entry.from.date < today && !entry.done)
    .map(({ id, text, quantity, forWhom, from }) => ({ id, text, quantity, forWhom, from }));
}

/** The entries written on one drugstore note. */
export interface DrugstoreNote {
  trip: ShoppingTrip;
  entries: DrugstoreEntry[];
}

/**
 * The drugstore notes with what came along from earlier ones (`carriedOver`) first on
 * `target`. An entry that came along is no longer on the note it came from: where that
 * note lies in the same week, as when the household moved the drugstore's weekday from
 * Wednesday to Saturday, it would stand on both.
 */
export function bringAlong(
  notes: readonly DrugstoreNote[],
  target: ShoppingTrip,
  carried: readonly DrugstoreEntry[],
): DrugstoreNote[] {
  if (carried.length === 0) return [...notes];
  const along = new Set(carried.map((entry) => entry.id));
  const others = notes
    .filter((note) => noteId(note.trip) !== noteId(target))
    .map((note) => ({ ...note, entries: note.entries.filter((entry) => !along.has(entry.id)) }));
  const own = notes.find((note) => noteId(note.trip) === noteId(target))?.entries ?? [];
  return [...others, { trip: target, entries: [...carried, ...own] }];
}

/** The drugstore note open entries go to: the first one from today on. */
export function nextDrugstoreTrip(
  trips: readonly ShoppingTrip[],
  today: IsoDate,
): ShoppingTrip | null {
  return trips.find((trip) => trip.place === "drugstore" && trip.date >= today) ?? null;
}

/** The longest an item, and a name it is for, may be. */
export const DRUGSTORE_TEXT_MAX = 80;
export const FOR_WHOM_MAX = 40;
export const QUANTITY_MAX = 99;

/**
 * Reads what the form for the drugstore note sends. Null when no item was written. A
 * quantity that is no whole number from 1 to 99 counts as none.
 */
export function readDrugstoreEntry(form: {
  item: string;
  quantity: string;
  forWhom: string;
}): Omit<DrugstoreEntry, "id"> | null {
  // "2 Zahnpasta" typed as the item says how many as well as the field.
  const written = drugstoreEntryFromText(form.item);
  const text = written.text.slice(0, DRUGSTORE_TEXT_MAX);
  if (text === "") return null;
  const number = Number(form.quantity.trim());
  const asked = Number.isInteger(number) && number >= 1 && number <= QUANTITY_MAX ? number : null;
  const quantity = written.quantity !== null && (asked ?? 1) === 1 ? written.quantity : asked;
  const forWhom = form.forWhom.trim().replace(/\s+/g, " ").slice(0, FOR_WHOM_MAX);
  return { text, quantity, forWhom: forWhom === "" ? null : forWhom };
}

/** The id of a drugstore section as it stands in a line, apart from the catalog's groups. */
const sectionId = (section: DrugstoreSection) => `drogerie:${section}`;

/**
 * The lines of a drugstore note: one per entry, as written, with how many in front where it
 * is more than one and whom it is for behind ("2x Duschgel für Lena"). `shopId` is where a line without a catalog
 * ingredient is bought.
 */
export function drugstoreLines(
  entries: readonly DrugstoreEntry[],
  trip: ShoppingTrip,
  shopId: string,
): ShoppingLine[] {
  return entries.map((entry) => ({
    key: `manual:${entry.id}`,
    ingredientId: null,
    label: entry.text,
    forms: null,
    shoppingDate: trip.date,
    place: trip.place,
    trip: "main",
    neededBy: null,
    shopId,
    aisleGroupId: sectionId(drugstoreSection(entry.text)),
    // As on the handwritten note: "2x Zahnpasta", and one of something is just its name.
    purchase:
      entry.quantity !== null && entry.quantity > 1
        ? { quantity: entry.quantity, unit: "Packung" }
        : null,
    packs: null,
    amounts: [],
    hasUnquantified: false,
    contributions: [
      {
        source: { type: "manual", entryId: entry.id },
        amount: null,
        originalText: entry.text,
        optional: false,
        origin: entry.from ?? trip,
      },
    ],
    note: entry.forWhom ? `für ${entry.forWhom}` : null,
    defaultAtHome: false,
    optional: false,
  }));
}

/** The drugstore note as it is shown: by section, in the order of the shop, each by name. */
export function presentDrugstore(
  lines: readonly ShoppingLine[],
  states: Record<string, LineState>,
): AisleView {
  const resolved = lines.map((line) => resolveLine(line, states[line.key]));
  return {
    groups: DRUGSTORE_SECTIONS.map(
      (section, at): { aisleGroup: AisleGroup; lines: ViewLine[] } => ({
        aisleGroup: { id: sectionId(section.key), name: section.name, sortOrder: at },
        lines: resolved
          .filter((view) => view.line.aisleGroupId === sectionId(section.key))
          .sort(byLabel),
      }),
    ).filter((group) => group.lines.length > 0),
    atHome: [],
  };
}
