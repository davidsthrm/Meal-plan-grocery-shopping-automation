"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AddressSuggestion } from "@/domain/address-search";

/** How long typing has to pause before the addresses are looked up. */
const PAUSE_MS = 250;

/**
 * The street of a market, with addresses offered while it is typed (`/api/adresse`): a
 * street with its number, or a shop by its name. Picking one also sends where it lies, so
 * that the market stands on the map at once. Typed by hand, or without scripts, it is a
 * plain field, and the server looks the street up when it is saved.
 */
export function AddressField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);
  const lookup = useRef<{ wait?: ReturnType<typeof setTimeout>; stop?: AbortController }>({});
  const id = useId();
  const listId = `${id}-vorschlaege`;

  // Nothing waits for an answer once the field is gone.
  useEffect(() => {
    const pending = lookup.current;
    return () => {
      clearTimeout(pending.wait);
      pending.stop?.abort();
    };
  }, []);

  /** Looks up what was typed once typing pauses; a later letter cancels an earlier lookup. */
  const lookUp = (text: string) => {
    clearTimeout(lookup.current.wait);
    lookup.current.stop?.abort();
    const typed = text.trim();
    if (typed.length < 3) {
      setSuggestions([]);
      return;
    }
    const stop = new AbortController();
    lookup.current.stop = stop;
    lookup.current.wait = setTimeout(async () => {
      try {
        const response = await fetch(`/api/adresse?${new URLSearchParams({ q: typed })}`, {
          signal: stop.signal,
        });
        if (!response.ok) return;
        setSuggestions((await response.json()) as AddressSuggestion[]);
        setActive(-1);
        setOpen(true);
      } catch {
        // Cancelled by the next letter, or no connection: the field takes what is typed.
      }
    }, PAUSE_MS);
  };

  const pick = (suggestion: AddressSuggestion) => {
    clearTimeout(lookup.current.wait);
    lookup.current.stop?.abort();
    setValue(suggestion.address);
    setPicked(suggestion);
    setOpen(false);
    setSuggestions([]);
  };

  const shown = open && suggestions.length > 0;

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="label">
        Adresse
      </label>
      <input
        id={id}
        name="address"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setPicked(null);
          lookUp(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (!shown) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            // Round the list and back to the field itself (-1), where typing goes on.
            const step = event.key === "ArrowDown" ? 1 : -1;
            const stops = suggestions.length + 1;
            setActive((at) => ((at + 1 + step + stops) % stops) - 1);
          } else if (event.key === "Enter" && active >= 0 && active < suggestions.length) {
            event.preventDefault();
            pick(suggestions[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        className="field"
        placeholder="Straße oder Name des Markts"
      />
      <input type="hidden" name="lat" value={picked?.lat ?? ""} />
      <input type="hidden" name="lon" value={picked?.lon ?? ""} />
      <input type="hidden" name="picked" value={picked?.address ?? ""} />
      {picked && (
        <p className="mt-1 text-sm text-accent">
          Steht nach dem Speichern auf der Karte{picked.place ? ` · ${picked.place}` : ""}
        </p>
      )}
      <div
        className={`absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg ${
          shown ? "" : "hidden"
        }`}
      >
        <ul id={listId} role="listbox" aria-label="Vorschläge">
          {suggestions.map((suggestion, at) => (
            <li
              key={`${suggestion.name ?? ""}${suggestion.address}${suggestion.place ?? ""}`}
              id={`${listId}-${at}`}
              role="option"
              aria-selected={at === active}
              // Before the field loses its focus, or the list would be gone before the tap.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(suggestion)}
              className={`flex min-h-11 cursor-pointer flex-col justify-center border-b border-line/60 px-3 py-1.5 last:border-b-0 ${
                at === active ? "bg-accent-soft" : ""
              }`}
            >
              <span className="truncate">
                {suggestion.name && <span className="font-semibold">{suggestion.name} · </span>}
                {suggestion.address}
              </span>
              {suggestion.place && (
                <span className="truncate text-sm text-muted">{suggestion.place}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="bg-paper px-3 py-1 text-[11px] text-muted">Vorschläge aus OpenStreetMap</p>
      </div>
    </div>
  );
}
