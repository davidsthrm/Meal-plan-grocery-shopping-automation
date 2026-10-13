"use client";

import { useState } from "react";

/**
 * A link to pass on: shown in full, with a button that hands it to the phone's own sharing
 * (a message to the family) or, where there is none, copies it.
 */
export function CopyLink({ link, what }: { link: string; what: string }) {
  const [done, setDone] = useState(false);
  const pass = async () => {
    try {
      if (navigator.share) await navigator.share({ title: what, url: link });
      else await navigator.clipboard.writeText(link);
      setDone(true);
    } catch {
      // Sharing was called off. The link is still there to copy by hand.
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input
        readOnly
        value={link}
        aria-label={what}
        className="field min-w-0 flex-1 text-sm"
        onFocus={(event) => event.target.select()}
      />
      <button type="button" className="btn" onClick={pass}>
        {done ? "Weitergegeben" : "Weitergeben"}
      </button>
    </div>
  );
}
