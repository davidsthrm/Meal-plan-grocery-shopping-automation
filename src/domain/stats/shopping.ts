import { normalizeName, type CatalogIndex, type Place, type Shop } from "../catalog";
import { addDays, isoWeekday, type IsoDate } from "../dates";
import { supermarketForKind } from "../shopping-list/supermarkets";
import { bucketsOf, daysCounted, weeksCounted, type Bucket, type Period } from "./period";
import { stat, type Stat } from "./stat";

/**
 * How the household shopped in a period. The notes are worked out from the plan each time
 * and only what someone did on them is stored, so this counts what was ticked, removed or
 * written in the app: an errand done from the paper note leaves nothing to count.
 */

/** A note as stored: a place on a day. */
export interface NoteRecord {
  id: string;
  date: IsoDate;
  place: Place;
}

/** What someone did on one line of a note (`shopping_line_state`). */
export interface LineRecord {
  noteId: string;
  /** `<ingredient>@<trip>[@<shop>][#<unit>]`, `manual:<entry>` or `unmapped:<name>`. */
  key: string;
  status: "bought" | "partially_bought" | "removed" | "moved" | null;
  /** When it was ticked, in milliseconds, and by whom. */
  checkedAt: number | null;
  checkedBy: string | null;
  decidedBy: string | null;
  substituted: boolean;
  /** The supermarket chosen for it this week, where it was not the main one. */
  shopId: string | null;
  movedTo: boolean;
  /** The name the line had on the note, where a decision kept it. */
  plannedName: string | null;
}

/** A line written onto a note by hand (`shopping_manual_entry`). */
export interface TypedRecord {
  id: string;
  noteId: string;
  text: string;
  ingredientId: string | null;
  shopId: string | null;
  aisleGroupId: string | null;
  forWhom: string | null;
  /** The rest of a line bought in part, carried on: not written by anyone. */
  carried: boolean;
}

export interface ShoppingStatsInput {
  period: Period;
  today: IsoDate;
  firstWeek: IsoDate | null;
  notes: readonly NoteRecord[];
  lines: readonly LineRecord[];
  typed: readonly TypedRecord[];
  index: Pick<CatalogIndex, "ingredientById" | "shopById">;
  /** The household's supermarkets, the main one first. */
  supermarkets: readonly Shop[];
  /** Members by their user id. */
  members: ReadonlyMap<string, string>;
}

/** A thing bought, as the statistics name it. */
interface Item {
  key: string;
  label: string;
}

export interface Errand {
  noteId: string;
  date: IsoDate;
  place: Place;
  bought: number;
  /** Who made the last tick: whoever finished it. Null where nobody known did. */
  by: string | null;
}

export interface ItemRow {
  key: string;
  label: string;
  /** Errands it was bought on. */
  count: number;
  /** The last errand it was bought on, to open its note. */
  last: { date: IsoDate; place: Place };
}

export interface PlaceRow {
  place: Place;
  errands: number;
  bought: number;
}

export interface SupermarketRow {
  shop: Pick<Shop, "id" | "name" | "logoUrl">;
  bought: number;
}

export interface MemberRow {
  name: string;
  errands: number;
  ticks: number;
}

export interface ErrandBar extends Bucket {
  counts: Record<Place, number>;
  total: number;
}

export interface ShoppingStats {
  errands: Errand[];
  bought: number;
  /** Errands per week, over the weeks of the period that have begun. */
  perWeek: number;
  /** Per day of the period up to today, the places shopped at: the calendar. */
  days: { date: IsoDate; places: Place[] }[];
  trend: Stat<ErrandBar[]>;
  weekdays: Stat<number[]>;
  places: PlaceRow[];
  supermarkets: Stat<SupermarketRow[]>;
  top: Stat<ItemRow[]>;
  deviations: Stat<{
    decided: number;
    removed: number;
    partial: number;
    substituted: number;
    moved: number;
    mostRemoved: ItemRow[];
  }>;
  who: Stat<MemberRow[]>;
  typed: Stat<{ count: number; top: ItemRow[] }>;
  drugstore: Stat<{ count: number; top: ItemRow[]; forWhom: { name: string; count: number }[] }>;
}

export const SHOPPING_NEED = { errands: 2, repeat: 2, trendBars: 2, weekdays: 3 } as const;
const TOP = 8;
const PLACE_ORDER: readonly Place[] = ["supermarket", "market", "butcher", "bakery", "drugstore"];

function emptyPlaces(): Record<Place, number> {
  return { supermarket: 0, market: 0, butcher: 0, bakery: 0, drugstore: 0 };
}

/** Whether a line was bought, in full or in part. A tick from before there were statuses counts. */
export function isBoughtLine(line: Pick<LineRecord, "status" | "checkedAt">): boolean {
  return (
    line.status === "bought" ||
    line.status === "partially_bought" ||
    (line.status === null && line.checkedAt !== null)
  );
}

/** The catalog ingredient a line key names, if it names one. */
export function ingredientOfKey(key: string): string | null {
  if (key.startsWith("manual:") || key.startsWith("unmapped:")) return null;
  const at = key.indexOf("@");
  return at > 0 ? key.slice(0, at) : null;
}

/** "Käsestangen" for "kaesestangen", as well as a key without its spelling can say it. */
function fromKeyName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The shop named in a line key: bread bought at the bakery for a cold supper. */
function shopOfKey(key: string): string | null {
  const parts = key.split("#")[0].split("@");
  return parts.length >= 3 ? parts[2] : null;
}

export function shoppingStats(input: ShoppingStatsInput): ShoppingStats {
  const { period, today, firstWeek, index } = input;
  const span = daysCounted(period, today, firstWeek);
  const inSpan = (date: IsoDate) => span !== null && date >= span.from && date <= span.to;
  const notes = new Map(input.notes.filter((note) => inSpan(note.date)).map((n) => [n.id, n]));
  const typedById = new Map(input.typed.map((entry) => [entry.id, entry]));

  const itemOf = (line: Pick<LineRecord, "key" | "plannedName">): Item | null => {
    const ingredientId = ingredientOfKey(line.key);
    if (ingredientId) {
      const ingredient = index.ingredientById.get(ingredientId);
      return ingredient ? { key: ingredient.id, label: ingredient.name } : null;
    }
    if (line.key.startsWith("manual:")) {
      const entry = typedById.get(line.key.slice("manual:".length));
      if (!entry) return line.plannedName ? textItem(line.plannedName) : null;
      const ingredient = entry.ingredientId ? index.ingredientById.get(entry.ingredientId) : null;
      return ingredient ? { key: ingredient.id, label: ingredient.name } : textItem(entry.text);
    }
    const name = line.key.slice("unmapped:".length);
    return { key: `text:${name}`, label: line.plannedName ?? fromKeyName(name) };
  };

  const ofNotes = input.lines.filter((line) => notes.has(line.noteId));
  const bought = ofNotes.filter(isBoughtLine);

  // Errands: notes with something bought on them.
  const byNote = new Map<string, LineRecord[]>();
  for (const line of bought) byNote.set(line.noteId, [...(byNote.get(line.noteId) ?? []), line]);
  const errands: Errand[] = [...byNote]
    .map(([noteId, lines]) => {
      const note = notes.get(noteId)!;
      const last = lines
        .filter((line) => line.checkedAt !== null)
        .sort((a, b) => (b.checkedAt as number) - (a.checkedAt as number))[0];
      const by = last?.checkedBy ?? last?.decidedBy ?? null;
      return {
        noteId,
        date: note.date,
        place: note.place,
        bought: lines.length,
        by: by !== null && input.members.has(by) ? by : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || placeRank(a.place) - placeRank(b.place));

  const weeks = weeksCounted(period, today, firstWeek).length;

  // The calendar: every day up to today with the places shopped at.
  const days: ShoppingStats["days"] = [];
  if (span) {
    const placesOn = new Map<IsoDate, Set<Place>>();
    for (const errand of errands) {
      placesOn.set(errand.date, (placesOn.get(errand.date) ?? new Set()).add(errand.place));
    }
    for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
      days.push({
        date,
        places: PLACE_ORDER.filter((place) => placesOn.get(date)?.has(place)),
      });
    }
  }

  // The bars reach past the period (the weeks before a week), so they read every note.
  const shopped = new Set(input.lines.filter(isBoughtLine).map((line) => line.noteId));
  const bars = bucketsOf(period, today, firstWeek).map((bucket): ErrandBar => {
    const counts = emptyPlaces();
    for (const note of input.notes) {
      if (note.date < bucket.start || note.date > bucket.end || note.date > today) continue;
      if (shopped.has(note.id)) counts[note.place]++;
    }
    return { ...bucket, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const errand of errands) weekdayCounts[isoWeekday(errand.date) - 1]++;

  const places: PlaceRow[] = PLACE_ORDER.map((place) => {
    const of = errands.filter((errand) => errand.place === place);
    return {
      place,
      errands: of.length,
      bought: of.reduce((sum, errand) => sum + errand.bought, 0),
    };
  }).filter((row) => row.errands > 0);

  // Supermarket lines by the supermarket they were bought at.
  const favourites = input.supermarkets;
  const marketOf = (line: LineRecord): string | null => {
    const chosen = [line.shopId, shopOfKey(line.key)].find(
      (id) => id && favourites.some((shop) => shop.id === id),
    );
    if (chosen) return chosen;
    const ingredientId = ingredientOfKey(line.key);
    if (ingredientId) {
      return supermarketForKind(
        index.ingredientById.get(ingredientId)?.aisleGroupId ?? null,
        favourites,
      );
    }
    const entry = line.key.startsWith("manual:")
      ? typedById.get(line.key.slice("manual:".length))
      : undefined;
    if (entry?.shopId && favourites.some((shop) => shop.id === entry.shopId)) return entry.shopId;
    return supermarketForKind(entry?.aisleGroupId ?? null, favourites);
  };
  const perMarket = new Map<string, number>();
  for (const line of bought) {
    if (notes.get(line.noteId)?.place !== "supermarket") continue;
    const id = marketOf(line);
    if (id) perMarket.set(id, (perMarket.get(id) ?? 0) + 1);
  }
  const supermarkets = stat(favourites.length, 1, () =>
    favourites
      .map((shop) => ({
        shop: { id: shop.id, name: shop.name, logoUrl: shop.logoUrl ?? null },
        bought: perMarket.get(shop.id) ?? 0,
      }))
      .filter((row) => row.bought > 0)
      .sort((a, b) => b.bought - a.bought),
  );

  // What was bought most often: on how many errands, not how much.
  const items = (lines: readonly LineRecord[]) => {
    const rows = new Map<string, ItemRow & { notes: Set<string> }>();
    for (const line of lines) {
      const item = itemOf(line);
      const note = notes.get(line.noteId);
      if (!item || !note) continue;
      const row = rows.get(item.key) ?? {
        ...item,
        count: 0,
        last: { date: note.date, place: note.place },
        notes: new Set<string>(),
      };
      row.notes.add(line.noteId);
      row.count = row.notes.size;
      if (note.date >= row.last.date) row.last = { date: note.date, place: note.place };
      rows.set(item.key, row);
    }
    return [...rows.values()]
      .map(({ key, label, count, last }) => ({ key, label, count, last }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.last.date.localeCompare(a.last.date) ||
          a.label.localeCompare(b.label, "de"),
      );
  };
  const food = bought.filter((line) => notes.get(line.noteId)?.place !== "drugstore");
  const ranked = items(food);
  const top = stat(ranked[0]?.count ?? 0, SHOPPING_NEED.repeat, () =>
    ranked.filter((row) => row.count >= SHOPPING_NEED.repeat).slice(0, TOP),
  );

  // What happened besides buying as planned.
  const removed = ofNotes.filter((line) => line.status === "removed");
  const decided = bought.length + removed.length;
  const deviations = stat(decided, 1, () => ({
    decided,
    removed: removed.length,
    partial: bought.filter((line) => line.status === "partially_bought").length,
    substituted: bought.filter((line) => line.substituted).length,
    moved: ofNotes.filter((line) => line.movedTo).length,
    mostRemoved: items(removed).slice(0, 3),
  }));

  // Who shops: errands finished, and lines ticked.
  const memberRows = new Map<string, MemberRow>();
  const row = (id: string) => {
    const name = input.members.get(id);
    if (!name) return null;
    const known = memberRows.get(id) ?? { name, errands: 0, ticks: 0 };
    memberRows.set(id, known);
    return known;
  };
  for (const errand of errands) if (errand.by) row(errand.by)!.errands++;
  for (const line of bought) {
    const by = line.checkedBy ?? line.decidedBy;
    if (by) {
      const member = row(by);
      if (member) member.ticks++;
    }
  }
  const who = stat(errands.length, SHOPPING_NEED.errands, () =>
    [...memberRows.values()].sort(
      (a, b) => b.errands - a.errands || b.ticks - a.ticks || a.name.localeCompare(b.name, "de"),
    ),
  );

  // Lines nobody planned: written onto a food note by hand.
  const written = input.typed.filter((entry) => notes.has(entry.noteId) && !entry.carried);
  const writtenFood = written.filter((entry) => notes.get(entry.noteId)!.place !== "drugstore");
  const writtenItems = (entries: readonly TypedRecord[]) =>
    items(
      entries.map((entry) => ({
        noteId: entry.noteId,
        key: `manual:${entry.id}`,
        status: null,
        checkedAt: null,
        checkedBy: null,
        decidedBy: null,
        substituted: false,
        shopId: null,
        movedTo: false,
        plannedName: null,
      })),
    );
  const typed = stat(writtenFood.length, 1, () => ({
    count: writtenFood.length,
    top: writtenItems(writtenFood).slice(0, 5),
  }));

  const dm = written.filter((entry) => notes.get(entry.noteId)!.place === "drugstore");
  const forWhom = new Map<string, number>();
  for (const entry of dm) {
    if (entry.forWhom) forWhom.set(entry.forWhom, (forWhom.get(entry.forWhom) ?? 0) + 1);
  }
  const drugstore = stat(dm.length, 1, () => ({
    count: dm.length,
    top: writtenItems(dm).slice(0, 5),
    forWhom: [...forWhom]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de")),
  }));

  return {
    errands,
    bought: bought.length,
    perWeek: weeks === 0 ? 0 : errands.length / weeks,
    days,
    trend: stat(bars.filter((bar) => bar.total > 0).length, SHOPPING_NEED.trendBars, () => bars),
    weekdays: stat(errands.length, SHOPPING_NEED.weekdays, () => weekdayCounts),
    places,
    supermarkets,
    top,
    deviations,
    who,
    typed,
    drugstore,
  };
}

function textItem(text: string): Item {
  return { key: `text:${normalizeName(text)}`, label: text.trim() };
}

function placeRank(place: Place): number {
  return PLACE_ORDER.indexOf(place);
}
