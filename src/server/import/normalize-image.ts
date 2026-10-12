import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";

/**
 * Turns an uploaded photo into what the app stores and what the model reads: an upright
 * JPEG without metadata. iPhone photos carry GPS coordinates and often keep their rotation
 * only as a metadata tag, so neither may survive this step.
 */

/** Longest edge the vision models make use of. Larger images are scaled down by the API. */
export const MODEL_MAX_EDGE = 2576;

export interface PreparedImage {
  /** Tells the model what it is looking at: "Page 1", or an enlarged part of it. */
  label: string;
  data: Buffer;
  width: number;
  height: number;
}

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

/** Detects HEIC by content. File extensions vary (".heic", ".HEIC") and can be wrong. */
export function isHeic(input: Uint8Array): boolean {
  if (input.length < 12) return false;
  const text = (from: number, to: number) => String.fromCharCode(...input.subarray(from, to));
  return text(4, 8) === "ftyp" && HEIF_BRANDS.includes(text(8, 12));
}

/**
 * Decodes any supported upload to upright pixels. sharp cannot decode the HEVC inside iPhone
 * HEIC files, so those go through a WASM decoder first, which also applies the rotation.
 * Colours of wide-gamut photos shift slightly; that is irrelevant for reading text.
 */
async function upright(input: Buffer): Promise<Sharp> {
  if (isHeic(input)) {
    const { width, height, data } = await decodeHeic({ buffer: input });
    const pixels = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return sharp(pixels, { raw: { width, height, channels: 4 } }).removeAlpha();
  }
  // Bake the EXIF rotation into the pixels and continue from a clean buffer, so that later
  // crops are measured on the upright image.
  const { data, info } = await sharp(input)
    .autoOrient()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

async function toJpeg(image: Sharp, label: string): Promise<PreparedImage> {
  // sharp drops EXIF, GPS and colour profiles unless asked to keep them.
  const { data, info } = await image.jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { label, data, width: info.width, height: info.height };
}

/** The photo as it is stored and shown: upright, no metadata, at most `maxEdge` long. */
export async function normalizeImage(
  input: Buffer,
  label = "Page 1",
  maxEdge = MODEL_MAX_EDGE,
): Promise<PreparedImage> {
  const image = await upright(input);
  return toJpeg(image.resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true }), label);
}

export interface TileOptions {
  /** Largest edge of one tile in pixels of the original photo. */
  tileEdge?: number;
  /** Share of a tile that overlaps its neighbour, so no line is cut in two without a copy. */
  overlap?: number;
}

/**
 * The whole page plus enlarged parts at the photo's full resolution. A 24 megapixel page
 * scaled to the model's limit loses more than half its resolution, which is where small
 * fractions get misread. A photo that already fits needs no tiles.
 */
export async function prepareForModel(
  input: Buffer,
  label = "Page 1",
  options: TileOptions = {},
): Promise<PreparedImage[]> {
  const tileEdge = options.tileEdge ?? MODEL_MAX_EDGE;
  const overlap = options.overlap ?? 0.1;
  const image = await upright(input);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const full = () =>
    sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });

  const overview = await toJpeg(
    full().resize(MODEL_MAX_EDGE, MODEL_MAX_EDGE, { fit: "inside", withoutEnlargement: true }),
    label,
  );
  const columns = Math.ceil(info.width / tileEdge);
  const rows = Math.ceil(info.height / tileEdge);
  if (columns === 1 && rows === 1) return [overview];

  // Tiles of equal size that cover the page with the requested overlap.
  const width = Math.min(info.width, Math.ceil(info.width / (columns - (columns - 1) * overlap)));
  const height = Math.min(info.height, Math.ceil(info.height / (rows - (rows - 1) * overlap)));
  const position = (index: number, count: number, size: number, total: number) =>
    count === 1 ? 0 : Math.round((index * (total - size)) / (count - 1));

  const tiles: PreparedImage[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push(
        await toJpeg(
          full().extract({
            left: position(column, columns, width, info.width),
            top: position(row, rows, height, info.height),
            width,
            height,
          }),
          `Enlarged part of ${label}, row ${row + 1} of ${rows}, column ${column + 1} of ${columns}`,
        ),
      );
    }
  }
  return [overview, ...tiles];
}

/** A stored page turned clockwise by a multiple of 90 degrees. */
export async function turnImage(jpeg: Buffer, degrees: number): Promise<Buffer> {
  return sharp(jpeg).rotate(degrees).jpeg({ quality: 90 }).toBuffer();
}

/**
 * A small copy of a stored page, turned clockwise if asked: enough to see how it lies and
 * where things are on it.
 */
export async function shrinkImage(
  jpeg: Buffer,
  edge: number,
  label = "Page 1",
  degrees = 0,
): Promise<PreparedImage> {
  const small = await sharp(jpeg)
    .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  return toJpeg(degrees === 0 ? sharp(small) : sharp(small).rotate(degrees), label);
}

/** The part of a stored page given as fractions of its width and height. */
export async function cropImage(
  jpeg: Buffer,
  part: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  const { width, height } = await sharp(jpeg).metadata();
  if (!width || !height) throw new Error("photo without dimensions");
  const left = Math.round(part.left * width);
  const top = Math.round(part.top * height);
  return sharp(jpeg)
    .extract({
      left,
      top,
      width: Math.max(1, Math.min(width - left, Math.round(part.width * width))),
      height: Math.max(1, Math.min(height - top, Math.round(part.height * height))),
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}
