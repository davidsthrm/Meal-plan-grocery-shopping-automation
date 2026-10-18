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

/** The note for what ran out at home: a sheet with a corner folded over. */
export function NoteIcon() {
  return (
    <svg {...base}>
      <path d="M5 4h14v10l-5.500 6H5Z" />
      <path d="M19 14h-5.500v6" />
      <path d="M8.500 8.500h7M8.500 12h4" />
    </svg>
  );
}

/** A tick as a pen makes it, a little over the edge of its box. */
export function TickIcon() {
  return (
    <svg {...base} width={24} height={24} strokeWidth={2.6}>
      <path d="M4.500 12.500 9.500 18 20 4.500" />
    </svg>
  );
}

/** The pen that opens a saved plan for a change. */
export function PenIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500 4 20Z" />
      <path d="M14.500 6l3.500 3.500" />
    </svg>
  );
}

/** The rubber that empties a week. */
export function EraserIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M9.500 19 4 13.500a1.500 1.500 0 0 1 0-2.100l7.400-7.400a1.500 1.500 0 0 1 2.100 0l6 6a1.500 1.500 0 0 1 0 2.100L13.500 19Z" />
      <path d="M8 8l8 8M9.500 19H20" />
    </svg>
  );
}

/** A cogwheel: where the household sets what stays the same every week. */
export function SettingsIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...base}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
    </svg>
  );
}

/** A folder: a magazine with its editions in it. */
export function FolderIcon() {
  return (
    <svg {...base}>
      <path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />
    </svg>
  );
}

/** A pushpin: the week as a note for the pinboard. */
export function PinIcon() {
  return (
    <svg {...base}>
      <path d="M9 4.5h6l-1 5.5 3 3H7l3-3ZM12 13v7" />
    </svg>
  );
}

/** A label on a string: the tags of a recipe. */
export function TagIcon() {
  return (
    <svg {...base}>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0Z" />
      <circle cx="8.2" cy="8.2" r="1.4" />
    </svg>
  );
}

export function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />
    </svg>
  );
}

/** A circle turning while something takes its time. Still for whoever asked for less motion. */
export function SpinnerIcon() {
  return (
    <svg {...base} className="animate-spin motion-reduce:animate-none">
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </svg>
  );
}
