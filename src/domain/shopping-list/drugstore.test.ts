import { describe, expect, it } from "vitest";
import {
  carriedOver,
  drugstoreEntryFromText,
  DRUGSTORE_ITEMS,
  isDrugstoreItem,
  nextDrugstoreTrip,
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

  it("takes how many from the item where the field says no more than one", () => {
    expect(readDrugstoreEntry({ item: "zwei Zahnpasta", quantity: "1", forWhom: "" })).toEqual({
      text: "Zahnpasta",
      quantity: 2,
      forWhom: null,
    });
    expect(readDrugstoreEntry({ item: "2 Deo", quantity: "3", forWhom: "" })?.quantity).toBe(3);
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

  it("writes every entry as a line: how many where more than one, what, for whom", () => {
    const view = presentDrugstore(lines, {});
    const text = view.groups.flatMap((group) => group.lines.map((line) => line.text));
    expect(text).toEqual(["Deo für Max", "Duschgel für Lena", "2x Zahnpasta", "Geschenkpapier"]);
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

  it("reads how many written out in words", () => {
    expect(drugstoreEntryFromText("zwei Zahnpasta")).toEqual({ text: "Zahnpasta", quantity: 2 });
    expect(drugstoreEntryFromText("Drei Duschgel")).toEqual({ text: "Duschgel", quantity: 3 });
    expect(drugstoreEntryFromText("eine Zahnbürste")).toEqual({ text: "Zahnbürste", quantity: 1 });
    expect(drugstoreEntryFromText("fünf Rasierklingen")).toEqual({
      text: "Rasierklingen",
      quantity: 5,
    });
    expect(drugstoreEntryFromText("2 Stück Seife")).toEqual({ text: "Seife", quantity: 2 });
    // A word that is no number is part of what is meant.
    expect(drugstoreEntryFromText("Feuchte Tücher")).toEqual({
      text: "Feuchte Tücher",
      quantity: null,
    });
  });

  it("shows two of something as 2x, as the handwritten note does", () => {
    const [line] = drugstoreLines(
      [{ id: "z", ...drugstoreEntryFromText("zwei Zahnpasta"), forWhom: null }],
      SATURDAY,
      "dm",
    );
    expect(presentDrugstore([line], {}).groups[0].lines[0].text).toBe("2x Zahnpasta");
  });

  it("knows what the drugstore sells", () => {
    expect(isDrugstoreItem("2 Zahnpasta")).toBe(true);
    expect(isDrugstoreItem("Mehl")).toBe(false);
  });
});

describe("open entries of earlier drugstore notes", () => {
  const LAST_SATURDAY = { date: "2026-10-10", place: "drugstore" as const };
  const TODAY = "2026-10-14";
  const entry = (id: string, done: boolean, from = LAST_SATURDAY) => ({
    id,
    text: id,
    quantity: 1,
    forWhom: null,
    from,
    done,
  });

  it("come along to the next note while they are open and their day is over", () => {
    const carried = carriedOver(
      [entry("Deo", false), entry("Shampoo", true), entry("Seife", false, SATURDAY)],
      TODAY,
    );
    expect(carried).toEqual([
      { id: "Deo", text: "Deo", quantity: 1, forWhom: null, from: LAST_SATURDAY },
    ]);
  });

  it("go to the first drugstore note from today on, and keep where they were written", () => {
    const trips = [LAST_SATURDAY, { date: "2026-10-12", place: "supermarket" as const }, SATURDAY];
    expect(nextDrugstoreTrip(trips, TODAY)).toEqual(SATURDAY);
    expect(nextDrugstoreTrip(trips, "2026-10-18")).toBeNull();
    const [line] = drugstoreLines(carriedOver([entry("Deo", false)], TODAY), SATURDAY, "dm");
    expect(line).toMatchObject({ shoppingDate: SATURDAY.date, key: "manual:Deo" });
    expect(line.contributions[0].origin).toEqual(LAST_SATURDAY);
  });
});
