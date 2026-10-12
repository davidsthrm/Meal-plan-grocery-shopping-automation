import {
  COPY_NAMES,
  cropsFor,
  turnFor,
  turnOfCopy,
  TURNS,
  type Crop,
  type PageFrame,
  type Turn,
} from "@/domain/import/frame";
import { shrinkImage, turnImage } from "./normalize-image";
import type { FrameModels } from "./read-recipe";

/**
 * Makes a stored page presentable: upright, and with the part of each recipe known. The
 * page is looked at in small copies; turning and cutting happen on the stored size.
 */

/** Longest edge of each of the four copies the upright one is chosen from. */
const CHOICE_EDGE = 1024;
/** Longest edge of the copy the recipes are located on. */
const LOOK_EDGE = 1280;

export interface FramedPage {
  /** The page upright. The photo as given when it is not certain how it lies. */
  image: Buffer;
  /** How far it was turned clockwise. */
  turned: Turn;
  /** The part to show per recipe title. Null for the whole page. */
  crops: Map<string, Crop | null>;
  /**
   * False when the two looks at the page disagreed about how it lies. The photo is then
   * given back as it was, whole: better that than a guess.
   */
  certain: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Finds out how a page lies and where its recipes are, in two requests that have to agree.
 * The first picks the upright one of the photo's four turns. The second locates the recipes
 * on that copy and says for itself whether the text is upright there.
 */
export async function framePage(
  photo: Buffer,
  titles: string[],
  models: FrameModels,
): Promise<FramedPage> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const count = (spent: FramedPage["usage"]) => {
    usage.inputTokens += spent.inputTokens;
    usage.outputTokens += spent.outputTokens;
  };

  const copies = await Promise.all(
    TURNS.map((turn, i) => shrinkImage(photo, CHOICE_EDGE, COPY_NAMES[i], turn)),
  );
  const choice = await models.upright(copies);
  count(choice.usage);
  const turned = turnOfCopy(choice.upright);
  const image = turned === 0 ? photo : await turnImage(photo, turned);

  const look = await models.frame(await shrinkImage(image, LOOK_EDGE), titles);
  count(look.usage);
  if (turnFor(look.frame.textTop) !== 0) {
    const whole = new Map(titles.map((title): [string, Crop | null] => [title, null]));
    return { image: photo, turned: 0, crops: whole, certain: false, usage };
  }
  return {
    image,
    turned,
    crops: cropsFor(look.frame as PageFrame, titles),
    certain: true,
    usage,
  };
}
