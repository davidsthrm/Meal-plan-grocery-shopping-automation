/**
 * The start screens of the installed app on an iPhone: Android draws one from the manifest
 * (the icon on `background_color`), an iPhone shows a picture of exactly its screen's size,
 * or white. One per screen, upright (the app is held upright). Drawn by
 * `npm run icons:build` into `public/startup/`, named by their size in pixels.
 */
export const STARTUP_SCREENS: readonly { width: number; height: number; ratio: number }[] = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // 16 Pro
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus and Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // 12 and 13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 and 13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 736, ratio: 3 }, // 6 to 8 Plus
  { width: 375, height: 667, ratio: 2 }, // 6 to 8, SE
];

/** The picture's address and the screen it is for, as the page's metadata names them. */
export function startupImages() {
  return STARTUP_SCREENS.map(({ width, height, ratio }) => ({
    url: `/startup/${width * ratio}x${height * ratio}.png`,
    media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
  }));
}
