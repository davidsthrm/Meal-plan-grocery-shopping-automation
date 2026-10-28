import type { ReactNode } from "react";

/**
 * A card's heading with a round "?" beside it: a tap unfolds what the card is about, a
 * second tap folds it away. The settings explained every card at length, and the controls
 * stood a screen further down (October 2026). Works without a script: it is a `<details>`.
 */
export function HelpHeading({
  id,
  title,
  level = 3,
  children,
}: {
  id: string;
  title: ReactNode;
  level?: 2 | 3 | 4;
  /** The explanation, folded away until asked for. */
  children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <details className="help">
      <summary className="help-head">
        <Heading
          id={id}
          className={level === 4 ? "font-semibold" : "text-lg font-bold tracking-tight"}
        >
          {title}
        </Heading>
        <span className="help-q" aria-hidden>
          ?
        </span>
        <span className="sr-only">Erklärung</span>
      </summary>
      <div className="help-text">{children}</div>
    </details>
  );
}
