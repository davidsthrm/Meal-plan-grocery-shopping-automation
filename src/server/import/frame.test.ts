import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { TextTop } from "@/domain/import/frame";
import { framePage } from "./frame";
import type { PageFramer } from "./read-recipe";

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

/** A stand-in for the model that answers with one prepared look after the other. */
function framer(...tops: TextTop[]): PageFramer & { looks: () => number } {
  const answers = [...tops];
  const call = vi.fn(async (_image, titles: string[]) => ({
    frame: {
      textTop: answers.shift() ?? "top",
      recipes: titles.map((title, i) =>
        titles.length === 1
          ? { title, ...whole }
          : { title, ...whole, left: i * 0.5, right: i * 0.5 + 0.5 },
      ),
    },
    usage: { inputTokens: 1000, outputTokens: 50 },
  }));
  return Object.assign(call as unknown as PageFramer, { looks: () => call.mock.calls.length });
}

describe("framePage", () => {
  it("leaves an upright page as it is, with one look", async () => {
    const frame = framer("top");
    const result = await framePage(await photo(), ["Eintopf"], frame);
    expect(result.turned).toBe(0);
    expect(await shape(result.image)).toBe("400x200");
    expect(frame.looks()).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 50 });
  });

  it("turns a page that lies on its side and looks again", async () => {
    const frame = framer("right", "top");
    const result = await framePage(await photo(), ["Eintopf"], frame);
    expect(result.turned).toBe(270);
    expect(await shape(result.image)).toBe("200x400");
    expect(frame.looks()).toBe(2);
  });

  it("corrects a turn to the wrong side when the second look says upside down", async () => {
    // The page lies on its right side, the model says left: after that turn it is upside down.
    const frame = framer("left", "bottom", "top");
    const result = await framePage(await photo(), ["Eintopf"], frame);
    expect(result.turned).toBe(270);
    expect(frame.looks()).toBe(3);
  });

  it("gives the photo back untouched when the page never comes out upright", async () => {
    const original = await photo();
    const result = await framePage(original, ["Eintopf", "Salat"], framer("left", "left", "left"));
    expect(result.turned).toBe(0);
    expect(result.image).toBe(original);
    expect([...result.crops.values()]).toEqual([null, null]);
  });

  it("says which part of the upright page belongs to which recipe", async () => {
    const result = await framePage(await photo(), ["Eintopf", "Salat"], framer("top"));
    expect(result.crops.get("Eintopf")).toMatchObject({ left: 0, top: 0, height: 1 });
    expect(result.crops.get("Salat")?.left).toBeCloseTo(0.46);
    // A page with one recipe is shown whole.
    const single = await framePage(await photo(), ["Eintopf"], framer("top"));
    expect(single.crops.get("Eintopf")).toBeNull();
  });
});
