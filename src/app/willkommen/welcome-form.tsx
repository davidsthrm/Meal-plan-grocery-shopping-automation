"use client";

import { addTransitionType, useState, type ReactNode } from "react";

/** The type of the transition from the welcome into the app (`.app-in` and its parts). */
export const INTO_THE_APP = "willkommen";

/**
 * The welcome with the household's settings to keep or change. "So lassen" is the one green
 * button until something is changed, then "Speichern" is. Either one lifts the welcome off
 * at once, as the server stores what is to be stored, and the app comes in under it with
 * the transition `willkommen`.
 */
export function WelcomeForm({
  intro,
  action,
  children,
}: {
  intro: ReactNode;
  action: (form: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [changed, setChanged] = useState(false);
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={leaving ? "welcome-leaving" : undefined}>
      {intro}
      <form
        // The lift starts on the tap, not when the server answers.
        onSubmit={() => setLeaving(true)}
        action={async (form) => {
          addTransitionType(INTO_THE_APP);
          await action(form);
        }}
        onChange={() => setChanged(true)}
      >
        {children}
        <div className="welcome-actions">
          <button name="wahl" value="speichern" className={`btn ${changed ? "btn-primary" : ""}`}>
            Speichern
          </button>
          <button name="wahl" value="lassen" className={`btn ${changed ? "" : "btn-primary"}`}>
            So lassen
          </button>
        </div>
      </form>
    </div>
  );
}
