import { describe, expect, it } from "vitest";
import { minimap } from "./minimap";

// Two supermarkets in Laupheim, about 1.3 km apart, and one in Biberach, 18 km south.
const aldi = { id: "aldi", lat: 48.2286, lon: 9.8797 };
const rewe = { id: "rewe", lat: 48.2203, lon: 9.8925 };
const biberach = { id: "biberach", lat: 48.0984, lon: 9.7876 };

describe("minimap", () => {
  it("is nothing without a place", () => {
    expect(minimap([])).toBeNull();
  });

  it("shows a single market close up, in the middle", () => {
    const map = minimap([aldi]);
    expect(map?.zoom).toBe(16);
    expect(map?.marks).toEqual([{ id: "aldi", left: 50, top: 50 }]);
  });

  it("shows a town's markets as close as they all fit, with room around them", () => {
    const map = minimap([aldi, rewe])!;
    expect(map.zoom).toBe(14);
    for (const mark of map.marks) {
      expect(mark.left).toBeGreaterThanOrEqual(6);
      expect(mark.left).toBeLessThanOrEqual(94);
      expect(mark.top).toBeGreaterThanOrEqual(12);
      expect(mark.top).toBeLessThanOrEqual(88);
    }
    // The one further north is drawn higher up, the one further east further right.
    const [north, south] = map.marks;
    expect(north.top).toBeLessThan(south.top);
    expect(north.left).toBeLessThan(south.left);
  });

  it("goes further out for a market in the next town", () => {
    expect(minimap([aldi, rewe, biberach])!.zoom).toBeLessThan(13);
  });

  it("covers the whole map with tiles, and only with tiles that touch it", () => {
    const map = minimap([aldi, rewe])!;
    for (const tile of map.tiles) {
      expect(tile.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/14\/\d+\/\d+\.png$/);
      expect(tile.left).toBeLessThan(100);
      expect(tile.top).toBeLessThan(100);
      expect(tile.left + tile.width).toBeGreaterThan(0);
      expect(tile.top + tile.height).toBeGreaterThan(0);
    }
    // 600 by 300 pixels take three or four tiles across and two or three down.
    const across = new Set(map.tiles.map((tile) => tile.left)).size;
    const down = new Set(map.tiles.map((tile) => tile.top)).size;
    expect(across).toBeGreaterThanOrEqual(3);
    expect(down).toBeGreaterThanOrEqual(2);
    expect(Math.min(...map.tiles.map((tile) => tile.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...map.tiles.map((tile) => tile.left + tile.width))).toBeGreaterThanOrEqual(
      100,
    );
  });
});
