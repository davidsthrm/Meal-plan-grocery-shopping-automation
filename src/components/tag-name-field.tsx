"use client";

import { useId, useState } from "react";
import { similarTag, suggestTags } from "@/domain/library/tag-admin";
import type { Tag } from "@/domain/library/tags";

/**
 * A field to type a tag into. While someone types, the tags there are already are offered
 * first, so that "Oma Rezept" does not appear next to "Omas Rezept". Picking one ticks its
 * chip in the same form (`chipPrefix`), or puts its name into the field. A name typed anyway that
 * is nearly one there is becomes that one on the server (`similarTag`); the field says so.
 */
export function TagNameField({
  name,
  label,
  tags,
  chipPrefix,
  placeholder = "z. B. Omas Rezept",
}: {
  name: string;
  label: string;
  tags: readonly Tag[];
  /** What the id of the chip that stands for a tag starts with, to tick it instead. */
  chipPrefix?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const id = useId();
  const typed = text.trim();
  const offered = suggestTags(typed, tags);
  const same = typed === "" ? null : similarTag(typed, tags);

  const pick = (tag: Tag) => {
    const chip = chipPrefix ? document.getElementById(`${chipPrefix}${tag.ref}`) : null;
    if (chip instanceof HTMLInputElement) {
      chip.checked = true;
      setText("");
    } else {
      setText(tag.name);
    }
  };

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        className="field"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={60}
        placeholder={placeholder}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
      />
      <div id={`${id}-hint`} aria-live="polite">
        {offered.length > 0 && !(same && same.name === typed) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted">Gibt es schon:</span>
            {offered.map((tag) => (
              <button
                key={tag.ref}
                type="button"
                className="chip min-h-9 px-3 text-sm"
                onClick={() => pick(tag)}
              >
                {tag.name}
                <span className="font-normal text-muted">{tag.group}</span>
              </button>
            ))}
          </div>
        )}
        {typed !== "" &&
          (same ? (
            same.name !== typed && (
              <p className="mt-1.5 text-sm text-muted">Wird zu „{same.name}“.</p>
            )
          ) : (
            <p className="mt-1.5 text-sm text-muted">Neu unter „Eigene“.</p>
          ))}
      </div>
    </div>
  );
}
