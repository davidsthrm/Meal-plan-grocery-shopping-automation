/** The few signs the app uses, drawn as lines. Decorative: the words next to them say it. */

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.5s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.7-7.5 10.1-7.5 10.1Z" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...base}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** The mark for "want to cook this": a pot with a lid. */
export function WishIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base}>
      <path d="M5 11h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" fill={filled ? "currentColor" : "none"} />
      <path d="M3 11h18M10 7.500h4M12 7.500V5" />
    </svg>
  );
}

export function ArrowIcon({ back = false }: { back?: boolean }) {
  return (
    <svg {...base} width={18} height={18}>
      <path d={back ? "M14.500 6 8.500 12l6 6" : "m9.500 6 6 6-6 6"} />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

/** The signs of the main sections, for the bar at the bottom of a phone. */
export function WeekIcon() {
  return (
    <svg {...base} width={22} height={22}>
      <rect x="4" y="5.500" width="16" height="14.500" rx="2.500" />
      <path d="M4 10h16M8.500 3.500v4M15.500 3.500v4M8 14h2.500M13.500 14H16" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg {...base} width={22} height={22}>
      <path d="M5 6.500 6.500 8 9 5.500M5 12.500 6.500 14 9 11.500M5 18.500 6.500 20 9 17.500M12.500 7h7M12.500 13h7M12.500 19h7" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg {...base} width={22} height={22}>
      <path d="M12 6.500c-2-1.400-4.500-2-7.500-2v13.500c3 0 5.500.6 7.500 2 2-1.400 4.500-2 7.500-2V4.500c-3 0-5.500.6-7.500 2ZM12 6.500V20" />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg {...base} width={22} height={22}>
      <path d="M4 9a2 2 0 0 1 2-2h2l1.500-2h5L16 7h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.200" />
    </svg>
  );
}
