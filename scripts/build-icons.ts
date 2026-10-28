import { readFileSync } from "node:fs";
import sharp from "sharp";
import { STARTUP_SCREENS } from "../src/lib/startup-screens";

/**
 * The app's icons for the home screen, drawn from the logo (`src/app/icon.svg`): a plate
 * with its cutlery on the app's green. Run again after a change of the logo:
 * `npm run icons:build`.
 *
 * - `public/icon-192.png`, `public/icon-512.png`: the logo as it is, with its rounded corners.
 * - `public/icon-maskable-512.png`: green to the edges and the plate smaller, because
 *   Android cuts its own shape out of it (a circle, a squircle) and keeps only the middle.
 * - `src/app/apple-icon.png`: the same for the iPhone, which rounds the corners itself and
 *   shows transparent corners black.
 * - `public/startup/<w>x<h>.png`: the start screen of the installed app on each iPhone,
 *   the plate on the green, as Android shows it from the manifest (`STARTUP_SCREENS`).
 */

const logo = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8");
const green = /<rect[^>]*fill="([^"]+)"/.exec(logo)?.[1];
const plate = /<g[\s\S]*<\/g>/.exec(logo)?.[0];
if (!green || !plate) throw new Error("icon.svg no longer has its green and its plate.");

/** Green to the edges, the plate scaled around the middle. */
function fullBleed(scale: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${green}"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${plate}</g>
</svg>`;
}

async function png(svg: string, size: number, path: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: (72 * size) / 32 })
    .resize(size, size)
    .png()
    .toFile(new URL(`../${path}`, import.meta.url).pathname);
  console.log(`${path} (${size}×${size})`);
}

async function main(): Promise<void> {
  await png(logo, 192, "public/icon-192.png");
  await png(logo, 512, "public/icon-512.png");
  // Android keeps a circle of 80 % of the width: the plate and the cutlery fit inside it.
  await png(fullBleed(0.78), 512, "public/icon-maskable-512.png");
  await png(fullBleed(0.86), 180, "src/app/apple-icon.png");
  for (const { width, height, ratio } of STARTUP_SCREENS) {
    await startup(width * ratio, height * ratio);
  }
}

/** The whole screen green, the plate and its cutlery in the middle, a third of its width. */
async function startup(width: number, height: number): Promise<void> {
  const side = Math.round(width / 3);
  const mark = await sharp(Buffer.from(fullBleed(1)), { density: (72 * side) / 32 })
    .resize(side, side)
    .png()
    .toBuffer();
  const path = `public/startup/${width}x${height}.png`;
  await sharp({ create: { width, height, channels: 3, background: green as string } })
    .composite([{ input: mark, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(new URL(`../${path}`, import.meta.url).pathname);
  console.log(`${path}`);
}

void main();
