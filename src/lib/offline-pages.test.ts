import { describe, expect, it } from "vitest";
import type { ShoppingTrip } from "@/domain/shopping-list/trips";
import { hasErrandFrom, pagesForTheShop } from "./offline-pages";

const trip = (date: string, place: ShoppingTrip["place"] = "supermarket"): ShoppingTrip => ({
  date,
  place,
});

describe("pagesForTheShop", () => {
  it("keeps the notes of the week, each note, and the page the navigation leads to", () => {
    const week = [trip("2026-10-10", "market"), trip("2026-10-12"), trip("2026-10-16")];
    expect(pagesForTheShop("2026-10-12", week, "2026-10-14")).toEqual([
      "/einkauf",
      "/einkauf?w=2026-10-12",
      "/einkauf?w=2026-10-12&zettel=2026-10-10.market",
      "/einkauf?w=2026-10-12&zettel=2026-10-12.supermarket",
      "/einkauf?w=2026-10-12&zettel=2026-10-16.supermarket",
    ]);
  });

  it("adds the next errand when it lies in the week after", () => {
    const pages = pagesForTheShop("2026-10-12", [trip("2026-10-12")], "2026-10-14", [
      trip("2026-10-23"),
      trip("2026-10-19"),
      trip("2026-10-17", "market"),
    ]);
    expect(pages.slice(-2)).toEqual([
      "/einkauf?w=2026-10-19",
      "/einkauf?w=2026-10-19&zettel=2026-10-17.market",
    ]);
  });
});

describe("hasErrandFrom", () => {
  it("counts an errand today as still to come", () => {
    expect(hasErrandFrom([trip("2026-10-12"), trip("2026-10-16")], "2026-10-16")).toBe(true);
    expect(hasErrandFrom([trip("2026-10-12")], "2026-10-13")).toBe(false);
  });
});
