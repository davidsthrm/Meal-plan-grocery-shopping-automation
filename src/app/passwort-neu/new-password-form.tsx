"use client";

import { useActionState } from "react";
import { setNewPassword, type PasswordState } from "../login/actions";

const initial: PasswordState = { error: null };

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, initial);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          Neues Passwort
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="repeated">
          Noch einmal
        </label>
        <input
          className="field"
          id="repeated"
          name="repeated"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Wird gespeichert …" : "Passwort speichern"}
      </button>
    </form>
  );
}
