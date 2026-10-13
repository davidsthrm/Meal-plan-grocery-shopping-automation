import { describe, expect, it } from "vitest";
import { FROM_FAVORITES, fromPlan, readOrigin } from "./origin";

const read = (query: string) => {
  const params = new URLSearchParams(query);
  return readOrigin(params.get("von") ?? undefined, params.get("w") ?? undefined);
};

describe("where a recipe was opened from", () => {
  it("leads back to the week it was opened from", () => {
    expect(read(fromPlan("2026-10-12"))).toEqual({
      href: "/woche?w=2026-10-12",
      label: "Wochenplan",
    });
  });

  it("leads back to the favourites", () => {
    expect(read(FROM_FAVORITES)).toEqual({ href: "/favoriten", label: "Favoriten" });
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
