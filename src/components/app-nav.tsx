"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookIcon, CameraIcon, HeartIcon, ListIcon, WeekIcon } from "./icons";

const SECTIONS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/woche", label: "Woche", icon: <WeekIcon /> },
  { href: "/einkauf", label: "Einkauf", icon: <ListIcon /> },
  { href: "/rezepte", label: "Rezepte", icon: <BookIcon /> },
  { href: "/favoriten", label: "Favoriten", icon: <HeartIcon /> },
  { href: "/import", label: "Import", icon: <CameraIcon /> },
];

/**
 * The main sections. On a phone (`floating`) they are a bar that floats above the bottom of
 * the screen, where the thumb is, each with its sign above its name. It keeps clear of the
 * bar the iPhone itself has at its lower edge: right at the edge, a tap on a section
 * brought up the phone's own gestures. On a wider screen they are a row of names in the
 * header.
 */
export function AppNav({ floating = false }: { floating?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptbereiche" className={floating ? "tabbar" : undefined}>
      <ul className={floating ? "flex" : "flex gap-1"}>
        {SECTIONS.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className={floating ? "min-w-0 flex-1" : undefined}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  floating
                    ? "tab"
                    : `flex min-h-12 items-center rounded-lg px-4 font-semibold ${
                        active ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
                      }`
                }
              >
                {floating && icon}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
