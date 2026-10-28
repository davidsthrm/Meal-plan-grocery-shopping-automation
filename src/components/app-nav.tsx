"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { sideways } from "@/lib/transitions";
import { BookIcon, CameraIcon, HeartIcon, ListIcon, WeekIcon } from "./icons";
import { GlassSurface } from "./ui/glass";

const SECTIONS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/woche", label: "Woche", icon: <WeekIcon /> },
  { href: "/einkauf", label: "Einkauf", icon: <ListIcon /> },
  { href: "/rezepte", label: "Rezepte", icon: <BookIcon /> },
  { href: "/favoriten", label: "Favoriten", icon: <HeartIcon /> },
  { href: "/import", label: "Import", icon: <CameraIcon /> },
];

/** The section a path belongs to, by its place in the bar; -1 for none (the settings). */
function sectionOf(pathname: string): number {
  return SECTIONS.findIndex(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * The main sections. On a phone (`floating`) they are a bar of liquid glass that floats
 * above the bottom of the screen, where the thumb is, each with its sign above its name. It
 * keeps clear of the bar the iPhone itself has at its lower edge: right at the edge, a tap
 * on a section brought up the phone's own gestures. On a wider screen they are a row of
 * names in the header.
 *
 * A tapped section is the current one the moment the finger lands, before its page has
 * come: the page took up to a second, and the household tapped again (October 2026). The
 * page then comes in from the side of the section, as the finger moved along the bar.
 */
export function AppNav({ floating = false }: { floating?: boolean }) {
  const pathname = usePathname();
  // The section tapped, and the page it was tapped on: once the page changes it is told by
  // the address again, also when the navigation went elsewhere.
  const [tapped, setTapped] = useState<{ index: number; on: string } | null>(null);
  const here = sectionOf(pathname);
  const current = tapped && tapped.on === pathname ? tapped.index : here;

  const list = (
    <ul className={floating ? "flex" : "flex gap-1"}>
      {SECTIONS.map(({ href, label, icon }, index) => {
        const active = index === current;
        return (
          <li key={href} className={floating ? "min-w-0 flex-1" : undefined}>
            <Link
              href={href}
              transitionTypes={sideways(here, index)}
              aria-current={active ? "page" : undefined}
              onPointerDown={() => setTapped({ index, on: pathname })}
              className={
                floating
                  ? "tab"
                  : `flex min-h-11 items-center rounded-full px-4 font-semibold ${
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
  );

  if (!floating) return <nav aria-label="Hauptbereiche">{list}</nav>;
  return (
    <nav aria-label="Hauptbereiche" className="tabbar">
      <GlassSurface radius={999} tint={0.55} blur={22} className="tabbar-glass">
        {list}
      </GlassSurface>
    </nav>
  );
}
