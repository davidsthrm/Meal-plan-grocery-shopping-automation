"use client";

import { useActionState } from "react";
import { joinHousehold, type JoinState } from "../actions";

const initial: JoinState = { errors: {}, name: "", email: "" };

/** Name, e-mail and a password: all it takes to join the household of an invitation. */
export function JoinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(joinHousehold.bind(null, token), initial);
  const problem = (text: string | undefined) =>
    text && <p className="mt-1 text-sm text-danger">{text}</p>;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Dein Name
        </label>
        <input
          className="field"
          id="name"
          name="name"
          autoComplete="given-name"
          maxLength={40}
          defaultValue={state.name}
          required
        />
        {problem(state.errors.name)}
      </div>
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
        {problem(state.errors.email)}
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
          autoComplete="new-password"
          minLength={8}
          required
        />
        {problem(state.errors.password) ?? (
          <p className="mt-1 text-sm text-muted">Mindestens 8 Zeichen.</p>
        )}
      </div>
      {state.errors.invite && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {state.errors.invite}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Einen Moment …" : "Konto anlegen und beitreten"}
      </button>
    </form>
  );
}
