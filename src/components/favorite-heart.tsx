"use client";

import { useFormStatus } from "react-dom";
import { HeartIcon } from "./icons";

/**
 * The heart in the corner of a recipe card. It fills, or empties, as soon as it is tapped,
 * while the form is still on its way.
 */
export function FavoriteHeart({ favorite, title }: { favorite: boolean; title: string }) {
  const { pending } = useFormStatus();
  const shown = pending ? !favorite : favorite;
  return (
    <button
      className="heart"
      aria-label={`Favorit: ${title}`}
      aria-pressed={favorite}
      disabled={pending}
      data-on={shown}
    >
      <HeartIcon filled={shown} />
    </button>
  );
}
