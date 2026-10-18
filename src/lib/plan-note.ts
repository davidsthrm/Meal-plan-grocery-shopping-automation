import { addDays, dayAndMonth, weekdayShort, weekRange, type IsoDate } from "@/domain/dates";
import { mealsOf, type Meal, type PlanExtra, type PlanSlot } from "@/domain/plan";
import { MEAL_NAME, slotText } from "./plan-text";

/**
 * The week plan as a small note for the pinboard: every day with its lunch and dinner, and
 * Sunday's coffee when something is planned for it. An open meal keeps its line, empty, to
 * be written on by hand.
 */

export interface PlanNoteMeal {
  meal: Meal;
  /** "Mittag", "Abend". */
  name: string;
  /** What there is; null for a meal nothing is planned for. */
  text: string | null;
}

export interface PlanNoteDay {
  date: IsoDate;
  /** "Mo 19." */
  label: string;
  meals: PlanNoteMeal[];
}

export interface PlanNote {
  /** "Wochenplan 19.–25. Oktober" */
  title: string;
  days: PlanNoteDay[];
  /** What the week needs outside its meals: "Zitronen-Mohn-Kuchen (Sa)". */
  extras: string[];
}

/** The note of a week. `titleOf` names a recipe; one it cannot name is left out. */
export function planNote(
  week: IsoDate,
  slots: readonly PlanSlot[],
  extras: readonly PlanExtra[],
  titleOf: (recipeId: string) => string | null,
): PlanNote {
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const textOf = (slot: PlanSlot | undefined): string | null => {
    if (!slot) return null;
    if (slot.kind === "recipes") {
      const titles = slot.items.flatMap((item) => titleOf(item.recipeId) ?? []);
      return titles.length > 0 ? titles.join(" + ") : null;
    }
    // Leftovers say of which meal, where it is one of this note's days.
    if (slot.kind === "leftovers" && slot.ofSlotId) {
      const from = byId.get(slot.ofSlotId);
      if (from) return `Reste vom ${weekdayShort(from.date)}`;
    }
    return slotText(slot);
  };

  const days = Array.from({ length: 7 }, (_, at): PlanNoteDay => {
    const date = addDays(week, at);
    const meals = mealsOf(date).flatMap((meal): PlanNoteMeal[] => {
      const text = textOf(slots.find((slot) => slot.date === date && slot.meal === meal));
      // Coffee on Sunday is there only when something is planned for it.
      if (meal === "coffee" && text === null) return [];
      // "Kaffee & Kuchen" is too long for the narrow column of a note.
      return [{ meal, name: meal === "coffee" ? "Kaffee" : MEAL_NAME[meal], text }];
    });
    return { date, label: `${weekdayShort(date)} ${dayAndMonth(date).split(" ")[0]}`, meals };
  });

  return {
    title: `Wochenplan ${weekRange(week)}`,
    days,
    extras: extras.flatMap((extra) => {
      const title = titleOf(extra.recipeId);
      if (!title) return [];
      return [extra.date ? `${title} (${weekdayShort(extra.date)})` : title];
    }),
  };
}
