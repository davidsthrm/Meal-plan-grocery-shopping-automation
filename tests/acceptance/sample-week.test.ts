import { describe, expect, it } from "vitest";
import inputs from "../fixtures/sample-week/inputs.json";
import { buildSampleWeek, isAccepted } from "./sample-week";

const week = buildSampleWeek();
const byStatus = (status: string) =>
  week.compared.filter((l) => l.status === status).map((l) => l.raw);

describe("sample week: generated list against the handwritten one", () => {
  it("accounts for all 21 handwritten lines", () => {
    expect(week.compared).toHaveLength(21);
    expect(byStatus("missing")).toEqual([]);
    expect(byStatus("different")).toEqual([]);
  });

  it("produces the lines that recipes and free entries explain today", () => {
    expect(byStatus("match")).toEqual([
      // Aldi
      "Frühl.zwiebeln",
      "Ingwer",
      "2 Karotten",
      "kl. Tomaten",
      "Mandarinen-Dose",
      "Sahne frisch",
      "H-Sahne",
      "Creme fraîche",
      // EC
      "Butter",
      "Milch WS 1.29",
      "Rauchsalami",
      "Brot",
    ]);
  });

  it("leaves exactly the lines open that wait for a recipe", () => {
    // When a pending recipe is added, its lines must move from here to the matches.
    expect(byStatus("pending").sort()).toEqual(Object.keys(inputs.pendingLines.lines).sort());
  });

  it("puts nothing on the Monday list that the household did not write down", () => {
    expect(week.extra).toEqual([]);
  });

  it("orders the lines by shop and aisle the way the household wrote them", () => {
    expect(week.outOfOrder).toEqual([]);
    expect(week.view.shops.map((s) => s.shop.shortLabel)).toEqual(["Aldi", "EC"]);
  });

  it("keeps Sunday's fresh ingredients for a later trip", () => {
    expect(week.later.actual).toEqual(["Champignons", "Kräuterseitlinge", "Rindersteaks"]);
    expect(week.later.actual).toEqual(week.later.expected);
    expect(week.view.later.every((v) => v.line.neededBy === "2026-10-18")).toBe(true);
  });

  it("pre-ticks the pantry staples the two recipes need", () => {
    const staples = week.view.atHome.filter((v) => v.line.defaultAtHome).map((v) => v.line.label);
    expect(staples).toEqual([
      "Gemüsebrühe",
      // One piece is named in the singular.
      "getrocknete Chilischote",
      "Hühnerbrühe",
      "Knoblauch",
      "Öl",
      "Pfeffer",
      "Rapsöl",
      "Salz",
      "Weißweinessig",
    ]);
  });

  it("is accepted as a whole", () => {
    expect(isAccepted(week)).toBe(true);
  });
});
