import { PlusIcon } from "@/components/icons";
import { CHIP, DAYS_ROW } from "@/components/shopping-days-fields";
import { SubmitButton } from "@/components/submit-button";
import { PLACES } from "@/domain/catalog";
import { dayAndMonth, weekDates, weekdayLong, weekdayShort, type IsoDate } from "@/domain/dates";
import { PLACE_NAME } from "@/lib/list-text";
import { openListNote } from "./actions";

/**
 * "Neuer Zettel": a note for any place on a day of the week someone chooses, to write on by
 * hand: dm on a Wednesday, the bakery on a Thursday. The days that are over cannot be chosen.
 * What the plan needs stays on its own notes.
 */
export function OpenNote({ week, days }: { week: IsoDate; days: readonly IsoDate[] }) {
  return (
    <details className="card mt-6 px-4 py-2 print:hidden">
      <summary className="flex min-h-11 items-center gap-2 font-semibold">
        <PlusIcon />
        Neuer Zettel
      </summary>
      <p className="text-sm text-muted">
        Für dm, den Bäcker oder ein anderes Geschäft, an einem Tag deiner Wahl. Was der Plan
        braucht, bleibt auf seinen Zetteln.
      </p>
      <form action={openListNote} className="mt-3 space-y-4 pb-3">
        <input type="hidden" name="week" value={week} />
        <fieldset>
          <legend className="label">Wo</legend>
          <div className="flex flex-wrap gap-2">
            {PLACES.map((place) => (
              <label key={place} className={`${CHIP} px-4`}>
                <input
                  type="radio"
                  name="place"
                  value={place}
                  required
                  defaultChecked={place === "drugstore"}
                  className="sr-only"
                />
                {PLACE_NAME[place]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Wann</legend>
          <div className={DAYS_ROW}>
            {weekDates(week).map((day) => (
              <label
                key={day}
                className={`${CHIP} has-disabled:cursor-default has-disabled:opacity-40`}
              >
                <input
                  type="radio"
                  name="day"
                  value={day}
                  required
                  disabled={!days.includes(day)}
                  defaultChecked={day === days[0]}
                  aria-label={`${weekdayLong(day)}, ${dayAndMonth(day)}`}
                  className="sr-only"
                />
                {weekdayShort(day)}
              </label>
            ))}
          </div>
        </fieldset>
        <SubmitButton className="btn btn-primary">Zettel anlegen</SubmitButton>
      </form>
    </details>
  );
}
