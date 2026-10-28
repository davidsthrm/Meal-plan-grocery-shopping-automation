import { describe, expect, it } from "vitest";
import { combinations, comboKey, spin } from "./roulette";
import { summary } from "./testing";

const groups = [
  {
    name: "Hauptzutat",
    tags: [
      { ref: "lachs", name: "Lachs & Forelle", group: "Hauptzutat" },
      { ref: "pilze", name: "Pilze", group: "Hauptzutat" },
    ],
  },
  {
    name: "Küche",
    tags: [
      { ref: "asiatisch", name: "Asiatisch", group: "Küche" },
      { ref: "italienisch", name: "Italienisch", group: "Küche" },
    ],
  },
];

const recipes = [
  summary("teriyaki", { tags: ["lachs", "asiatisch", "schnell"] }),
  summary("poke", { tags: ["lachs", "asiatisch"], prepMinutes: 20 }),
  summary("risotto", { tags: ["pilze", "italienisch", "aufwendig"] }),
  // Without a cuisine, or a cake: no combination.
  summary("rahm", { tags: ["pilze", "alltag"] }),
  summary("kuchen", { category: "kuchen", tags: ["pilze", "italienisch", "schnell"] }),
];

describe("combinations", () => {
  it("collects main ingredient, cuisine and effort of every meal, the effort from its time too", () => {
    expect(combinations(recipes, groups)).toEqual([
      { main: "lachs", cuisine: "asiatisch", effort: "schnell", recipes: ["teriyaki", "poke"] },
      { main: "pilze", cuisine: "italienisch", effort: "aufwendig", recipes: ["risotto"] },
    ]);
  });
});

describe("spin", () => {
  const combos = combinations(recipes, groups);

  it("draws a combination, another than the one shown", () => {
    const shown = comboKey(combos[0]);
    expect(spin(combos, {}, 0, shown)).toBe(combos[1]);
    expect(spin(combos, {}, 0.99, shown)).toBe(combos[1]);
  });

  it("keeps what is held, also when that leaves only the one shown", () => {
    const held = spin(combos, { main: "lachs" }, 0.5, comboKey(combos[0]));
    expect(held).toBe(combos[0]);
    expect(spin(combos, { cuisine: "mexikanisch" }, 0.5)).toBeNull();
  });
});
