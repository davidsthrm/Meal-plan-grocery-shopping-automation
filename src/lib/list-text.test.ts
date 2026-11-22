import { describe, expect, it } from "vitest";
import { resolveLine } from "@/domain/shopping-list/present";
import type { ShoppingLine } from "@/domain/shopping-list/types";
import { exactText } from "./list-text";

const line = (patch: Partial<ShoppingLine>): ShoppingLine => ({
  key: "zitronen@main",
  ingredientId: "zitronen",
  label: "Zitronen",
  forms: { one: "Zitrone", many: "Zitronen" },
  shoppingDate: "2026-11-23",
  place: "supermarket",
  trip: "main",
  neededBy: null,
  shopId: "aldi",
  aisleGroupId: "obst",
  purchase: { quantity: 2, unit: "Stück" },
  packs: null,
  amounts: [],
  hasUnquantified: false,
  contributions: [],
  note: null,
  defaultAtHome: false,
  optional: false,
  ...patch,
});

describe("exactText", () => {
  it("names the parts a whole is bought for", () => {
    const amounts = [
      { quantity: 1, unit: "Stück" as const },
      { quantity: 2, unit: "TL" as const, of: "Bio-Zitronenschale" },
    ];
    expect(exactText(resolveLine(line({ amounts })))).toBe("1 Stück + 2 TL Bio-Zitronenschale");
  });
});
