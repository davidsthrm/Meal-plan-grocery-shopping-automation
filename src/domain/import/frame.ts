import { z } from "zod";
import { normalizeName } from "../catalog";

/**
 * How a page photo has to be shown for one recipe: turned so the text is upright, and cut
 * down to the part that belongs to the recipe. A phone held flat over a book often stores
 * the photo sideways, and a double page shows the neighbouring recipes as well.
 */

/** Where the top of the text is in the photo as it was taken. */
export const TEXT_TOPS = ["top", "right", "bottom", "left"] as const;
export type TextTop = (typeof TEXT_TOPS)[number];

export const pageFrameSchema = z.object({
  textTop: z.enum(TEXT_TOPS),
  recipes: z.array(
    z.object({
      title: z.string(),
      // Edges of the recipe's area as fractions of the photo's width and height.
      left: z.number(),
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
    }),
  ),
});

export type PageFrame = z.infer<typeof pageFrameSchema>;

/** The four ways a photo can lie, as turns clockwise from how it was taken. */
export const TURNS = [0, 90, 180, 270] as const;
export type Turn = (typeof TURNS)[number];

/**
 * How a photo lies is asked as a choice: the model sees the photo in all four turns, named
 * A to D, and says which one is upright. Asked about one photo alone, it tells a page on its
 * side from an upright one, but mixes up the two sides and sometimes takes an upside-down
 * page for upright.
 */
export const COPY_NAMES = ["A", "B", "C", "D"] as const;
export type CopyName = (typeof COPY_NAMES)[number];

export const uprightChoiceSchema = z.object({
  // Asked before the choice, so that it is made from letters that were read.
  words: z.string(),
  upright: z.enum(COPY_NAMES),
});

export type UprightChoice = z.infer<typeof uprightChoiceSchema>;

/** How far the photo was turned in the copy with this name. */
export function turnOfCopy(name: CopyName): Turn {
  return TURNS[COPY_NAMES.indexOf(name)];
}

/** How far a photo has to be turned clockwise so that its text is upright. */
export function turnFor(textTop: TextTop): Turn {
  // The top of the text at the left edge means the page lies on its left side.
  return ({ top: 0, left: 90, bottom: 180, right: 270 } as const)[textTop];
}

/** A part of a photo, as fractions of its width and height. */
export interface Crop {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Room around what the model marked: its boxes tend to cut the first letters of a column. */
const MARGIN = 0.04;
/** A part this large is the page itself. */
const WHOLE_PAGE = 0.8;
/** A recipe is never this narrow or this flat; such a box is a mistake. */
const SMALLEST_SIDE = 0.2;

/**
 * The part of an upright page to show for one recipe, or null to show the whole page.
 * Showing too much is harmless, cutting something off is not: a box that makes no sense, or
 * that covers most of the page anyway, is not used.
 */
export function cropFor(box: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): Crop | null {
  const values = [box.left, box.top, box.right, box.bottom];
  if (values.some((value) => !Number.isFinite(value))) return null;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const left = clamp(box.left - MARGIN);
  const top = clamp(box.top - MARGIN);
  const right = clamp(box.right + MARGIN);
  const bottom = clamp(box.bottom + MARGIN);
  const width = right - left;
  const height = bottom - top;
  if (width < SMALLEST_SIDE || height < SMALLEST_SIDE) return null;
  if (width * height >= WHOLE_PAGE) return null;
  return { left, top, width, height };
}

/**
 * The crop for each recipe of a page, by title as the app knows it. A page with one recipe is
 * shown whole. A recipe the model did not name, or named twice, is shown whole as well.
 */
export function cropsFor(frame: PageFrame, titles: readonly string[]): Map<string, Crop | null> {
  const crops = new Map<string, Crop | null>(titles.map((title) => [title, null]));
  if (titles.length < 2) return crops;
  for (const title of titles) {
    const boxes = frame.recipes.filter(
      (recipe) => normalizeName(recipe.title) === normalizeName(title),
    );
    if (boxes.length === 1) crops.set(title, cropFor(boxes[0]));
  }
  return crops;
}
