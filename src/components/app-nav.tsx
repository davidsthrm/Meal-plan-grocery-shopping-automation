"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookIcon, CameraIcon, HeartIcon, ListIcon, WeekIcon } from "./icons";

const SECTIONS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/woche", label: "Woche", icon: <WeekIcon /> },
  { href: "/einkauf", label: "Einkauf", icon: <ListIcon /> },
  { href: "/rezepte", label: "Entdecken", icon: <BookIcon /> },
  { href: "/favoriten", label: "Favoriten", icon: <HeartIcon /> },
  { href: "/import", label: "Import", icon: <CameraIcon /> },
];

/**
 * The main sections. On a phone they are a bar at the bottom, where the thumb is, each with
 * its sign above its name; on a wider screen a row of names in the header.
 */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptbereiche"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:pb-0 sm:backdrop-blur-none"
    >
      <ul className="mx-auto flex max-w-5xl sm:gap-1">
        {SECTIONS.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="min-w-0 flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-semibold sm:min-h-12 sm:flex-row sm:rounded-lg sm:px-4 sm:text-base ${
                  active ? "text-accent sm:bg-accent-soft" : "text-muted hover:text-ink"
                }`}
              >
                <span className="sm:hidden">{icon}</span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
