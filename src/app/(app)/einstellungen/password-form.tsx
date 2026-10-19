"use client";

import { useActionState } from "react";
import { changeOwnPassword, type PasswordChange } from "./actions";

const initial: PasswordChange = { error: null, done: false };

/** Changes the signed-in member's password: the one they have now, and the new one twice. */
export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, initial);
  return (
    <form action={action} className="mt-3 grid gap-3" key={state.done ? "done" : "open"}>
      <label>
        <span className="label">Jetziges Passwort</span>
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Neues Passwort</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="field"
          />
        </label>
        <label>
          <span className="label">Noch einmal</span>
          <input
            name="repeated"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="field"
          />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Wird gespeichert …" : "Passwort ändern"}
        </button>
        {state.done && (
          <span role="status" className="text-sm text-accent">
            Geändert
          </span>
        )}
      </div>
    </form>
  );
}
