import type { CSSProperties } from "react";

/**
 * The raised pill of a segmented control, under the open view. It is an element of its own,
 * named for the view transition (`name`, one per control on a page), so that going to the
 * other view slides it across instead of letting it jump. The views of a control are equally
 * wide, so its place follows from its index alone.
 */
export function SegmentPill({ name, at, of }: { name: string; at: number; of: number }) {
  return (
    <span
      aria-hidden
      className="segment-pill"
      style={
        {
          "--at": Math.max(0, at),
          "--count": of,
          viewTransitionName: name,
          display: at < 0 ? "none" : undefined,
        } as CSSProperties
      }
    />
  );
}
