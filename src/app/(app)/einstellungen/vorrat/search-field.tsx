"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";

/**
 * The search of the Vorrat page. It is a plain form that is sent with Enter; with scripts,
 * the list follows while typing, a moment after the last letter.
 */
export function SearchField({ query }: { query: string }) {
  const router = useRouter();
  const path = usePathname();
  const [typed, setTyped] = useState(query);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const wait = setTimeout(() => {
      const q = typed.trim();
      router.replace(q ? `${path}?${new URLSearchParams({ q })}` : path, { scroll: false });
    }, 250);
    return () => clearTimeout(wait);
  }, [typed, path, router]);

  return (
    <form role="search" className="relative">
      <label>
        <span className="sr-only">Zutat suchen</span>
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
          <SearchIcon />
        </span>
        <input
          name="q"
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={80}
          autoComplete="off"
          className="field pl-10"
          placeholder="Suchen oder hinzufügen, z. B. Mehl"
        />
      </label>
    </form>
  );
}
