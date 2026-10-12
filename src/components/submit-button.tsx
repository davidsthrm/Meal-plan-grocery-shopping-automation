"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** The button of a form that shows, while the form is on its way, that the tap arrived. */
export function SubmitButton({
  children,
  className = "btn",
  label,
}: {
  children: ReactNode;
  className?: string;
  /** For a button that shows a sign instead of words. */
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-label={label} aria-busy={pending}>
      {children}
    </button>
  );
}
