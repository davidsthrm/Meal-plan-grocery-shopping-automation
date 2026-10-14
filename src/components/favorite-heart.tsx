"use client";

import { useFormStatus } from "react-dom";
import { HeartIcon } from "./icons";

/**
 * The heart that makes a recipe a favourite: in the corner of a recipe card and next to the
 * title of its page. It fills, or empties, as soon as it is tapped, while the form is still on
 * its way.
 */
export function FavoriteHeart({ favorite, title }: { favorite: boolean; title: string }) {
  const { pending } = useFormStatus();
  const shown = pending ? !favorite : favorite;
  return (
    <button
      className="heart"
      aria-label={`Favorit: ${title}`}
      aria-pressed={favorite}
      title={favorite ? "Favorit" : "Als Favorit merken"}
      disabled={pending}
      data-on={shown}
    >
      <HeartIcon filled={shown} />
    </button>
  );
}
