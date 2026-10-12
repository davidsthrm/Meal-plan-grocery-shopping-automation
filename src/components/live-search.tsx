"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import type { RecipeFilter } from "@/domain/library/filter";
import { searchIndex, type SearchIndex } from "@/domain/library/search-index";
import { SearchIcon } from "./icons";
import { RecipeRow } from "./recipe-card";
import { SubmitButton } from "./submit-button";

/** How many recipes the list under the field shows while someone types. */
const SHOWN = 8;

// One index for the whole visit: it is fetched once and searched for every letter.
let loading: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  loading ??= fetch("/api/suche")
    .then((response) => {
      if (!response.ok) throw new Error(`search index: ${response.status}`);
      return response.json() as Promise<SearchIndex>;
    })
    .catch((error: unknown) => {
      // Try again the next time someone searches.
      loading = null;
      throw error;
    });
  return loading;
}

interface Props {
  /** The page that shows all results when the search is sent. */
  path: string;
  /** What else has to be in the address of that page. */
  hidden: Record<string, string>;
  /** The filter of the page. Its text is what the field starts with. */
  filter: RecipeFilter;
  placeholder?: string;
  /**
   * When recipes are searched to put one on a plan: the action that does it and what says
   * where. A result then has a button; otherwise it opens the recipe.
   */
  plan?: { action: (form: FormData) => Promise<void>; fields: Record<string, string> };
}

/**
 * The search field of the library. A list of recipes unfolds under it with the first letter
 * and changes with every further one. Sending the search shows all results on the page, and
 * that also works before any script has loaded.
 */
export function LiveSearch({
  path,
  hidden,
  filter,
  placeholder = "Titel oder Zutat",
  plan,
}: Props) {
  const [text, setText] = useState(filter.text);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const list = useId();

  useEffect(() => {
    let wanted = true;
    loadIndex()
      .then((loaded) => {
        if (wanted) setIndex(loaded);
      })
      .catch(() => {
        if (wanted) setFailed(true);
      });
    return () => {
      wanted = false;
    };
  }, []);

  const typed = text.trim();
  // What the page shows already is not listed a second time.
  const open = typed !== "" && typed !== filter.text.trim() && !failed;
  const found = useMemo(
    () => (index && open ? searchIndex(index, { ...filter, text: typed }) : null),
    [index, open, filter, typed],
  );
  const categoryName = useMemo(
    () => new Map(index?.categories.map((category) => [category.key, category.name]) ?? []),
    [index],
  );
  const matches = found?.matches ?? [];
  // Nothing fits every word: what fits some of them is better than an empty list.
  const partly = matches.length === 0 ? (found?.related ?? []) : [];
  const shown = (matches.length > 0 ? matches : partly).slice(0, SHOWN);
  const all = `${path}?${new URLSearchParams({ ...hidden, q: typed })}`;

  return (
    <div>
      <Form action={path} className="flex gap-2">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="relative flex-1">
          <span className="sr-only">Rezepte durchsuchen</span>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            name="q"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            className="field pl-10"
            enterKeyHint="search"
            autoComplete="off"
            aria-controls={list}
          />
        </label>
        <button className="btn">Suchen</button>
      </Form>

      {open && (
        <section
          id={list}
          aria-label="Treffer beim Tippen"
          aria-live="polite"
          className="card mt-2 overflow-hidden"
        >
          {!found ? (
            <p className="px-4 py-3 text-muted">Die Suche wird vorbereitet …</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-3 text-muted">Kein Rezept passt zu „{typed}“.</p>
          ) : (
            <>
              {partly.length > 0 && (
                <p className="eyebrow border-b border-line px-4 py-2">Passt zu einem Teil</p>
              )}
              <ul className="divide-y divide-line">
                {shown.map((recipe) => (
                  <RecipeRow
                    key={recipe.id}
                    recipe={recipe}
                    category={recipe.category ? (categoryName.get(recipe.category) ?? null) : null}
                  >
                    {plan && (
                      <form action={plan.action}>
                        {Object.entries(plan.fields).map(([name, value]) => (
                          <input key={name} type="hidden" name={name} value={value} />
                        ))}
                        <input type="hidden" name="recipe" value={recipe.id} />
                        <SubmitButton className="btn btn-small" label={`${recipe.title} einplanen`}>
                          Einplanen
                        </SubmitButton>
                      </form>
                    )}
                  </RecipeRow>
                ))}
              </ul>
              {matches.length > shown.length && (
                <Link href={all} className="link block border-t border-line px-4 py-3 text-sm">
                  Alle {matches.length} Treffer anzeigen
                </Link>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
