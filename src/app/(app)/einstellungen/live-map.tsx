"use client";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, StarIcon } from "@/components/icons";
import { ShopLogo } from "@/components/shop-logo";
import { SubmitButton } from "@/components/submit-button";
import { markSupermarket } from "./actions";

/** A supermarket as the map shows it. */
export interface MapShop {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  /** The kinds of grocery bought there: "Tiefkühl · Eier". */
  kinds: string;
  lat: number;
  lon: number;
  role: "main" | "more" | "none";
}

/** The side of a mark in pixels: the household's markets larger, the main one largest. */
const SIZE = { main: 40, more: 34, none: 28 } as const;

/**
 * A mark on the map: the market's logo on a white tile, or its first letter, as `ShopLogo`
 * draws it; ringed in green for the household's markets, with a star on the main one.
 * Built as elements, not as text, so that no name can become markup.
 */
function markElement(shop: MapShop, selected: boolean): HTMLElement {
  const size = SIZE[shop.role];
  const mark = document.createElement("span");
  mark.className = `map-mark map-mark-${shop.role}${selected ? " map-mark-selected" : ""}`;
  mark.style.width = `${size}px`;
  mark.style.height = `${size}px`;
  mark.style.fontSize = `${Math.round(size * 0.45)}px`;
  if (shop.logoUrl) {
    const logo = document.createElement("img");
    logo.src = shop.logoUrl;
    logo.alt = "";
    logo.width = size - 10;
    logo.height = size - 10;
    // On the element itself: Leaflet's stylesheet sets marker pictures to "width: auto",
    // and a logo from Commons then came in at full size over half the map.
    logo.style.width = `${size - 10}px`;
    logo.style.height = `${size - 10}px`;
    logo.draggable = false;
    mark.append(logo);
  } else {
    mark.textContent = shop.name.slice(0, 1).toUpperCase();
  }
  if (shop.role === "main") {
    const star = document.createElement("span");
    star.className = "map-mark-star";
    star.textContent = "★";
    mark.append(star);
  }
  return mark;
}

/**
 * The supermarkets on a map that moves and zooms: Leaflet over the tiles of OpenStreetMap,
 * tinted to the paper of the app. It lies over the plain map of `SupermarketMap` once its
 * script has loaded; before that, and without scripts, the plain one shows. A tap on a
 * market shows it in a card on the map, where it is chosen, put away or made the main one,
 * as on its tile below. The mouse wheel zooms only after a click into the map, so that the
 * page scrolls past it.
 */
export function LiveMap({ shops }: { shops: readonly MapShop[] }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const marksRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // The map itself, once.
  useEffect(() => {
    let gone = false;
    import("leaflet").then((L) => {
      if (gone || !box.current) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const map = L.map(box.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        zoomSnap: 0.5,
        minZoom: 9,
        maxZoom: 18,
        fadeAnimation: !still,
        zoomAnimation: !still,
        markerZoomAnimation: !still,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "map-tiles",
      }).addTo(map);
      map.on("click", () => {
        map.scrollWheelZoom.enable();
        setSelected(null);
      });
      map.on("mouseout", () => map.scrollWheelZoom.disable());
      leafletRef.current = L;
      mapRef.current = map;
      marksRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      gone = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // The marks, again whenever the markets or the one tapped change; the view stays.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const marks = marksRef.current;
    if (!ready || !L || !map || !marks) return;
    marks.clearLayers();
    // The household's markets lie on top, the main one above all.
    const order = { none: 0, more: 1, main: 2 };
    for (const shop of [...shops].sort((a, b) => order[a.role] - order[b.role])) {
      const size = SIZE[shop.role];
      const marker = L.marker([shop.lat, shop.lon], {
        icon: L.divIcon({
          html: markElement(shop, shop.id === selected),
          className: "map-mark-anchor",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        title: shop.name,
        alt: shop.name,
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: shop.id === selected ? 1000 : order[shop.role] * 100,
      });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        setSelected(shop.id);
      });
      marker.addTo(marks);
    }
    if (!fittedRef.current && shops.length > 0) {
      fittedRef.current = true;
      showAll(map, L, shops);
    }
  }, [ready, shops, selected]);

  const chosen = shops.find((shop) => shop.id === selected) ?? null;
  const zoom = (by: number) => mapRef.current?.setZoom(mapRef.current.getZoom() + by);

  return (
    <div className={`absolute inset-0 isolate ${ready ? "" : "pointer-events-none opacity-0"}`}>
      <div
        ref={box}
        className="size-full"
        role="region"
        aria-label="Karte der Supermärkte, mit Pfeiltasten verschieben"
      />
      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1.5">
        <button type="button" className="map-button" aria-label="Näher" onClick={() => zoom(1)}>
          +
        </button>
        <button
          type="button"
          className="map-button"
          aria-label="Weiter weg"
          onClick={() => zoom(-1)}
        >
          −
        </button>
        <button
          type="button"
          className="map-button map-button-words"
          aria-label="Alle Märkte zeigen"
          onClick={() => {
            const L = leafletRef.current;
            if (mapRef.current && L) showAll(mapRef.current, L, shops);
          }}
        >
          Alle
        </button>
      </div>
      {chosen && <ChosenCard shop={chosen} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** Moves the map so that every market is on it, with room around. */
function showAll(map: LeafletMap, L: typeof import("leaflet"), shops: readonly MapShop[]) {
  const bounds = L.latLngBounds(shops.map((shop) => [shop.lat, shop.lon]));
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
}

/** The market tapped on the map, with what can be done with it. */
function ChosenCard({ shop, onClose }: { shop: MapShop; onClose: () => void }) {
  const chosen = shop.role !== "none";
  // The name on a row of its own, the buttons below it: side by side on a phone the name
  // had room for three letters.
  return (
    <div
      role="dialog"
      aria-label={shop.name}
      className="absolute inset-x-2 bottom-2 z-[1000] rounded-lg border border-line bg-surface p-2 shadow-lg sm:right-auto sm:w-80"
    >
      <div className="flex items-center gap-3">
        <ShopLogo shop={shop} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{shop.name}</p>
          <p className="truncate text-sm text-muted">
            {[
              shop.role === "main" ? "Hauptmarkt" : shop.role === "more" ? "Weiterer Markt" : null,
              shop.address,
            ]
              .filter(Boolean)
              .join(" · ") || "Ohne Adresse"}
          </p>
          {chosen && shop.kinds && <p className="truncate text-sm text-accent">{shop.kinds}</p>}
        </div>
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center self-start rounded-full text-muted hover:bg-accent-soft"
          aria-label={`${shop.name} schließen`}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {chosen && shop.role !== "main" && (
          <form action={markSupermarket}>
            <input type="hidden" name="id" value={shop.id} />
            <input type="hidden" name="as" value="main" />
            <SubmitButton className="btn btn-small gap-1.5 pl-2">
              <StarIcon />
              Zum Hauptmarkt
            </SubmitButton>
          </form>
        )}
        <form action={markSupermarket}>
          <input type="hidden" name="id" value={shop.id} />
          <input type="hidden" name="as" value={chosen ? "none" : "more"} />
          <SubmitButton className={`btn btn-small ${chosen ? "" : "btn-primary"}`}>
            {chosen ? "Abwählen" : "Auswählen"}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
