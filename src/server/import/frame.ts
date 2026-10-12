import { cropsFor, turnFor, type Crop, type PageFrame, type Turn } from "@/domain/import/frame";
import { shrinkImage, turnImage } from "./normalize-image";
import type { PageFramer } from "./read-recipe";

/**
 * Makes a stored page presentable: upright, and with the part of each recipe known. The
 * page is looked at in a small copy; turning and cutting happen on the stored size.
 */

/** Longest edge of the copy the model looks at. Plenty to see how a page lies. */
const LOOK_EDGE = 1280;
/** How often a page is looked at again after turning it, before giving up. */
const MAX_LOOKS = 3;

export interface FramedPage {
  /** The page upright. The photo as given when it could not be made upright. */
  image: Buffer;
  /** How far it was turned clockwise. */
  turned: Turn;
  /** The part to show per recipe title. Null for the whole page. */
  crops: Map<string, Crop | null>;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Turns a page until its text is upright and says where its recipes are. The model tells a
 * page on its side from an upright one reliably, but not always which side it lies on, so a
 * turned page is looked at again: a wrong turn shows as "upside down" and is corrected.
 */
export async function framePage(
  photo: Buffer,
  titles: string[],
  frame: PageFramer,
): Promise<FramedPage> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  let image = photo;
  let turned = 0;
  for (let look = 0; look < MAX_LOOKS; look++) {
    const answer = await frame(await shrinkImage(image, LOOK_EDGE), titles);
    usage.inputTokens += answer.usage.inputTokens;
    usage.outputTokens += answer.usage.outputTokens;
    const turn = turnFor(answer.frame.textTop);
    if (turn === 0) {
      return {
        image,
        turned: (turned % 360) as Turn,
        crops: cropsFor(answer.frame as PageFrame, titles),
        usage,
      };
    }
    image = await turnImage(image, turn);
    turned += turn;
  }
  // Still not upright after several looks: better the photo as it was than a guess.
  return { image: photo, turned: 0, crops: new Map(titles.map((title) => [title, null])), usage };
}
