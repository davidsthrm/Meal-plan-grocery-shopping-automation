import type { Pictogram } from "@/domain/library/pictogram";
import { PICTOGRAM_PATHS } from "./pictogram-paths";

/** A recipe's pictogram, drawn as lines in the colour of the text around it. Decorative. */
export function PictogramIcon({ name, className }: { name: Pictogram; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PICTOGRAM_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
