import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { CopyName, TextTop } from "@/domain/import/frame";
import { framePage } from "./frame";
import type { PreparedImage } from "./normalize-image";
import type { FrameModels } from "./read-recipe";

/** A photo that is wider than high, so a quarter turn shows in its shape. */
const photo = () =>
  sharp({ create: { width: 400, height: 200, channels: 3, background: "#d8d2c4" } })
    .jpeg()
    .toBuffer();
const shape = async (image: Buffer) => {
  const { width, height } = await sharp(image).metadata();
  return `${width}x${height}`;
};
const whole = { left: 0, top: 0, right: 1, bottom: 1 };
const usage = { inputTokens: 1000, outputTokens: 50 };

/** Stand-ins for the model: one says which copy is upright, one what it sees on that copy. */
function models(upright: CopyName, textTop: TextTop = "top") {
  const copies: PreparedImage[][] = [];
  const looks: PreparedImage[] = [];
  const answers: FrameModels = {
    upright: vi.fn(async (shown: PreparedImage[]) => {
      copies.push(shown);
      return { upright, usage };
    }),
    frame: vi.fn(async (image: PreparedImage, titles: string[]) => {
      looks.push(image);
      return {
        frame: {
          textTop,
          recipes: titles.map((title, i) =>
            titles.length === 1
              ? { title, ...whole }
              : { title, ...whole, left: i * 0.5, right: i * 0.5 + 0.5 },
          ),
        },
        usage,
      };
    }),
  };
  return Object.assign(answers, { copies, looks });
}

describe("framePage", () => {
  it("shows the photo in its four turns and asks which one is upright", async () => {
    const asked = models("A");
    await framePage(await photo(), ["Eintopf"], asked);
    expect(asked.copies).toHaveLength(1);
    expect(asked.copies[0].map((copy) => copy.label)).toEqual(["A", "B", "C", "D"]);
    expect(asked.copies[0].map((copy) => `${copy.width}x${copy.height}`)).toEqual([
      "400x200",
      "200x400",
      "400x200",
      "200x400",
    ]);
  });

  it("leaves an upright page as it is", async () => {
    const result = await framePage(await photo(), ["Eintopf"], models("A"));
    expect(result.turned).toBe(0);
    expect(result.certain).toBe(true);
    expect(await shape(result.image)).toBe("400x200");
    expect(result.usage).toEqual({ inputTokens: 2000, outputTokens: 100 });
  });

  it("turns a page that lies on its side and locates the recipes on the upright copy", async () => {
    const asked = models("D");
    const result = await framePage(await photo(), ["Eintopf"], asked);
    expect(result.turned).toBe(270);
    expect(await shape(result.image)).toBe("200x400");
    expect(`${asked.looks[0].width}x${asked.looks[0].height}`).toBe("200x400");
  });

  it("turns a page that stands on its head", async () => {
    const result = await framePage(await photo(), ["Eintopf"], models("C"));
    expect(result.turned).toBe(180);
    expect(await shape(result.image)).toBe("400x200");
  });

  it("gives the photo back untouched and whole when the two looks disagree", async () => {
    const original = await photo();
    // The chosen copy does not read upright to the second look.
    const result = await framePage(original, ["Eintopf", "Salat"], models("B", "bottom"));
    expect(result.certain).toBe(false);
    expect(result.turned).toBe(0);
    expect(result.image).toBe(original);
    expect([...result.crops.values()]).toEqual([null, null]);
  });

  it("does not cut a page it left as it was, even if that copy was the choice", async () => {
    const result = await framePage(await photo(), ["Eintopf", "Salat"], models("A", "left"));
    expect(result.certain).toBe(false);
    expect([...result.crops.values()]).toEqual([null, null]);
  });

  it("says which part of the upright page belongs to which recipe", async () => {
    const result = await framePage(await photo(), ["Eintopf", "Salat"], models("A"));
    expect(result.crops.get("Eintopf")).toMatchObject({ left: 0, top: 0, height: 1 });
    expect(result.crops.get("Salat")?.left).toBeCloseTo(0.46);
    // A page with one recipe is shown whole.
    const single = await framePage(await photo(), ["Eintopf"], models("A"));
    expect(single.crops.get("Eintopf")).toBeNull();
  });
});
