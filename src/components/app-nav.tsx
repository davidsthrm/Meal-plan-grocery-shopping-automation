"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sideways } from "@/lib/transitions";

/**
 * The places the household goes every week. Bringing recipes in is done now and then: it is
 * "+ Rezept" on Rezepte, and its pages (`also`) belong to Rezepte (25 November 2026).
 */
const SECTIONS: { href: string; label: string; also?: string }[] = [
  { href: "/woche", label: "Woche" },
  { href: "/einkauf", label: "Einkauf" },
  { href: "/rezepte", label: "Rezepte", also: "/import" },
  { href: "/favoriten", label: "Favoriten" },
];

const under = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** The section a path belongs to, by its place in the row; -1 for none (the settings). */
function sectionOf(pathname: string): number {
  return SECTIONS.findIndex(
    ({ href, also }) => under(pathname, href) || (also !== undefined && under(pathname, also)),
  );
}

/**
 * The main sections, four words in the header: on a phone a row of their own under the
 * logo, the Merkzettel and the account, on a wider screen beside them. The open one is in
 * ink under a stroke of the highlighter, the others muted (`.sections`).
 *
 * A tapped section is the current one the moment the finger lands, before its page has
 * come: the page took up to a second, and the household tapped again (October 2026). The
 * page then comes in from the side of the section, as the finger moved along the row.
 */
export function AppNav() {
  const pathname = usePathname();
  // The section tapped, and the page it was tapped on: once the page changes it is told by
  // the address again, also when the navigation went elsewhere.
  const [tapped, setTapped] = useState<{ index: number; on: string } | null>(null);
  const here = sectionOf(pathname);
  const current = tapped && tapped.on === pathname ? tapped.index : here;

  // From now on the links are Next.js's. A section tapped before (`EARLY_TAP` in the root
  // layout) is tapped again, now as a link of the app.
  useEffect(() => {
    const early = window as Window & { appNavStarted?: boolean; earlyTap?: string | null };
    early.appNavStarted = true;
    const href = early.earlyTap;
    early.earlyTap = null;
    if (href) {
      document
        .querySelector<HTMLAnchorElement>(`nav[aria-label="Hauptbereiche"] a[href="${href}"]`)
        ?.click();
    }
  }, []);

  return (
    <nav aria-label="Hauptbereiche" className="sections">
      <ul>
        {SECTIONS.map(({ href, label }, index) => (
          <li key={href}>
            <Link
              href={href}
              // The whole page ahead, kept for minutes: a tab answers without the server.
              prefetch
              transitionTypes={sideways(here, index)}
              aria-current={index === current ? "page" : undefined}
              onPointerDown={() => setTapped({ index, on: pathname })}
              className="section-link"
            >
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
