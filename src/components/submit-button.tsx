"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** The button of a form that shows, while the form is on its way, that the tap arrived. */
export function SubmitButton({
  children,
  className = "btn",
  label,
  on,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  /** For a button that shows a sign instead of words. */
  label?: string;
  /** For a button that shows a state, such as a ticked box: styles go by `data-on`. */
  on?: boolean;
  /** Sent with the form when this button is the one pressed, to tell two buttons apart. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      aria-label={label}
      aria-busy={pending}
      data-on={on}
      name={name}
      value={value}
    >
      {children}
    </button>
  );
}
