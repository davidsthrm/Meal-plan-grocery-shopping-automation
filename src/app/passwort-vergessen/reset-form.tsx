"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ResetState } from "../login/actions";

const initial: ResetState = { said: null, email: "" };

export function ResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
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
      {state.said?.kind === "sent" && (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2">
          {state.said.text}
        </p>
      )}
      {state.said?.kind === "error" && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {state.said.text}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Wird gesendet …" : "Link senden"}
      </button>
    </form>
  );
}
