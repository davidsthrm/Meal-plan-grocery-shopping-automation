import { ShopLogo } from "@/components/shop-logo";
import type { Shop } from "@/domain/catalog";
import { minimap } from "@/domain/minimap";

/**
 * The supermarkets found near the household on a small map of OpenStreetMap: each where it
 * stands, by its logo, the household's own ones ringed in green and above the others. Plain
 * pictures, no script: it shows where the markets are and nothing more. Nothing without a
 * market whose place is known; "Neu suchen" finds the places of markets found before.
 */
export function SupermarketMap({
  shops,
  chosen,
}: {
  shops: readonly Shop[];
  chosen: readonly Shop[];
}) {
  const placed = shops.filter((shop) => shop.position);
  const map = minimap(
    placed.map((shop) => ({ id: shop.id, ...(shop.position as { lat: number; lon: number }) })),
  );
  if (!map) return null;
  const byId = new Map(placed.map((shop) => [shop.id, shop]));
  const own = new Set(chosen.map((shop) => shop.id));
  // The household's markets are drawn last, so that they lie on top.
  const marks = [...map.marks].sort((a, b) => Number(own.has(a.id)) - Number(own.has(b.id)));
  return (
    <figure className="relative mt-3 aspect-[2/1] overflow-hidden rounded-lg border border-line bg-paper">
      {map.tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element -- map tiles of OpenStreetMap
        <img
          key={tile.url}
          src={tile.url}
          alt=""
          loading="lazy"
          className="absolute max-w-none select-none"
          style={{
            left: `${tile.left}%`,
            top: `${tile.top}%`,
            width: `${tile.width}%`,
            height: `${tile.height}%`,
          }}
        />
      ))}
      <ul aria-label="Supermärkte auf der Karte">
        {marks.map((mark) => {
          const shop = byId.get(mark.id) as Shop;
          const ours = own.has(shop.id);
          return (
            <li
              key={mark.id}
              title={shop.name}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg ${
                ours ? "ring-2 ring-accent" : "opacity-90"
              }`}
              style={{ left: `${mark.left}%`, top: `${mark.top}%` }}
            >
              <span className="sr-only">
                {shop.name}
                {ours ? ", einer eurer Märkte" : ""}
              </span>
              <ShopLogo shop={shop} size={ours ? 30 : 24} />
            </li>
          );
        })}
      </ul>
      <figcaption className="absolute right-0 bottom-0 rounded-tl bg-white/85 px-1.5 text-[11px] text-muted">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>
      </figcaption>
    </figure>
  );
}
