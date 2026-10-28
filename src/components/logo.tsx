/**
 * The app's mark and name: a plate with its cutlery on the green of the app, and the name
 * with the plan in that green.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="var(--color-accent)" />
      <g
        fill="none"
        stroke="var(--color-surface)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="16" cy="16" r="5" />
        <circle cx="16" cy="16" r="2" opacity="0.55" />
        <path d="M6 8.500v3.500a1.700 1.700 0 0 0 3.400 0V8.500M7.700 8.500v15" />
        <path d="M25.500 8.500c-1.800 1.300-2.300 4-2.300 7h2.300M25.500 8.500v15" />
      </g>
    </svg>
  );
}

/**
 * The mark with the name. Between a phone and a large screen the header holds the sections
 * as well, and the name would push it wider than an iPad: there the mark stands alone. So it
 * does on a phone narrower than 380 pixels, where the name pushed the account off the screen.
 */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="text-xl font-bold tracking-tight max-[379px]:hidden sm:max-lg:hidden">
        Essens<span className="text-accent">plan</span>
      </span>
    </span>
  );
}
