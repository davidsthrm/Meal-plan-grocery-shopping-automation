"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** The button of a form that shows, while the form is on its way, that the tap arrived. */
export function SubmitButton({
  children,
  className = "btn",
  label,
  title,
  on,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  /** For a button that shows a sign instead of words. */
  label?: string;
  /** What a mouse pointer shows over a sign. */
  title?: string;
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
      title={title}
      aria-busy={pending}
      data-pending={pending || undefined}
      data-on={on}
      name={name}
      value={value}
    >
      {children}
    </button>
  );
}
