"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { weekdayShort, type IsoDate } from "@/domain/dates";
import { moveMeal, type Movable } from "@/domain/move-meal";
import { MEALS, type Meal } from "@/domain/plan";
import { leftoversFirstText, MEAL_NAME, mealPlaceText } from "@/lib/plan-text";
import { moveSlot } from "./actions";

/** A meal of the week as the grid shows it: its place, and its dish in a word. */
export type GridMeal = Movable & { name: string };

/**
 * "Auf einen anderen Tag": the week as a small grid, days by lunch and dinner, each place
 * with its dish or "frei", this meal's own place marked. A free place takes the meal, a
 * planned one swaps with it; the line under the grid says which before anything is done,
 * or why it cannot be: plans change (decided on 25 November 2026). Each place is a radio
 * button of one form, so that arrows choose on a laptop.
 */
export function MoveMeal({
  week,
  date,
  meal,
  days,
  meals,
}: {
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  /** The days of the week, Monday first. */
  days: readonly IsoDate[];
  meals: readonly GridMeal[];
}) {
  const [to, setTo] = useState<{ date: IsoDate; meal: Meal } | null>(null);
  const at = (day: IsoDate, place: Meal) =>
    meals.find((other) => other.date === day && other.meal === place);
  const moving = at(date, meal);
  const move = moving && to ? moveMeal(meals, moving, to) : null;
  const said =
    move?.kind === "move"
      ? "Frei."
      : move?.kind === "swap"
        ? `Tauscht mit ${move.other.name}.`
        : move?.kind === "refused"
          ? leftoversFirstText(move.leftovers, move.source)
          : "";

  return (
    <form action={moveSlot}>
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <fieldset className="move-grid">
        <legend className="sr-only">Wohin?</legend>
        <span aria-hidden />
        {MEALS.map((place) => (
          <span key={place} aria-hidden className="eyebrow">
            {MEAL_NAME[place]}
          </span>
        ))}
        {days.map((day) => (
          <div key={day} className="contents">
            <span aria-hidden className="text-sm font-semibold text-muted">
              {weekdayShort(day)}
            </span>
            {MEALS.map((place) => {
              const own = day === date && place === meal;
              const there = at(day, place);
              return (
                <label key={place} className="move-place" data-own={own || undefined}>
                  <input
                    type="radio"
                    name="to"
                    value={`${day}.${place}`}
                    disabled={own}
                    className="sr-only"
                    onChange={() => setTo({ date: day, meal: place })}
                  />
                  <span className="sr-only">{mealPlaceText({ date: day, meal: place })}: </span>
                  <span className={`truncate ${there ? "" : "text-muted"}`}>
                    {there?.name ?? "frei"}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>
      <p className="mt-2 min-h-5 text-sm" aria-live="polite">
        {said}
      </p>
      <div className="mt-2">
        {move?.kind === "move" || move?.kind === "swap" ? (
          <SubmitButton className="btn btn-primary btn-small">
            {move.kind === "swap" ? "Tauschen" : "Verschieben"}
          </SubmitButton>
        ) : (
          <button type="button" className="btn btn-primary btn-small" disabled>
            Verschieben
          </button>
        )}
      </div>
    </form>
  );
}
