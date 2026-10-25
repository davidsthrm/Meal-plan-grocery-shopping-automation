import { describe, expect, it } from "vitest";
import {
  FROM_DUPLICATES,
  FROM_STEP_CHECKS,
  FROM_FAVORITES,
  FROM_SHELF,
  fromFieldChecks,
  fromPlan,
  readOrigin,
} from "./origin";

const RECIPE = "0b6d5a52-6f3c-4c6e-9d6a-3f1e2b7c8a90";

const read = (query: string, recipeId?: string) => {
  const params = new URLSearchParams(query);
  return readOrigin(params.get("von") ?? undefined, params.get("w") ?? undefined, {
    recipeId,
    field: params.get("feld") ?? undefined,
    day: params.get("tag") ?? undefined,
  });
};

describe("where a recipe was opened from", () => {
  it("leads back to the week it was opened from", () => {
    expect(read(fromPlan("2026-10-12"))).toEqual({
      href: "/woche?w=2026-10-12",
      label: "Wochenplan",
    });
  });

  it("lands on the day the recipe stands on when it cannot step back", () => {
    expect(read(fromPlan("2026-10-12", "2026-10-15")).href).toBe(
      "/woche?w=2026-10-12#tag-2026-10-15",
    );
    // A day outside the week, or no day at all, leads to the week alone.
    expect(read(fromPlan("2026-10-12", "2026-10-19")).href).toBe("/woche?w=2026-10-12");
    expect(read("?von=woche&w=2026-10-12&tag=x#y").href).toBe("/woche?w=2026-10-12");
  });

  it("leads back to the favourites", () => {
    expect(read(FROM_FAVORITES)).toEqual({ href: "/favoriten", label: "Favoriten" });
  });

  it("leads back to the recipe among the fields to check, under the same filter", () => {
    expect(read(fromFieldChecks("protein"), RECIPE)).toEqual({
      href: `/import/pruefen/angaben?feld=protein#r-${RECIPE}`,
      label: "Angaben prüfen",
    });
    expect(read(fromFieldChecks(null), RECIPE).href).toBe(`/import/pruefen/angaben#r-${RECIPE}`);
    expect(read("?von=angaben&feld=//boese", "x#y").href).toBe("/import/pruefen/angaben");
  });

  it("leads back to the recipe in the Regal", () => {
    expect(read(FROM_SHELF, RECIPE)).toEqual({
      href: `/rezepte/regal#r-${RECIPE}`,
      label: "Regal",
    });
    expect(read(FROM_SHELF, "x#y").href).toBe("/rezepte/regal");
  });

  it("leads back to the duplicates", () => {
    expect(read(FROM_DUPLICATES)).toEqual({
      href: "/import/pruefen/doppelt",
      label: "Doppelte Rezepte",
    });
  });

  it("leads back to the recipe among the steps to check", () => {
    expect(read(FROM_STEP_CHECKS, RECIPE)).toEqual({
      href: `/import/pruefen/schritte#r-${RECIPE}`,
      label: "Arbeitsschritte prüfen",
    });
    expect(read(FROM_STEP_CHECKS, "x#y").href).toBe("/import/pruefen/schritte");
  });

  it("is the library for everything else", () => {
    expect(read("")).toEqual({ href: "/rezepte", label: "Entdecken" });
    expect(read("?von=irgendwo")).toEqual({ href: "/rezepte", label: "Entdecken" });
  });

  it("takes nothing from the address but a week", () => {
    expect(read("?von=woche&w=//boese.example").href).toBe("/woche");
    expect(read("?von=woche&w=2026-10-13").href).toBe("/woche");
    expect(read("?von=woche").href).toBe("/woche");
  });
});
