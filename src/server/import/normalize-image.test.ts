import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isHeic, MODEL_MAX_EDGE, normalizeImage, prepareForModel } from "./normalize-image";

/** A landscape JPEG whose EXIF says "rotate me to portrait", with GPS data, as phones write it. */
async function phoneJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } } })
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 30/1 0/1" } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

describe("normalizeImage", () => {
  it("bakes the rotation into the pixels and drops all metadata", async () => {
    const input = await phoneJpeg(400, 200);
    const before = await sharp(input).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif).toBeDefined();

    const result = await normalizeImage(input);
    const after = await sharp(result.data).metadata();
    expect([result.width, result.height]).toEqual([200, 400]);
    expect(after.format).toBe("jpeg");
    expect(after.orientation).toBeUndefined();
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
  });

  it("scales large photos down to the model's limit and leaves small ones alone", async () => {
    const large = await normalizeImage(await phoneJpeg(4000, 3000));
    expect([large.width, large.height]).toEqual([1932, MODEL_MAX_EDGE]);
    const small = await normalizeImage(await phoneJpeg(800, 600));
    expect([small.width, small.height]).toEqual([600, 800]);
  });
});

describe("prepareForModel", () => {
  it("returns only the page when it fits the model's limit", async () => {
    const images = await prepareForModel(await phoneJpeg(2000, 1500));
    expect(images.map((i) => i.label)).toEqual(["Whole page"]);
  });

  it("adds full-resolution tiles that cover a large page with overlap", async () => {
    // Upright this is 3000 x 4000: two columns, two rows.
    const images = await prepareForModel(await phoneJpeg(4000, 3000));
    expect(images).toHaveLength(5);
    expect(images[0]).toMatchObject({ label: "Whole page", width: 1932, height: MODEL_MAX_EDGE });
    const tiles = images.slice(1);
    expect(tiles[0].label).toBe("Enlarged part, row 1 of 2, column 1 of 2");
    for (const tile of tiles) {
      expect(tile.width).toBeLessThanOrEqual(MODEL_MAX_EDGE);
      expect(tile.height).toBeLessThanOrEqual(MODEL_MAX_EDGE);
      // Two tiles per direction together are wider than the page: they overlap.
      expect(tile.width * 2).toBeGreaterThan(3000);
      expect(tile.height * 2).toBeGreaterThan(4000);
    }
  });
});

describe("isHeic", () => {
  it("recognises HEIC by content, not by file name", () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(8),
    ]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    expect(isHeic(heic)).toBe(true);
    expect(isHeic(jpeg)).toBe(false);
    expect(isHeic(Buffer.alloc(4))).toBe(false);
  });
});

// The private sample photos are not in the repository. These run only where they exist.
const SAMPLE = "samples/IMG_5681.HEIC";
describe.skipIf(!existsSync(SAMPLE))("sample photos from an iPhone", () => {
  it("decodes HEIC upright and without GPS data", async () => {
    const input = readFileSync(SAMPLE);
    expect(isHeic(input)).toBe(true);
    const result = await normalizeImage(input);
    const meta = await sharp(result.data).metadata();
    // The file stores this portrait photo sideways, with the rotation as metadata.
    expect([result.width, result.height]).toEqual([1932, MODEL_MAX_EDGE]);
    expect(meta.exif).toBeUndefined();
  });

  it("cuts a 24 megapixel recipe page into overview plus six tiles", async () => {
    const images = await prepareForModel(readFileSync("samples/recipes/IMG_5680.HEIC"));
    expect(images).toHaveLength(7);
  });
});
