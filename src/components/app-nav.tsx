"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/rezepte", label: "Rezepte" },
  { href: "/import", label: "Import" },
] as const;

/** The main sections. On a phone it sits at the bottom, where the thumb is. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptbereiche"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:static sm:border-0 sm:bg-transparent sm:pb-0"
    >
      <ul className="mx-auto flex max-w-3xl sm:gap-1">
        {SECTIONS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-center px-4 font-semibold sm:rounded-lg ${
                  active ? "text-accent sm:bg-accent-soft" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
