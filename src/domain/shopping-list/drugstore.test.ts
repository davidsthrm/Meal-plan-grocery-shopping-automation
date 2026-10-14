import { describe, expect, it } from "vitest";
import {
  drugstoreEntryFromText,
  DRUGSTORE_ITEMS,
  isDrugstoreItem,
  drugstoreLines,
  drugstoreSection,
  presentDrugstore,
  readDrugstoreEntry,
} from "./drugstore";

const SATURDAY = { date: "2026-10-17", place: "drugstore" as const };

describe("drugstoreSection", () => {
  it("sorts a typical item into its section of the shop", () => {
    expect(drugstoreSection("Duschgel")).toBe("koerper");
    expect(drugstoreSection("Shampoo")).toBe("haare");
    expect(drugstoreSection("Zahnbürste")).toBe("zaehne");
    expect(drugstoreSection("Waschmittel")).toBe("haushalt");
    expect(drugstoreSection("Windeln")).toBe("baby");
  });

  it("knows other words and spellings, whatever the case", () => {
    expect(drugstoreSection("deodorant")).toBe("koerper");
    expect(drugstoreSection("Klopapier")).toBe("haushalt");
    expect(drugstoreSection("Labello")).toBe("gesicht");
    expect(drugstoreSection("Zahncreme")).toBe("zaehne");
  });

  it("goes by the longest word it knows in what was written", () => {
    expect(drugstoreSection("Zahnpasta sensitiv")).toBe("zaehne");
    expect(drugstoreSection("Rasiergel")).toBe("koerper");
    expect(drugstoreSection("Duschgel Kids")).toBe("koerper");
  });

  it("puts what it does not know under Sonstiges", () => {
    expect(drugstoreSection("Geschenkpapier")).toBe("sonstiges");
    expect(drugstoreSection("")).toBe("sonstiges");
  });

  it("suggests every item only once", () => {
    const names = DRUGSTORE_ITEMS.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("readDrugstoreEntry", () => {
  it("reads what, how many and for whom", () => {
    expect(readDrugstoreEntry({ item: " Duschgel ", quantity: "2", forWhom: " Lena " })).toEqual({
      text: "Duschgel",
      quantity: 2,
      forWhom: "Lena",
    });
  });

  it("leaves out a quantity that is none, and an empty name", () => {
    expect(readDrugstoreEntry({ item: "Deo", quantity: "", forWhom: "" })).toEqual({
      text: "Deo",
      quantity: null,
      forWhom: null,
    });
    for (const quantity of ["0", "1.5", "100", "zwei"]) {
      expect(readDrugstoreEntry({ item: "Deo", quantity, forWhom: "" })?.quantity).toBeNull();
    }
  });

  it("adds nothing when no item was written", () => {
    expect(readDrugstoreEntry({ item: "  ", quantity: "2", forWhom: "Lena" })).toBeNull();
  });
});

describe("the drugstore's note", () => {
  const lines = drugstoreLines(
    [
      { id: "a", text: "Zahnpasta", quantity: 2, forWhom: null },
      { id: "b", text: "Duschgel", quantity: 1, forWhom: "Lena" },
      { id: "c", text: "Geschenkpapier", quantity: null, forWhom: null },
      { id: "d", text: "Deo", quantity: 1, forWhom: "Max" },
    ],
    SATURDAY,
    "dm",
  );

  it("writes every entry as a line: how many, what, for whom", () => {
    const view = presentDrugstore(lines, {});
    const text = view.groups.flatMap((group) => group.lines.map((line) => line.text));
    expect(text).toEqual(["1 Deo für Max", "1 Duschgel für Lena", "2 Zahnpasta", "Geschenkpapier"]);
  });

  it("lists the sections in the order of the shop, and only those with something", () => {
    const view = presentDrugstore(lines, {});
    expect(view.groups.map((group) => group.aisleGroup.name)).toEqual([
      "Körperpflege",
      "Zähne",
      "Sonstiges",
    ]);
    expect(view.atHome).toEqual([]);
  });

  it("keeps a line typed by hand: its key, its note, its tick", () => {
    expect(lines[0]).toMatchObject({
      key: "manual:a",
      shoppingDate: SATURDAY.date,
      place: "drugstore",
      neededBy: null,
    });
    const ticked = presentDrugstore(lines, { "manual:a": { checked: true } });
    const toothpaste = ticked.groups.flatMap((group) => group.lines).find((line) => line.checked);
    expect(toothpaste?.line.label).toBe("Zahnpasta");
  });
});

describe("an entry from the Merkzettel", () => {
  it("reads a number in front as how many", () => {
    expect(drugstoreEntryFromText("2 Zahnpasta")).toEqual({ text: "Zahnpasta", quantity: 2 });
    expect(drugstoreEntryFromText("3x Duschgel")).toEqual({ text: "Duschgel", quantity: 3 });
    expect(drugstoreEntryFromText("Deo")).toEqual({ text: "Deo", quantity: null });
    expect(drugstoreEntryFromText("0 Deo")).toEqual({ text: "0 Deo", quantity: null });
  });

  it("knows what the drugstore sells", () => {
    expect(isDrugstoreItem("2 Zahnpasta")).toBe(true);
    expect(isDrugstoreItem("Mehl")).toBe(false);
  });
});
