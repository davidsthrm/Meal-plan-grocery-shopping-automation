"use client";

import type { ComponentProps } from "react";

/**
 * A field that offers words while it is typed in (`list`), and that Return sends. In Safari
 * the offers took the Return key, and a word the catalog knows (Spülmittel, Küchenrolle) was
 * not written at all (audit, 24 November 2026).
 */
export function SuggestingField(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
