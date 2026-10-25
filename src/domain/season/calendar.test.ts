import { describe, expect, it } from "vitest";
import { ingredients } from "../../../supabase/seed/catalog";
import { seasonalFoods } from "../../../supabase/seed/seasons";
import {
  availability,
  foodFor,
  MONTHS,
  monthInSeason,
  monthsText,
  nextMonth,
  seasonFit,
  seasonTagOf,
  seasonWeight,
  type SeasonalFood,
} from "./calendar";

const food = (key: string) => seasonalFoods.find((entry) => entry.key === key) as SeasonalFood;
const named = (...names: string[]) => foodFor(seasonalFoods, names)?.key ?? null;

describe("the calendar data", () => {
  it("has every key once and only real months", () => {
    const keys = seasonalFoods.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of seasonalFoods) {
      expect(entry.fresh.length).toBeGreaterThan(0);
      for (const month of [...entry.fresh, ...(entry.stored ?? [])]) {
        expect(MONTHS).toContain(month);
      }
      // A month is fresh or stored, not both.
      expect(entry.fresh.filter((month) => entry.stored?.includes(month))).toEqual([]);
    }
  });

  it("finds the fresh fruit and vegetables of the seed catalog", () => {
    const fresh = ingredients.filter((entry) => entry.aisleGroupId === "obst");
    const found = new Map(fresh.map((entry) => [entry.id, named(entry.name, ...entry.synonyms)]));
    expect(found.get("kuerbis")).toBe("kuerbis");
    expect(found.get("kleine-tomaten")).toBe("tomaten");
    expect(found.get("karotten")).toBe("karotten");
    expect(found.get("blattspinat")).toBe("spinat");
    expect(found.get("feldsalat")).toBe("feldsalat");
    expect(found.get("weisskohl")).toBe("weisskohl");
    expect(found.get("aepfel")).toBe("aepfel");
    // Not from a German field.
    expect(found.get("zitronen")).toBeNull();
    expect(found.get("avocados")).toBeNull();
    expect(found.get("bananen")).toBeNull();
    // Grown all year round.
    expect(found.get("champignons")).toBeNull();
  });

  it("leaves tinned, frozen and dried products out", () => {
    const tinned = ingredients.filter((entry) => entry.aisleGroupId === "konserven");
    for (const entry of tinned.filter((entry) => /dose|tomaten|mais/i.test(entry.name))) {
      expect(named(entry.name, ...entry.synonyms), entry.name).toBeNull();
    }
    expect(named("TK-Erbsen")).toBeNull();
    expect(named("getrocknete Tomaten")).toBeNull();
    expect(named("Erbsen (TK)")).toBeNull();
  });
});

describe("foodFor", () => {
  it("finds a food in longer names and compounds", () => {
    expect(named("Hokkaido-Kürbis")).toBe("kuerbis");
    expect(named("Butternutkürbis")).toBe("kuerbis");
    expect(named("gelbe Paprika")).toBe("paprika");
    expect(named("Rispentomaten")).toBe("tomaten");
    expect(named("grüner Spargel")).toBe("spargel");
    expect(named("Sauerkirschen")).toBe("kirschen");
  });

  it("does not take what is made of it or ends the same way", () => {
    expect(named("Kürbiskerne")).toBeNull();
    expect(named("Kichererbsen")).toBeNull();
    expect(named("Kidneybohnen")).toBeNull();
    expect(named("Paprikapulver")).toBeNull();
    expect(named("Tomatenmark")).toBeNull();
    expect(named("Granatapfel")).toBeNull();
    expect(named("Sauerkraut")).toBeNull();
    expect(named("Meerrettich")).toBeNull();
    expect(named("Bärlauch")).toBe("baerlauch");
    expect(named("Schnittlauch")).toBe("schnittlauch");
  });

  it("prefers the longest name", () => {
    expect(named("Rosenkohl")).toBe("rosenkohl");
    expect(named("Frühlingszwiebeln")).toBe("fruehlingszwiebeln");
    expect(named("rote Zwiebeln")).toBe("zwiebeln");
    expect(named("Petersilienwurzel")).toBe("petersilienwurzel");
  });
});

describe("the season of a food", () => {
  it("knows fresh from stored", () => {
    expect(availability(food("kuerbis"), 10)).toBe("fresh");
    expect(availability(food("kuerbis"), 1)).toBe("stored");
    expect(availability(food("kuerbis"), 6)).toBeNull();
  });

  it("weighs a short season more than what is stored all year", () => {
    expect(seasonWeight(food("spargel"))).toBe(3);
    expect(seasonWeight(food("spinat"))).toBe(2);
    expect(seasonWeight(food("lauch"))).toBe(1);
    expect(seasonWeight(food("zwiebeln"))).toBe(0.5);
    expect(seasonWeight(food("aepfel"))).toBe(0.5);
    expect(seasonWeight(food("petersilie"))).toBe(0.5);
    expect(seasonWeight(food("baerlauch"))).toBe(3);
  });

  it("counts months round the year", () => {
    expect(nextMonth(12)).toBe(1);
    expect(nextMonth(1, -1)).toBe(12);
    expect(seasonTagOf(10)).toBe("herbst");
    expect(seasonTagOf(12)).toBe("winter");
    expect(seasonTagOf(3)).toBe("fruehling");
  });

  it("says the months in words", () => {
    expect(monthsText([7, 8, 9, 10])).toBe("Juli bis Oktober");
    expect(monthsText([11, 12, 1, 2])).toBe("November bis Februar");
    expect(monthsText([3, 4, 5, 9, 10, 11])).toBe("März bis Mai, September bis November");
    expect(monthsText([5])).toBe("Mai");
  });
});

describe("seasonFit", () => {
  it("fits a dish of what is harvested now", () => {
    const fit = seasonFit([food("kuerbis"), food("zwiebeln")], [], 10);
    expect(fit.fits).toBe(true);
    expect(fit.foods).toEqual(["Kürbis"]);
  });

  it("does not fit a dish of what is stored all year", () => {
    expect(seasonFit([food("zwiebeln"), food("karotten")], [], 2).fits).toBe(false);
  });

  it("counts the season's tag", () => {
    expect(seasonFit([], ["herbst"], 10).fits).toBe(true);
    expect(seasonFit([], ["herbst"], 4).fits).toBe(false);
  });

  it("never fits with something of a short season outside it", () => {
    expect(seasonFit([food("kuerbis"), food("spargel")], ["herbst"], 10).fits).toBe(false);
    expect(seasonFit([food("erdbeeren")], [], 11).fits).toBe(false);
  });

  it("names a food once", () => {
    expect(seasonFit([food("kuerbis"), food("kuerbis")], [], 10).foods).toEqual(["Kürbis"]);
  });
});

describe("monthInSeason", () => {
  it("tells what arrives, what is ripe and what leaves", () => {
    const october = monthInSeason(seasonalFoods, 10);
    const keys = (list: SeasonalFood[]) => list.map((entry) => entry.key);
    expect(keys(october.arriving)).toEqual(
      expect.arrayContaining(["feldsalat", "rosenkohl", "pastinaken"]),
    );
    expect(keys(october.leaving)).toEqual(expect.arrayContaining(["tomaten", "zucchini"]));
    expect(keys(october.ripe)).toEqual(expect.arrayContaining(["kuerbis", "aepfel"]));
    expect(keys(october.stored)).toContain("knoblauch");
    expect(keys(october.leaving)).toContain("zwiebeln");
    expect(keys(october.ripe)).not.toContain("tomaten");
  });
});
