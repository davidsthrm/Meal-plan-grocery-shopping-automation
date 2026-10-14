import { describe, expect, it } from "vitest";
import {
  commonsImageUrl,
  distanceKm,
  pickSupermarkets,
  readLogoFiles,
  readPostalArea,
  readPostalCode,
  type OverpassElement,
} from "./supermarket-search";

describe("readPostalCode", () => {
  it("takes five digits, also typed with spaces", () => {
    expect(readPostalCode("88471")).toBe("88471");
    expect(readPostalCode(" 88 471 ")).toBe("88471");
  });

  it("takes nothing else", () => {
    expect(readPostalCode("")).toBeNull();
    expect(readPostalCode("8847")).toBeNull();
    expect(readPostalCode("Laupheim")).toBeNull();
    expect(readPostalCode("884711")).toBeNull();
  });
});

describe("readPostalArea", () => {
  // The shape of Nominatim's answer to ?postalcode=…&country=de&format=json&addressdetails=1.
  const answer = [
    {
      lat: "48.229",
      lon: "9.879",
      boundingbox: ["48.17", "48.29", "9.80", "9.96"],
      address: { postcode: "88471", town: "Laupheim", state: "Baden-Württemberg" },
    },
  ];

  it("reads the middle, the rectangle and the place of a postal code", () => {
    expect(readPostalArea(answer)).toEqual({
      center: { lat: 48.229, lon: 9.879 },
      box: [48.17, 9.8, 48.29, 9.96],
      place: "Laupheim",
    });
  });

  it("takes about five kilometres around the middle without a rectangle", () => {
    const area = readPostalArea([{ ...answer[0], boundingbox: undefined }]);
    expect(area?.box[0]).toBeCloseTo(48.184);
    expect(area?.box[3]).toBeCloseTo(9.949);
  });

  it("finds nothing in an empty answer", () => {
    expect(readPostalArea([])).toBeNull();
    expect(readPostalArea({ error: "x" })).toBeNull();
  });
});

describe("pickSupermarkets", () => {
  const center = { lat: 48.229, lon: 9.879 };
  const shop = (
    name: string | undefined,
    lat: number,
    extra: Record<string, string> = {},
  ): OverpassElement => ({
    type: "node",
    lat,
    lon: 9.879,
    tags: { shop: "supermarket", ...(name ? { name } : {}), ...extra },
  });

  it("offers the nearest five, each name once, nearest first", () => {
    const found = pickSupermarkets(
      [
        shop("Lidl", 48.239, {
          "brand:wikidata": "Q151954",
          "addr:street": "Ulmer Straße",
          "addr:housenumber": "3",
        }),
        shop("Lidl", 48.231),
        shop("EDEKA Kohler", 48.25),
        shop("ALDI SÜD", 48.228),
        shop("Kaufland", 48.26),
        shop("REWE", 48.27),
        shop("Netto Marken-Discount", 48.3),
        shop(undefined, 48.229),
      ],
      center,
    );
    expect(found.map((each) => each.name)).toEqual([
      "ALDI SÜD",
      "Lidl",
      "EDEKA Kohler",
      "Kaufland",
      "REWE",
    ]);
    // The nearer Lidl is the one offered; it has no street on the map.
    expect(found[1]).toMatchObject({ address: null, brandWikidata: null });
  });

  it("takes the brand where a shop has no name, and a building by its middle", () => {
    const building: OverpassElement = {
      type: "way",
      center: { lat: 48.24, lon: 9.88 },
      tags: { brand: "PENNY", "brand:wikidata": "Q284688", "addr:street": "Bahnhofstraße" },
    };
    expect(pickSupermarkets([building], center)).toEqual([
      {
        name: "PENNY",
        address: "Bahnhofstraße",
        brandWikidata: "Q284688",
        distanceKm: distanceKm(center, { lat: 48.24, lon: 9.88 }),
      },
    ]);
  });
});

describe("distanceKm", () => {
  it("measures along the earth", () => {
    // One hundredth of a degree of latitude is about 1.1 km.
    expect(distanceKm({ lat: 48.22, lon: 9.88 }, { lat: 48.23, lon: 9.88 })).toBeCloseTo(1.11, 2);
  });
});

describe("logos", () => {
  it("reads each chain's logo file from Wikidata's answer", () => {
    const answer = {
      entities: {
        Q151954: {
          claims: { P154: [{ mainsnak: { datavalue: { value: "Lidl-Logo.svg" } } }] },
        },
        Q125054: { claims: {} },
      },
    };
    expect(readLogoFiles(answer)).toEqual(new Map([["Q151954", "Lidl-Logo.svg"]]));
    expect(readLogoFiles(null)).toEqual(new Map());
  });

  it("links a small picture of the file on Wikimedia Commons", () => {
    expect(commonsImageUrl("Aldi Süd 2017 logo.svg")).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Aldi_S%C3%BCd_2017_logo.svg?width=128",
    );
  });
});
