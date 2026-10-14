import { describe, expect, it } from "vitest";
import { groupAtHome, noteToBuyOn, type AtHomeLine } from "./at-home";
import { resolveLine } from "./present";
import { testIndex } from "./test-catalog";
import { DEFAULT_SHOPPING_DAYS, withDrugstore } from "./trips";
import type { ShoppingLine } from "./types";

const MONDAY = { date: "2026-10-12", place: "supermarket" as const };
const FRIDAY = { date: "2026-10-16", place: "supermarket" as const };
const WEDNESDAY = "2026-10-14";

function atHome(key: string, label: string, aisleGroupId: string, trip = MONDAY): AtHomeLine {
  const line: ShoppingLine = {
    key,
    ingredientId: key,
    label,
    shoppingDate: trip.date,
    place: trip.place,
    trip: "main",
    neededBy: null,
    shopId: "ec",
    aisleGroupId,
    purchase: null,
    amounts: [],
    hasUnquantified: true,
    contributions: [],
    note: null,
    defaultAtHome: true,
    optional: false,
  };
  return { trip, line: resolveLine(line) };
}

describe("groupAtHome", () => {
  it("lists every thing once, by kind of grocery in the household's order", () => {
    const groups = groupAtHome(
      [
        atHome("salz@main", "Salz", "gewuerze"),
        atHome("butter@main", "Butter", "molkerei"),
        atHome("salz@later", "Salz", "gewuerze"),
        atHome("salz@main", "Salz", "gewuerze", FRIDAY),
        atHome("pfeffer@main", "Pfeffer", "gewuerze"),
        atHome("x", "Kerzen", "unbekannt"),
      ],
      testIndex,
    );
    expect(
      groups.map((group) => [group.aisleGroup.name, group.items.map((item) => item.label)]),
    ).toEqual([
      ["Gewürze, Öl & Essig", ["Pfeffer", "Salz"]],
      ["Molkerei & Kühlregal", ["Butter"]],
      ["Sonstiges", ["Kerzen"]],
    ]);
    // "Doch kaufen" on Salz takes back every line it stands for.
    expect(groups[0].items[1].lines).toHaveLength(3);
  });
});

describe("noteToBuyOn", () => {
  const days = withDrugstore(DEFAULT_SHOPPING_DAYS, 6);

  it("keeps a thing on its own note while that errand is still to come", () => {
    expect(noteToBuyOn(FRIDAY, WEDNESDAY, days, null)).toEqual(FRIDAY);
    expect(noteToBuyOn(FRIDAY, FRIDAY.date, days, null)).toEqual(FRIDAY);
  });

  it("puts it on the next errand from today on that sells it when its own is over", () => {
    expect(noteToBuyOn(MONDAY, WEDNESDAY, days, null)).toEqual(FRIDAY);
    expect(noteToBuyOn(MONDAY, "2026-10-17", days, "market")).toEqual({
      date: "2026-10-17",
      place: "market",
    });
  });
});
