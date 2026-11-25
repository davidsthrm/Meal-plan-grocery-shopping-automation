"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { UndoBar, type Toast } from "@/components/undo-bar";
import type { IsoDate } from "@/domain/dates";
import type { Meal, SlotContent } from "@/domain/plan";
import { restoreSlot } from "./actions";

/** Where a meal that was just emptied is said: the bar on the page, while there is one. */
let say: ((toast: Toast) => void) | null = null;

/**
 * The bar of the week that says a meal was emptied, with "Widerrufen". It stands beside the
 * meals, so that the page coming back from the server does not take it along.
 */
export function MealUndoBar() {
  const [toast, setToast] = useState<Toast | null>(null);
  const done = useCallback(() => setToast(null), []);
  useEffect(() => {
    say = setToast;
    return () => {
      if (say === setToast) say = null;
    };
  }, []);
  return <UndoBar toast={toast} onDone={done} />;
}

/**
 * A meal of the plan while it is planned. Emptied by its bin, or by its last recipe stepped
 * to nothing, it says so at the foot, "Mo Abend geleert · Widerrufen", and the way back
 * writes again what it held: one tap beside the plus erased the recipes, persons, foods and
 * extra portions of a meal for good, while the whole week asks first (audit, 24 November
 * 2026). The forms stay plain forms; this only listens to them.
 */
export function MealSection({
  label,
  className,
  week,
  date,
  meal,
  said,
  was,
  leftovers,
  children,
}: {
  label: string;
  className: string;
  week: IsoDate;
  date: IsoDate;
  meal: Meal;
  /** The meal in a few words: "Mo Abend". */
  said: string;
  /** What the meal holds, or null while nothing is planned. */
  was: SlotContent | null;
  /** The meals its leftovers are planned for, each "<date>.<meal>". */
  leftovers: string[];
  children: ReactNode;
}) {
  function listen(event: FormEvent<HTMLElement>) {
    if (!was) return;
    const form = event.target as HTMLFormElement;
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const lastRecipe =
      was.kind === "recipes" &&
      was.items.length === 1 &&
      button?.name === "servings" &&
      button.value === "0";
    if (form.dataset.does !== "clear" && !lastRecipe) return;
    say?.({
      id: Date.now(),
      text: `${said} geleert`,
      undo: () => {
        const back = new FormData();
        back.set("week", week);
        back.set("date", date);
        back.set("meal", meal);
        back.set("was", JSON.stringify(was));
        back.set("reste", leftovers.join(","));
        startTransition(() => restoreSlot(back));
      },
    });
  }
  return (
    <section aria-label={label} className={className} onSubmit={listen}>
      {children}
    </section>
  );
}
