import { ShopLogo } from "@/components/shop-logo";
import type { AisleGroup, Shop } from "@/domain/catalog";
import { minimap } from "@/domain/minimap";
import { kindsText } from "@/domain/shopping-list/supermarkets";
import { LiveMap, type MapShop } from "./live-map";

/**
 * The supermarkets found near the household on a map of OpenStreetMap: each where it
 * stands, by its logo, the household's own ones ringed in green and above the others. It
 * moves and zooms, and a tap on a market chooses it (`LiveMap`). Underneath lies the same
 * map as plain pictures, shown until the script has loaded and without one. Nothing without
 * a market whose place is known; "Neu suchen" finds the places of markets found before.
 */
export function SupermarketMap({
  shops,
  chosen,
  aisleGroups,
}: {
  shops: readonly Shop[];
  chosen: readonly Shop[];
  aisleGroups: readonly AisleGroup[];
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
  const live: MapShop[] = placed.map((shop) => ({
    id: shop.id,
    name: shop.name,
    logoUrl: shop.logoUrl ?? null,
    address: shop.address ?? null,
    kinds: kindsText(shop, aisleGroups),
    lat: (shop.position as { lat: number }).lat,
    lon: (shop.position as { lon: number }).lon,
    role: chosen[0]?.id === shop.id ? "main" : own.has(shop.id) ? "more" : "none",
  }));
  return (
    // Taller on a phone, where a finger needs room to move the map. The plain map keeps the
    // proportions it was laid out for, in the middle.
    <figure className="relative mt-3 aspect-[4/3] overflow-hidden rounded-lg border border-line bg-paper sm:aspect-[2/1]">
      <div className="absolute inset-x-0 top-1/2 aspect-[2/1] -translate-y-1/2">
        <div className="map-tiles">
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
        </div>
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
      </div>
      <LiveMap shops={live} />
      <figcaption className="absolute right-0 bottom-0 z-10 rounded-tl bg-surface/85 px-1.5 text-[11px] text-muted">
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
