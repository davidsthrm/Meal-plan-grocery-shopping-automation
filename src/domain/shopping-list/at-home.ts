import { normalizeName, type AisleGroup, type CatalogIndex } from "../catalog";
import type { IsoDate } from "../dates";
import type { ViewLine } from "./present";
import { nextTrip, type FreshPlace, type ShoppingDay, type ShoppingTrip } from "./trips";

/**
 * "Haben wir schon": what the week needs and the household has at home, for the whole week
 * at once. It reads like a small note of its own: one entry per thing, by kind of grocery,
 * without the errands the lines would have been on.
 */

/** A line that is at home, with the note it would be on. */
export interface AtHomeLine {
  trip: ShoppingTrip;
  line: ViewLine;
}

/** One thing at home: Salz once, however many notes would have had it. */
export interface AtHomeItem {
  label: string;
  lines: AtHomeLine[];
}

export interface AtHomeGroup {
  aisleGroup: AisleGroup;
  items: AtHomeItem[];
}

/** The lines at home as one entry per thing, by kind of grocery in the household's order. */
export function groupAtHome(lines: readonly AtHomeLine[], index: CatalogIndex): AtHomeGroup[] {
  const fallback = index.aisleGroupById.get(index.catalog.fallbackAisleGroupId);
  const groups = new Map<string, AtHomeGroup>();
  for (const entry of lines) {
    const aisleGroup = index.aisleGroupById.get(entry.line.line.aisleGroupId) ?? fallback;
    if (!aisleGroup) continue;
    const group = groups.get(aisleGroup.id) ?? { aisleGroup, items: [] };
    const label = entry.line.line.label;
    const item = group.items.find((each) => normalizeName(each.label) === normalizeName(label));
    if (item) item.lines.push(entry);
    else group.items.push({ label, lines: [entry] });
    groups.set(aisleGroup.id, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.aisleGroup.sortOrder - b.aisleGroup.sortOrder)
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.label.localeCompare(b.label, "de")),
    }));
}

/**
 * The note something goes on when it is bought after all: its own note while that errand is
 * still to come, otherwise the next one from today on that sells it. Nobody goes on an
 * errand whose day is over.
 */
export function noteToBuyOn(
  trip: ShoppingTrip,
  today: IsoDate,
  days: readonly ShoppingDay[],
  fresh: FreshPlace | null,
): ShoppingTrip {
  if (trip.date >= today) return trip;
  return nextTrip(days, today, fresh) ?? trip;
}
