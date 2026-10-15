import type { Shop } from "@/domain/catalog";

/**
 * A supermarket's logo on a small white tile, or the first letter of its name where no logo
 * is known. The logo comes from Wikimedia Commons as it is: decorative, the name stands next
 * to it. Its size is set in pixels on the element itself, so that the picture, 128 pixels
 * wide, can never grow past it: with a size class that the stylesheet did not have, a logo
 * filled half the note.
 */
export function ShopLogo({
  shop,
  size = 44,
}: {
  shop: Pick<Shop, "name" | "logoUrl">;
  /** Width and height in pixels. */
  size?: number;
}) {
  const inner = Math.max(8, size - 8);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white leading-none font-bold text-muted"
    >
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small picture from Commons
        <img
          src={shop.logoUrl}
          alt=""
          loading="lazy"
          width={inner}
          height={inner}
          style={{ width: inner, height: inner, objectFit: "contain" }}
        />
      ) : (
        shop.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
