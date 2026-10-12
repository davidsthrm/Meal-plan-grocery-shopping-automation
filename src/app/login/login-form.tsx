"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          E-Mail
        </label>
        <input
          className="field"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Passwort
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Anmelden …" : "Anmelden"}
      </button>
    </form>
  );
}
