import { describe, expect, it } from "vitest";
import { isOn, pendingHref, tap, type ChoiceGroup } from "./pending-choices";

const time: ChoiceGroup = {
  key: "zeit",
  single: true,
  choices: [
    { key: "zeit-20", on: false, href: "/rezepte?zeit=20" },
    { key: "zeit-30", on: false, href: "/rezepte?zeit=30" },
  ],
};
const diet: ChoiceGroup = {
  key: "kost",
  single: true,
  choices: [
    { key: "kost-vegetarisch", on: false, href: "/rezepte?kost=vegetarisch" },
    { key: "kost-fisch", on: false, href: "/rezepte?kost=fisch" },
  ],
};

/** The search part of an address, the tags in any order. */
function query(href: string): Record<string, string> {
  const params = Object.fromEntries(new URL(href, "http://app").searchParams);
  if (params.tag) params.tag = params.tag.split(",").sort().join(",");
  return params;
}

describe("choices tapped before the server answers", () => {
  it("keeps the first choice when a second follows at once", () => {
    // The probe tapped Vegetarisch and "bis 30 Min." 80 ms apart and ended with only zeit=30.
    const groups = [time, diet];
    const both = tap(tap([], diet, "kost-vegetarisch"), time, "zeit-30");
    expect(query(pendingHref("/rezepte", groups, both))).toEqual({
      kost: "vegetarisch",
      zeit: "30",
    });
    expect(isOn(both, diet, "kost-vegetarisch")).toBe(true);
    expect(isOn(both, time, "zeit-30")).toBe(true);
    expect(isOn(both, time, "zeit-20")).toBe(false);
  });

  it("leads a single tap where the choice's own link leads", () => {
    const now = "/rezepte?art=hauptgericht&n=120";
    expect(query(pendingHref(now, [time, diet], tap([], diet, "kost-fisch")))).toEqual(
      query("/rezepte?kost=fisch"),
    );
    expect(pendingHref("/rezepte", [time, diet], [])).toBe("/rezepte");
  });

  it("replaces the choice of a group of one, also one still on its way", () => {
    const on: ChoiceGroup = {
      ...time,
      choices: [
        { key: "zeit-20", on: true, href: "/rezepte" },
        { key: "zeit-30", on: false, href: "/rezepte?zeit=30" },
      ],
    };
    const now = "/rezepte?zeit=20";
    expect(query(pendingHref(now, [on], tap([], on, "zeit-30")))).toEqual({ zeit: "30" });
    // Tapped again, the new one is off, and so is the one it replaced.
    const off = tap(tap([], on, "zeit-30"), on, "zeit-30");
    expect(isOn(off, on, "zeit-30")).toBe(false);
    expect(isOn(off, on, "zeit-20")).toBe(false);
    expect(query(pendingHref(now, [on], off))).toEqual({});
    // The one that was on, tapped while another is on its way: it is on again.
    const again = tap(tap([], on, "zeit-30"), on, "zeit-20");
    expect(isOn(again, on, "zeit-20")).toBe(true);
    expect(query(pendingHref(now, [on], again))).toEqual({ zeit: "20" });
  });

  it("adds and takes away tags one by one, keeping the others", () => {
    const main: ChoiceGroup = {
      key: "gruppe-Hauptzutat",
      single: false,
      choices: [
        { key: "tag-pilze", on: true, href: "/rezepte?tag=herbst" },
        { key: "tag-lachs", on: false, href: "/rezepte?tag=pilze%2Cherbst%2Clachs" },
      ],
    };
    const dish: ChoiceGroup = {
      key: "gruppe-Gericht",
      single: false,
      choices: [{ key: "tag-pasta", on: false, href: "/rezepte?tag=pilze%2Cherbst%2Cpasta" }],
    };
    const now = "/rezepte?tag=pilze%2Cherbst";
    const tapped = tap(tap(tap([], main, "tag-lachs"), dish, "tag-pasta"), main, "tag-pilze");
    expect(isOn(tapped, main, "tag-pilze")).toBe(false);
    expect(isOn(tapped, main, "tag-lachs")).toBe(true);
    expect(query(pendingHref(now, [main, dish], tapped))).toEqual({ tag: "herbst,lachs,pasta" });
  });

  it("leaves no empty tag behind when the last one goes", () => {
    const main: ChoiceGroup = {
      key: "gruppe-Hauptzutat",
      single: false,
      choices: [{ key: "tag-pilze", on: true, href: "/rezepte" }],
    };
    expect(pendingHref("/rezepte?tag=pilze", [main], tap([], main, "tag-pilze"))).toBe("/rezepte");
  });
});
