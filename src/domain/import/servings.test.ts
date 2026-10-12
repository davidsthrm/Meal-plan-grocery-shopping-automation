import { describe, expect, it } from "vitest";
import { meansPersons, readServingsLine, resolveServings } from "./servings";

const counted = (min: number, max: number, unit: string) => ({ kind: "counted", min, max, unit });

describe("readServingsLine", () => {
  it("recognises lines that count persons", () => {
    for (const line of [
      "Für 4 Personen",
      "Für 1 Person",
      "1 Portion",
      "für 2–3 Personen",
      "FÜR 4 PERSONEN",
      "Zutaten für 4 Portionen:",
      "4 Port.",
      "Für 4",
      "(für 6 Personen)",
      "Für vier Personen",
      "Für 4 Personen als Hauptgericht, für 6 als Vorspeise",
      "10 Teller Suppe",
      "Personen: 4",
      "4 (als Vorspeise 6)",
    ]) {
      expect(readServingsLine(line), line).toEqual({ kind: "persons" });
    }
  });

  it("reads what a recipe makes when that is not persons", () => {
    const lines: [string, ReturnType<typeof counted>][] = [
      ["Zutaten für 1 Springform (Ø 26 cm)", counted(1, 1, "Springform (Ø 26 cm)")],
      ["1 Springform (Ø 26 cm)", counted(1, 1, "Springform (Ø 26 cm)")],
      ["Für eine Kastenform", counted(1, 1, "Kastenform")],
      ["für 8 Stück", counted(8, 8, "Stück")],
      ["ca. 20 Stück", counted(20, 20, "Stück")],
      ["Ergibt etwa 30 Plätzchen.", counted(30, 30, "Plätzchen")],
      ["6–8 Waffeln", counted(6, 8, "Waffeln")],
      ["4 bis 6 Brötchen", counted(4, 6, "Brötchen")],
      ["12 Muffins", counted(12, 12, "Muffins")],
      ["für 1 kleines Baguette", counted(1, 1, "kleines Baguette")],
      ["4 Tartelett-Förmchen (Ø ca. 10 cm)", counted(4, 4, "Tartelett-Förmchen (Ø ca. 10 cm)")],
      ["Für 1 Blech (ca. 20 Stücke)", counted(1, 1, "Blech (ca. 20 Stücke)")],
      ["4 Portionsförmchen", counted(4, 4, "Portionsförmchen")],
    ];
    for (const [line, expected] of lines) expect(readServingsLine(line), line).toEqual(expected);
  });

  it("writes a line printed in capitals the normal way", () => {
    expect(readServingsLine("ZUTATEN FÜR 1 BACKBLECH")).toEqual(counted(1, 1, "Backblech"));
    expect(readServingsLine("ZUTATEN FÜR 8 STÜCK")).toEqual(counted(8, 8, "Stück"));
    expect(readServingsLine("ZUTATEN FÜR 1 RUNDE FORM (Ø 18 cm)")).toEqual(
      counted(1, 1, "runde Form (Ø 18 cm)"),
    );
    expect(readServingsLine("ZUTATEN FÜR 1 TORTE (Ø 26 CM)")).toEqual(
      counted(1, 1, "Torte (Ø 26 cm)"),
    );
  });

  it("assumes nothing about a line it cannot interpret", () => {
    for (const line of [
      "Springform 26 cm",
      "Ergibt 1,5 l",
      "12er-Muffinblech",
      "20 Min.",
      "320 kcal",
      "für die ganze Familie",
      "0 Stück",
      "8-6 Stück",
      `1 ${"sehr ".repeat(12)}lange Angabe`,
    ]) {
      expect(readServingsLine(line), line).toEqual({ kind: "unclear" });
    }
  });

  it("knows when nothing is printed", () => {
    expect(readServingsLine("")).toEqual({ kind: "none" });
    expect(readServingsLine("  ")).toEqual({ kind: "none" });
  });
});

describe("resolveServings", () => {
  it("takes number and unit from the line when it counts something other than persons", () => {
    // The model leaves the numbers empty for a cake tin, or puts the pieces there.
    expect(
      resolveServings({
        servingsMin: null,
        servingsMax: null,
        servingsRaw: "Zutaten für 1 Springform (Ø 26 cm)",
      }),
    ).toEqual({ min: 1, max: 1, unit: "Springform (Ø 26 cm)" });
    expect(
      resolveServings({
        servingsMin: 12,
        servingsMax: 12,
        servingsRaw: "Für 1 Blech (ca. 12 Stücke)",
      }),
    ).toEqual({ min: 1, max: 1, unit: "Blech (ca. 12 Stücke)" });
  });

  it("takes the numbers the model read when the line counts persons", () => {
    expect(
      resolveServings({ servingsMin: 4, servingsMax: 6, servingsRaw: "Für 4–6 Personen" }),
    ).toEqual({ min: 4, max: 6, unit: null });
    expect(resolveServings({ servingsMin: 2, servingsMax: 2, servingsRaw: "" })).toEqual({
      min: 2,
      max: 2,
      unit: null,
    });
  });

  it("never fills in persons the model did not read", () => {
    expect(
      resolveServings({ servingsMin: null, servingsMax: null, servingsRaw: "Für 4 Personen" }),
    ).toBeNull();
    expect(resolveServings({ servingsMin: null, servingsMax: null, servingsRaw: "" })).toBeNull();
  });
});

describe("meansPersons", () => {
  it("recognises the words for persons, whatever follows", () => {
    expect(meansPersons("Personen")).toBe(true);
    expect(meansPersons(" Portionen ")).toBe(true);
    expect(meansPersons("Pers.")).toBe(true);
    expect(meansPersons("Springform")).toBe(false);
    expect(meansPersons("Portionsförmchen")).toBe(false);
  });
});
