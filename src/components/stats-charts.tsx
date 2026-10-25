import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The parts the statistics are drawn from: cards, large figures and plain charts in the
 * paper look. Every chart is HTML drawn on the server, in the pastels of the kinds; a bar
 * that stands for something is a link to it. Nothing moves: the figures are read.
 */

const NUMBER = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** "3,5", "12". */
export function num(value: number): string {
  return NUMBER.format(value);
}

/** "40 %" */
export function percent(part: number, whole: number): string {
  return whole === 0 ? "0 %" : `${Math.round((part / whole) * 100)} %`;
}

/** One statistic: a heading, what it counts in a few words, and the figure or chart. */
export function StatCard({
  title,
  counts,
  children,
}: {
  title: string;
  /** What is counted, in a few words: "Mahlzeiten mit Rezept". Left out where the title says it. */
  counts?: string;
  children: ReactNode;
}) {
  return (
    <section className="card stat-card" aria-label={title}>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {counts && <p className="mt-0.5 text-sm text-muted">{counts}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Where a statistic has too little to say anything: what it needs, and how far it is. */
export function NotYet({ children }: { children: ReactNode }) {
  return <p className="not-yet">{children}</p>;
}

/** A large figure with what it is: "38 · Mahlzeiten gekocht". */
export function Figure({
  value,
  label,
  detail,
  tone = "",
  href,
}: {
  value: string;
  label: string;
  detail?: string | null;
  tone?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="stat-number">{value}</span>
      <span className="mt-1 block font-semibold leading-snug">{label}</span>
      {detail && <span className="mt-0.5 block text-sm leading-snug opacity-80">{detail}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`stat-figure lift ${tone}`}>
      {body}
    </Link>
  ) : (
    <div className={`stat-figure ${tone}`}>{body}</div>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** What the figure at the end says; the value by default. */
  valueText?: string;
  /** A line under the label: "zuletzt 14. Oktober". */
  meta?: ReactNode;
  /** In front of the label: a pictogram on its pastel, a logo. */
  leading?: ReactNode;
  /** The class of a kind that colours the bar. */
  tone?: string;
  href?: string;
  /** For a screen reader, where label and figure do not say it. */
  ariaLabel?: string;
}

/** A ranking: one row per thing, a bar for how much of it there was, a link to it. */
export function BarList({ rows, max }: { rows: readonly BarRow[]; max?: number }) {
  const most = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const content = (
          <>
            {row.leading}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {row.valueText ?? num(row.value)}
                </span>
              </span>
              <span className="bar-track mt-1.5" aria-hidden>
                <span
                  className="bar-fill"
                  style={{ width: `${Math.max(2, (row.value / most) * 100)}%` }}
                />
              </span>
              {row.meta && <span className="mt-1 block text-sm text-muted">{row.meta}</span>}
            </span>
          </>
        );
        return (
          <li key={row.key} className={row.tone}>
            {row.href ? (
              <Link href={row.href} className="bar-row" aria-label={row.ariaLabel}>
                {content}
              </Link>
            ) : (
              <span className="bar-row" aria-label={row.ariaLabel}>
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface Part {
  key: string;
  label: string;
  value: number;
  /** The class of a kind: `kind-vegetarian`. */
  tone: string;
}

/** A whole split into its parts: one bar across, with each part's name and number below. */
export function ShareBar({ parts, label }: { parts: readonly Part[]; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = parts.filter((part) => part.value > 0);
  return (
    <div>
      <div
        className="share-bar"
        role="img"
        aria-label={`${label}: ${shown.map((part) => `${part.value} ${part.label}`).join(", ")}`}
      >
        {shown.map((part) => (
          <span
            key={part.key}
            className={`share-part ${part.tone}`}
            style={{ flexGrow: part.value }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm" aria-hidden>
        {shown.map((part) => (
          <li key={part.key} className={`inline-flex items-center gap-1.5 ${part.tone}`}>
            <span className="dot chart-dot" />
            <span>{part.label}</span>
            <span className="font-semibold tabular-nums">{part.value}</span>
            <span className="text-muted tabular-nums">{percent(part.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  href: string;
  parts: readonly Part[];
  /** Whether it is the column of the period being looked at. */
  current?: boolean;
}

/**
 * Columns over time, each stacked from its parts, the first at the foot. Each column is a
 * link to the week or month it stands for.
 */
export function Columns({ columns, unit }: { columns: readonly Column[]; unit: [string, string] }) {
  const totals = columns.map((column) => column.parts.reduce((sum, part) => sum + part.value, 0));
  const most = Math.max(1, ...totals);
  return (
    <ol
      className="columns"
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((column, at) => {
        const total = totals[at];
        const parts = column.parts.filter((part) => part.value > 0);
        return (
          <li key={column.key} className="min-w-0">
            <Link
              href={column.href}
              className="column"
              aria-current={column.current ? "true" : undefined}
              aria-label={`${column.label}: ${total} ${total === 1 ? unit[0] : unit[1]}${
                parts.length > 0
                  ? `, ${parts.map((part) => `${part.value} ${part.label}`).join(", ")}`
                  : ""
              }`}
            >
              <span className="column-value tabular-nums">{total > 0 ? total : ""}</span>
              <span className="column-plot">
                <span className="column-stack" style={{ height: `${(total / most) * 100}%` }}>
                  {parts.map((part) => (
                    <span
                      key={part.key}
                      className={`column-part ${part.tone}`}
                      style={{ height: `${(part.value / total) * 100}%` }}
                    />
                  ))}
                </span>
              </span>
              <span className="column-label">{column.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** A share as a ring, its figure in the middle: the meals that fit the season. */
export function Ring({ part, whole, label }: { part: number; whole: number; label: string }) {
  const share = whole === 0 ? 0 : part / whole;
  // A circle of circumference 100, so that the dash is the share in percent.
  const radius = 100 / (2 * Math.PI);
  return (
    <svg
      viewBox="0 0 40 40"
      className="donut"
      role="img"
      aria-label={`${label}: ${percent(part, whole)}`}
    >
      <circle cx="20" cy="20" r={radius} className="donut-track" />
      <circle
        cx="20"
        cy="20"
        r={radius}
        className="donut-fill"
        strokeDasharray={`${share * 100} 100`}
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="21.5" textAnchor="middle" className="donut-text">
        {percent(part, whole)}
      </text>
    </svg>
  );
}
