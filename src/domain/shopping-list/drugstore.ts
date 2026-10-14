import { normalizeName, type AisleGroup } from "../catalog";
import type { AisleView, ViewLine } from "./present";
import { resolveLine } from "./present";
import type { ShoppingTrip } from "./trips";
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

/** A line written onto the drugstore note: what, how many, and for whom. */
export interface DrugstoreEntry {
  id: string;
  text: string;
  /** How many. Null when nobody said. */
  quantity: number | null;
  /** Who it is for: "Lena". Null when it is for everyone. */
  forWhom: string | null;
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
  const text = form.item.trim().replace(/\s+/g, " ").slice(0, DRUGSTORE_TEXT_MAX);
  if (text === "") return null;
  const number = Number(form.quantity.trim());
  const quantity =
    Number.isInteger(number) && number >= 1 && number <= QUANTITY_MAX ? number : null;
  const forWhom = form.forWhom.trim().replace(/\s+/g, " ").slice(0, FOR_WHOM_MAX);
  return { text, quantity, forWhom: forWhom === "" ? null : forWhom };
}

/** The id of a drugstore section as it stands in a line, apart from the catalog's groups. */
const sectionId = (section: DrugstoreSection) => `drogerie:${section}`;

/**
 * The lines of a drugstore note: one per entry, as written, with its quantity in front and
 * whom it is for behind ("2 Duschgel für Lena"). `shopId` is where a line without a catalog
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
    shoppingDate: trip.date,
    place: trip.place,
    trip: "main",
    neededBy: null,
    shopId,
    aisleGroupId: sectionId(drugstoreSection(entry.text)),
    purchase: entry.quantity === null ? null : { quantity: entry.quantity, unit: "Stück" },
    amounts: [],
    hasUnquantified: false,
    contributions: [
      {
        source: { type: "manual", entryId: entry.id },
        amount: null,
        originalText: entry.text,
        optional: false,
        origin: trip,
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
  const byLabel = (a: ViewLine, b: ViewLine) => a.line.label.localeCompare(b.line.label, "de");
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
