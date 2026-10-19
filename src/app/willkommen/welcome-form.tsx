"use client";

import { addTransitionType, useState, type ReactNode } from "react";

/** The type of the transition from the welcome into the app (`.welcome-out`, `.app-in`). */
export const INTO_THE_APP = "willkommen";

/**
 * The household's settings to keep or change, and the way into the app: "So lassen" is the
 * one green button until something is changed, then "Speichern" is. Either one sends the
 * welcome off upwards and lets the app come in under it.
 */
export function WelcomeForm({
  action,
  children,
}: {
  action: (form: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [changed, setChanged] = useState(false);
  return (
    <form
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
  );
}
