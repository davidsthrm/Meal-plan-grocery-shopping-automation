import type { Shop } from "@/domain/catalog";

/**
 * A supermarket's logo on a small white tile, or the first letter of its name where no logo
 * is known. The logo comes from Wikimedia Commons as it is: decorative, the name stands next
 * to it.
 */
export function ShopLogo({
  shop,
  size = "size-11",
}: {
  shop: Pick<Shop, "name" | "logoUrl">;
  size?: string;
}) {
  return (
    <span
      aria-hidden
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-1 font-bold text-muted`}
    >
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small picture from Commons
        <img
          src={shop.logoUrl}
          alt=""
          loading="lazy"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        shop.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
