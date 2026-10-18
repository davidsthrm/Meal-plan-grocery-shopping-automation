import { describe, expect, it } from "vitest";
import {
  byEdition,
  editionFromFolder,
  editionName,
  knownSources,
  placement,
  sourceLabel,
  splitSource,
  type KnownSource,
} from "./source";

const EH = "Einfach Hausgemacht";
const known: KnownSource[] = [
  { book: EH, editions: ["06/2020", "Jahresheft 2021"] },
  { book: "Speed Cooking", editions: [] },
  { book: "20 Minuten sind genug", editions: [] },
];

describe("editionName", () => {
  it("writes an issue as month and year in full", () => {
    expect(editionName("05/26")).toBe("05/2026");
    expect(editionName("6-2020")).toBe("06/2020");
    expect(editionName(" 05.2026 ")).toBe("05/2026");
  });

  it("leaves out the magazine's initials in front", () => {
    expect(editionName("EH 05/26", EH)).toBe("05/2026");
    expect(editionName("EH Jahresheft 2021", EH)).toBe("Jahresheft 2021");
  });

  it("keeps any other edition as written", () => {
    expect(editionName("Jahresheft 2021")).toBe("Jahresheft 2021");
    expect(editionName("Sommer spezial")).toBe("Sommer spezial");
  });
});

describe("splitSource", () => {
  it("finds the stack and the edition there are", () => {
    expect(splitSource("Einfach Hausgemacht 06/2020", known)).toEqual({
      book: EH,
      edition: "06/2020",
    });
    expect(splitSource("einfach hausgemacht 6/2020", known)).toEqual({
      book: EH,
      edition: "06/2020",
    });
    expect(splitSource("Einfach Hausgemacht Jahresheft 2021", known)).toEqual({
      book: EH,
      edition: "Jahresheft 2021",
    });
  });

  it("puts a new edition into the stack there is", () => {
    expect(splitSource("Einfach Hausgemacht 05/26", known)).toEqual({
      book: EH,
      edition: "05/2026",
    });
    expect(splitSource("EH 05/26", known)).toEqual({ book: EH, edition: "05/2026" });
    expect(splitSource("Einfach Hausgemacht, Sommer spezial", known)).toEqual({
      book: EH,
      edition: "Sommer spezial",
    });
  });

  it("makes a new stack from a name that ends in an edition", () => {
    expect(splitSource("Lecker 03/2024", [])).toEqual({ book: "Lecker", edition: "03/2024" });
    expect(splitSource("Einfach Hausgemacht Jahresheft 2021", [])).toEqual({
      book: EH,
      edition: "Jahresheft 2021",
    });
  });

  it("keeps a cookbook a cookbook", () => {
    expect(splitSource("Speed Cooking", known)).toEqual({ book: "Speed Cooking", edition: null });
    expect(splitSource("20 Minuten sind genug", known)).toEqual({
      book: "20 Minuten sind genug",
      edition: null,
    });
    expect(splitSource("Freude am Kochen", known)).toEqual({
      book: "Freude am Kochen",
      edition: null,
    });
    expect(splitSource("Einfach Hausgemacht", known)).toEqual({ book: EH, edition: null });
    expect(splitSource("  ", known)).toEqual({ book: "", edition: null });
  });
});

describe("editionFromFolder", () => {
  it("makes a batch's folder the edition of the stack typed above it", () => {
    expect(editionFromFolder("EH 05-26", EH, known)).toEqual({ book: EH, edition: "05/2026" });
    expect(editionFromFolder("Jahresheft 2022", EH, known)).toEqual({
      book: EH,
      edition: "Jahresheft 2022",
    });
  });

  it("finds the stack in the folder's name when nothing is typed", () => {
    expect(editionFromFolder("Einfach Hausgemacht 06-2020", "", known)).toEqual({
      book: EH,
      edition: "06/2020",
    });
    expect(editionFromFolder("Freude am Kochen", "", known)).toEqual({
      book: "Freude am Kochen",
      edition: null,
    });
  });

  it("leaves a cookbook typed above its folder as it is", () => {
    expect(editionFromFolder("Fotos Speed Cooking", "Speed Cooking", known)).toEqual({
      book: "Speed Cooking",
      edition: null,
    });
  });
});

describe("placement", () => {
  it("says which of stack and edition there are already", () => {
    expect(placement({ book: EH, edition: "06/2020" }, known)).toEqual({
      kind: "edition",
      book: EH,
      edition: "06/2020",
      bookKnown: true,
      editionKnown: true,
    });
    expect(placement({ book: EH, edition: "05/2026" }, known)).toMatchObject({
      bookKnown: true,
      editionKnown: false,
    });
    expect(placement({ book: "Lecker", edition: null }, known)).toEqual({
      kind: "book",
      book: "Lecker",
      known: false,
    });
    expect(placement({ book: "", edition: null }, known)).toEqual({ kind: "none" });
  });
});

describe("knownSources", () => {
  it("lists every book once with its editions in the order they appeared", () => {
    expect(
      knownSources([
        { book: EH, edition: "Jahresheft 2021" },
        { book: EH, edition: "06/2020" },
        { book: EH, edition: "05/2026" },
        { book: "Speed Cooking", edition: null },
        { book: EH, edition: "06/2020" },
        { book: null, edition: null },
      ]),
    ).toEqual([
      { book: EH, editions: ["06/2020", "Jahresheft 2021", "05/2026"] },
      { book: "Speed Cooking", editions: [] },
    ]);
  });

  it("orders issues by year and month", () => {
    expect(["11/2025", "02/2026", "06/2020"].sort(byEdition)).toEqual([
      "06/2020",
      "11/2025",
      "02/2026",
    ]);
  });
});

describe("sourceLabel", () => {
  it("writes a source as one name", () => {
    expect(sourceLabel(EH, "06/2020")).toBe("Einfach Hausgemacht 06/2020");
    expect(sourceLabel("Speed Cooking", null)).toBe("Speed Cooking");
    expect(sourceLabel(null, null)).toBe("");
  });
});
