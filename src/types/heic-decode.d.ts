declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA, 8 bits per channel. */
    data: Uint8ClampedArray;
  }
  export default function decode(input: { buffer: Uint8Array }): Promise<DecodedImage>;
}
